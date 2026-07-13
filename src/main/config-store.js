const { randomUUID } = require('node:crypto');
const Store = require('electron-store');
const { DEFAULT_SITES } = require('./default-sites');
const { createConfigRepository } = require('./config-repository');

const DEFAULT_SETTINGS = {
  maxActiveTabs: 3,
  idleTimeout: 30000,
  hibernateDelay: 10000,
  autoLaunch: false,
  minimizeToTray: true,
  globalHotkey: 'Ctrl+Shift+Space',
  customContextMenu: true,
  showBadges: true,
  defaultProxyMode: 'system',
  defaultProxy: ''
};

const store = new Store({
  name: 'config',
  defaults: {
    sites: DEFAULT_SITES,
    settings: DEFAULT_SETTINGS,
    activeSite: null,
    activeAccount: null
  }
});

function migrateAccountIsolation() {
  const sites = store.get('sites', []);
  const seenPartitions = new Set();
  let changed = false;
  const activeSite = store.get('activeSite', null);
  const activeAccount = store.get('activeAccount', null);

  for (const site of sites) {
    for (const account of site.accounts || []) {
      if (account.partition && !seenPartitions.has(account.partition)) {
        seenPartitions.add(account.partition);
        continue;
      }

      const oldAccountId = account.id;
      const newAccountId = `${site.id}-${randomUUID()}`;
      account.id = newAccountId;
      account.partition = `persist:${newAccountId}`;
      seenPartitions.add(account.partition);
      changed = true;

      if (activeSite === site.id && activeAccount === oldAccountId) {
        store.set('activeAccount', newAccountId);
      }
    }
  }

  if (changed) store.set('sites', sites);
}

migrateAccountIsolation();

const repository = createConfigRepository(store, { defaultSettings: DEFAULT_SETTINGS });

function migrateFaviconUrls() {
  for (const site of repository.getSites()) {
    const defaultSite = DEFAULT_SITES.find(candidate => candidate.id === site.id);
    const legacyRemoteUrl = /^https?:\/\//i.test(site.faviconUrl || '')
      ? site.faviconUrl
      : null;
    const sourceUrl = legacyRemoteUrl
      || defaultSite?.faviconSourceUrl
      || defaultSite?.faviconUrl;
    if (!site.faviconSourceUrl && sourceUrl) {
      try {
        repository.updateSite(site.id, { faviconSourceUrl: sourceUrl });
      } catch (error) {
        console.warn(`Skipped favicon migration for ${site.id}:`, error.message);
      }
    }
  }
}

migrateFaviconUrls();

module.exports = {
  ...repository,
  getConfigPath: () => store.path
};
