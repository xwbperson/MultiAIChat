const test = require('node:test');
const assert = require('node:assert/strict');

const { createConfigRepository } = require('../src/main/config-repository');

class MemoryStore {
  constructor(initial = {}) {
    this.data = structuredClone(initial);
  }

  get(key, fallback) {
    return this.data[key] === undefined ? structuredClone(fallback) : structuredClone(this.data[key]);
  }

  set(key, value) {
    this.data[key] = structuredClone(value);
  }
}

function createRepository(initial = {}) {
  let sequence = 0;
  const store = new MemoryStore({
    sites: [],
    settings: {},
    activeSite: null,
    activeAccount: null,
    ...initial
  });

  return createConfigRepository(store, {
    createId: (prefix) => `${prefix}-${++sequence}`
  });
}

test('new sites always receive isolated session partitions', () => {
  const repository = createRepository();

  const first = repository.addSite({ name: 'First', url: 'https://first.example' });
  const second = repository.addSite({ name: 'Second', url: 'https://second.example' });

  assert.notEqual(first.id, second.id);
  assert.notEqual(first.accounts[0].id, second.accounts[0].id);
  assert.notEqual(first.accounts[0].partition, second.accounts[0].partition);
  assert.equal(first.accounts[0].partition, `persist:${first.accounts[0].id}`);
  assert.equal(second.accounts[0].partition, `persist:${second.accounts[0].id}`);
});

test('new accounts receive unique ids and matching persistent partitions', () => {
  const repository = createRepository();
  const site = repository.addSite({ name: 'Chat', url: 'https://chat.example' });

  const personal = repository.addAccount(site.id, { label: 'Personal' });
  const work = repository.addAccount(site.id, { label: 'Work' });

  assert.notEqual(personal.id, work.id);
  assert.equal(personal.partition, `persist:${personal.id}`);
  assert.equal(work.partition, `persist:${work.id}`);
});

test('site reorder persists the requested sequence in one repository operation', () => {
  const repository = createRepository();
  const first = repository.addSite({ name: 'First', url: 'https://first.example' });
  const second = repository.addSite({ name: 'Second', url: 'https://second.example' });
  const third = repository.addSite({ name: 'Third', url: 'https://third.example' });

  const reordered = repository.reorderSites([third.id, first.id, second.id]);

  assert.deepEqual(reordered.map(site => site.name), ['Third', 'First', 'Second']);
  assert.deepEqual(reordered.map(site => site.order), [0, 1, 2]);
  assert.deepEqual(repository.getSites(), reordered);
});

test('site reorder rejects incomplete sequences without changing configuration', () => {
  const repository = createRepository();
  const first = repository.addSite({ name: 'First', url: 'https://first.example' });
  const second = repository.addSite({ name: 'Second', url: 'https://second.example' });
  const original = repository.getSites();

  assert.throws(
    () => repository.reorderSites([first.id, first.id]),
    /every site exactly once/i
  );
  assert.throws(
    () => repository.reorderSites([first.id, 'missing-site']),
    /unknown site/i
  );
  assert.deepEqual(repository.getSites(), original);
  assert.equal(second.order, 1);
});

test('individual site updates cannot create a partial site order', () => {
  const repository = createRepository();
  const first = repository.addSite({ name: 'First', url: 'https://first.example' });
  repository.addSite({ name: 'Second', url: 'https://second.example' });

  assert.throws(
    () => repository.updateSite(first.id, { order: 1 }),
    /unsupported site field/i
  );
  assert.deepEqual(repository.getSites().map(site => site.order), [0, 1]);
});

test('sites reject non-web URLs before they reach Electron', () => {
  const repository = createRepository();

  assert.throws(
    () => repository.addSite({ name: 'Unsafe', url: 'javascript:alert(1)' }),
    /http or https/i
  );
  assert.equal(repository.getSites().length, 0);
});

test('favicon cache and remote source addresses persist independently', () => {
  const repository = createRepository();
  const sourceUrl = 'https://icons.example/chat.ico';
  const site = repository.addSite({
    name: 'Chat',
    url: 'https://chat.example',
    faviconUrl: sourceUrl,
    faviconSourceUrl: sourceUrl
  });

  repository.updateSite(site.id, {
    faviconUrl: 'file:///favicons/chat.ico',
    faviconSourceUrl: sourceUrl
  });

  const exported = JSON.parse(repository.exportConfig()).sites[0];
  assert.equal(exported.faviconUrl, 'file:///favicons/chat.ico');
  assert.equal(exported.faviconSourceUrl, sourceUrl);

  repository.updateSite(site.id, { faviconUrl: null, faviconSourceUrl: null });
  assert.equal(repository.getSites()[0].faviconUrl, null);
  assert.equal(repository.getSites()[0].faviconSourceUrl, null);
  assert.throws(
    () => repository.updateSite(site.id, { faviconSourceUrl: 'file:///icons/chat.ico' }),
    /http or https/i
  );
});

test('removing the last account is rejected without changing configuration', () => {
  const repository = createRepository();
  const site = repository.addSite({ name: 'Chat', url: 'https://chat.example' });

  assert.throws(
    () => repository.removeAccount(site.id, site.accounts[0].id),
    /last account/i
  );
  assert.deepEqual(repository.getSites()[0].accounts, site.accounts);
});

test('clearing sites returns cleanup targets and resets the active selection', () => {
  const repository = createRepository();
  const site = repository.addSite({ name: 'Chat', url: 'https://chat.example' });
  repository.setActiveState(site.id, site.accounts[0].id);

  const removedSites = repository.clearSites();

  assert.equal(removedSites.length, 1);
  assert.equal(repository.getSites().length, 0);
  assert.deepEqual(repository.getActiveState(), { siteId: null, accountId: null });
});

test('import merges site metadata while preserving existing session partitions', () => {
  const repository = createRepository();
  const existing = repository.addSite({ name: 'Old name', url: 'https://old.example' });
  repository.addAccount(existing.id, { label: 'Work' });
  const originalAccounts = repository.getSites()[0].accounts;

  const result = repository.importConfig(JSON.stringify({
    version: 1,
    sites: [
      {
        id: existing.id,
        name: 'New name',
        url: 'https://new.example',
        accountLabels: ['Must not replace existing accounts']
      },
      {
        id: 'imported-site',
        name: 'Imported',
        url: 'https://imported.example',
        accountLabels: ['Personal', 'Work']
      }
    ]
  }));

  const sites = repository.getSites();
  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
  assert.equal(sites[0].name, 'New name');
  assert.deepEqual(sites[0].accounts, originalAccounts);
  assert.equal(sites[1].accounts.length, 2);
  assert.notEqual(sites[1].accounts[0].partition, sites[1].accounts[1].partition);
});

test('custom default proxy settings are persisted as a validated pair', () => {
  const repository = createRepository();

  const settings = repository.updateSettings({
    defaultProxyMode: 'custom',
    defaultProxy: 'http://127.0.0.1:7890'
  });

  assert.equal(settings.defaultProxyMode, 'custom');
  assert.equal(settings.defaultProxy, 'http://127.0.0.1:7890');
  assert.deepEqual(repository.getSettings(), settings);
});

test('site metadata updates cannot overwrite account isolation data', () => {
  const repository = createRepository();
  const site = repository.addSite({ name: 'Chat', url: 'https://chat.example' });

  assert.throws(
    () => repository.updateSite(site.id, { accounts: [] }),
    /unsupported site field/i
  );
  assert.equal(repository.getSites()[0].accounts.length, 1);

  const renamed = repository.renameAccount(site.id, site.accounts[0].id, 'Personal');
  assert.equal(renamed.label, 'Personal');
  assert.equal(repository.getSites()[0].accounts[0].partition, site.accounts[0].partition);
});

test('settings reject wrong value types instead of silently changing meaning', () => {
  const repository = createRepository();

  assert.throws(
    () => repository.updateSettings({ showBadges: 'false' }),
    /boolean/i
  );
  assert.equal(repository.getSettings().showBadges, undefined);
});
