const { randomUUID } = require('node:crypto');

function defaultCreateId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function normalizeWebUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error('Site URL must be a valid http or https URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Site URL must be a valid http or https URL');
  }
  return parsed.toString();
}

function normalizeId(value, label = 'ID') {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) {
    throw new Error(`${label} contains unsupported characters`);
  }
  return id;
}

function normalizeText(value, label, fallback, maxLength = 80) {
  const text = String(value ?? fallback ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > maxLength) throw new Error(`${label} is too long`);
  return text;
}

function normalizeProxy(value) {
  const proxy = String(value || '').trim();
  if (!proxy || proxy === 'direct' || proxy === 'system') return proxy;

  let parsed;
  try {
    parsed = new URL(proxy);
  } catch {
    throw new Error('Proxy must be direct, system, or a valid proxy URL');
  }
  if (!['http:', 'https:', 'socks:', 'socks4:', 'socks5:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('Proxy must be direct, system, or a valid proxy URL');
  }
  return proxy;
}

function normalizeSiteMetadata(input, fallback = {}) {
  const color = String(input.color ?? fallback.color ?? '#89b4fa');
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Site color must be a six-digit hex color');

  const faviconUrl = input.faviconUrl !== undefined
    ? input.faviconUrl
    : fallback.faviconUrl ?? null;
  if (faviconUrl) {
    let parsed;
    try {
      parsed = new URL(String(faviconUrl));
    } catch {
      throw new Error('Favicon URL is invalid');
    }
    if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) {
      throw new Error('Favicon URL uses an unsupported protocol');
    }
  }

  const faviconSourceUrl = input.faviconSourceUrl !== undefined
    ? input.faviconSourceUrl
    : fallback.faviconSourceUrl ?? null;
  if (faviconSourceUrl) {
    let parsed;
    try {
      parsed = new URL(String(faviconSourceUrl));
    } catch {
      throw new Error('Favicon source URL is invalid');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Favicon source URL must use http or https');
    }
  }

  const shortcut = input.shortcut !== undefined ? input.shortcut : fallback.shortcut;
  return {
    name: normalizeText(input.name, 'Site name', fallback.name),
    url: normalizeWebUrl(input.url ?? fallback.url),
    color,
    icon: normalizeText(input.icon, 'Site icon', fallback.icon || '🌐', 32),
    faviconUrl: faviconUrl ? String(faviconUrl) : null,
    faviconSourceUrl: faviconSourceUrl ? String(faviconSourceUrl) : null,
    proxy: normalizeProxy(input.proxy ?? fallback.proxy ?? ''),
    shortcut: shortcut ? normalizeText(shortcut, 'Shortcut', null, 64) : null
  };
}

function normalizeSettings(current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Settings update must be an object');
  }

  const next = { ...current };
  const booleanKeys = [
    'autoLaunch',
    'minimizeToTray',
    'customContextMenu',
    'showBadges'
  ];
  for (const key of booleanKeys) {
    if (patch[key] === undefined) continue;
    if (typeof patch[key] !== 'boolean') throw new Error(`${key} must be a boolean`);
    next[key] = patch[key];
  }

  const boundedIntegers = {
    maxActiveTabs: [1, 20],
    idleTimeout: [10000, 3600000],
    hibernateDelay: [0, 300000]
  };
  for (const [key, [minimum, maximum]] of Object.entries(boundedIntegers)) {
    if (patch[key] === undefined) continue;
    const value = Number(patch[key]);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(`${key} must be an integer between ${minimum} and ${maximum}`);
    }
    next[key] = value;
  }

  if (patch.globalHotkey !== undefined) {
    next.globalHotkey = patch.globalHotkey
      ? normalizeText(patch.globalHotkey, 'Global hotkey', null, 64)
      : '';
  }

  if (patch.defaultProxyMode !== undefined) {
    const mode = String(patch.defaultProxyMode);
    if (!['direct', 'system', 'custom'].includes(mode)) {
      throw new Error('defaultProxyMode must be direct, system, or custom');
    }
    next.defaultProxyMode = mode;
  }
  if (patch.defaultProxy !== undefined) {
    next.defaultProxy = normalizeProxy(patch.defaultProxy);
  }
  if (next.defaultProxyMode === 'custom' && !next.defaultProxy) {
    throw new Error('A custom default proxy address is required');
  }
  return next;
}

function createConfigRepository(store, options = {}) {
  const createId = options.createId || defaultCreateId;
  const defaultSettings = options.defaultSettings || {};

  function getSites() {
    return store.get('sites', []);
  }

  function addSite(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Site configuration must be an object');
    }
    const sites = getSites();
    const siteId = createId('site');
    const accountId = createId(siteId);
    const metadata = normalizeSiteMetadata(input);
    const site = {
      id: siteId,
      ...metadata,
      order: sites.length,
      accounts: [
        {
          id: accountId,
          label: '默认',
          partition: `persist:${accountId}`,
          isDefault: true
        }
      ]
    };

    sites.push(site);
    store.set('sites', sites);
    return site;
  }

  function addAccount(siteId, input) {
    const sites = getSites();
    const site = sites.find(candidate => candidate.id === siteId);
    if (!site) throw new Error(`Site not found: ${siteId}`);

    const accountId = createId(siteId);
    const account = {
      id: accountId,
      label: normalizeText(input?.label, 'Account label', `账号 ${site.accounts.length + 1}`),
      partition: `persist:${accountId}`,
      isDefault: false
    };

    site.accounts.push(account);
    store.set('sites', sites);
    return account;
  }

  function updateSite(siteId, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new Error('Site update must be an object');
    }
    const allowedFields = new Set([
      'name', 'url', 'color', 'icon', 'faviconUrl', 'faviconSourceUrl', 'proxy', 'shortcut'
    ]);
    for (const key of Object.keys(patch || {})) {
      if (!allowedFields.has(key)) throw new Error(`Unsupported site field: ${key}`);
    }

    const sites = getSites();
    const index = sites.findIndex(candidate => candidate.id === siteId);
    if (index === -1) throw new Error(`Site not found: ${siteId}`);

    const existing = sites[index];
    const metadata = normalizeSiteMetadata({ ...existing, ...patch }, existing);
    sites[index] = { ...existing, ...metadata };
    store.set('sites', sites);
    return sites[index];
  }

  function reorderSites(siteIds) {
    if (!Array.isArray(siteIds)) throw new Error('Site order must be an array');

    const sites = getSites();
    const sitesById = new Map(sites.map(site => [site.id, site]));
    const uniqueIds = new Set(siteIds);
    if (siteIds.length !== sites.length || uniqueIds.size !== sites.length) {
      throw new Error('Site order must contain every site exactly once');
    }

    const reordered = siteIds.map(siteId => sitesById.get(siteId));
    if (reordered.some(site => !site)) {
      throw new Error('Site order contains an unknown site');
    }
    reordered.forEach((site, order) => {
      site.order = order;
    });
    store.set('sites', reordered);
    return reordered;
  }

  function deleteSite(siteId) {
    const sites = getSites();
    const index = sites.findIndex(candidate => candidate.id === siteId);
    if (index === -1) throw new Error(`Site not found: ${siteId}`);
    const [removed] = sites.splice(index, 1);
    sites.forEach((site, order) => {
      site.order = order;
    });
    store.set('sites', sites);

    const active = getActiveState();
    if (active.siteId === siteId) setActiveState(null, null);
    return removed;
  }

  function renameAccount(siteId, accountId, label) {
    const sites = getSites();
    const site = sites.find(candidate => candidate.id === siteId);
    if (!site) throw new Error(`Site not found: ${siteId}`);
    const account = site.accounts.find(candidate => candidate.id === accountId);
    if (!account) throw new Error(`Account not found: ${accountId}`);

    account.label = normalizeText(label, 'Account label', null);
    store.set('sites', sites);
    return account;
  }

  function removeAccount(siteId, accountId) {
    const sites = getSites();
    const site = sites.find(candidate => candidate.id === siteId);
    if (!site) throw new Error(`Site not found: ${siteId}`);

    const account = site.accounts.find(candidate => candidate.id === accountId);
    if (!account) throw new Error(`Account not found: ${accountId}`);
    if (site.accounts.length === 1) {
      throw new Error('Cannot remove the last account');
    }

    site.accounts = site.accounts.filter(candidate => candidate.id !== accountId);
    if (account.isDefault) site.accounts[0].isDefault = true;
    store.set('sites', sites);
    return account;
  }

  function getActiveState() {
    return {
      siteId: store.get('activeSite', null),
      accountId: store.get('activeAccount', null)
    };
  }

  function setActiveState(siteId, accountId) {
    store.set('activeSite', siteId);
    store.set('activeAccount', accountId);
  }

  function clearSites() {
    const sites = getSites();
    store.set('sites', []);
    setActiveState(null, null);
    return sites;
  }

  function importConfig(jsonString) {
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch {
      throw new Error('Configuration file is not valid JSON');
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.sites)) {
      throw new Error('Configuration file must contain a sites array');
    }
    if (data.sites.length > 100) throw new Error('Configuration cannot contain more than 100 sites');

    const existingSites = getSites();
    const byId = new Map(existingSites.map(site => [site.id, site]));
    const seen = new Set();
    let added = 0;
    let updated = 0;

    const imports = data.sites.map((input, index) => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error(`Site at index ${index} must be an object`);
      }
      const id = normalizeId(input.id, 'Site ID');
      if (seen.has(id)) throw new Error(`Duplicate site ID in import: ${id}`);
      seen.add(id);

      const existing = byId.get(id);
      const metadata = normalizeSiteMetadata(input, existing || {});
      if (existing) {
        updated += 1;
        return { ...existing, ...metadata, accounts: existing.accounts, order: existing.order };
      }

      const labels = Array.isArray(input.accountLabels) && input.accountLabels.length > 0
        ? input.accountLabels.slice(0, 20)
        : ['默认'];
      const accounts = labels.map((label, accountIndex) => {
        const accountId = createId(id);
        return {
          id: accountId,
          label: normalizeText(label, 'Account label', null),
          partition: `persist:${accountId}`,
          isDefault: accountIndex === 0
        };
      });
      added += 1;
      return { id, ...metadata, order: existingSites.length + index, accounts };
    });

    const importedById = new Map(imports.map(site => [site.id, site]));
    const merged = existingSites.map(site => importedById.get(site.id) || site);
    for (const site of imports) {
      if (!byId.has(site.id)) merged.push(site);
    }
    const nextSettings = data.settings === undefined
      ? null
      : normalizeSettings(getSettings(), data.settings);

    store.set('sites', merged);
    if (nextSettings) store.set('settings', nextSettings);
    return { added, updated, total: merged.length };
  }

  function getSettings() {
    return { ...defaultSettings, ...store.get('settings', {}) };
  }

  function updateSettings(patch) {
    const next = normalizeSettings(getSettings(), patch);
    store.set('settings', next);
    return next;
  }

  function exportConfig() {
    const sites = getSites().map(site => ({
      id: site.id,
      name: site.name,
      url: site.url,
      icon: site.icon,
      faviconUrl: site.faviconUrl || null,
      faviconSourceUrl: site.faviconSourceUrl || null,
      color: site.color,
      shortcut: site.shortcut || null,
      proxy: site.proxy || '',
      order: site.order,
      accountCount: site.accounts?.length || 1,
      accountLabels: site.accounts?.map(account => account.label) || ['默认']
    }));

    return JSON.stringify({
      version: 1,
      exportDate: new Date().toISOString(),
      sites,
      settings: getSettings()
    }, null, 2);
  }

  return {
    getSites,
    addSite,
    updateSite,
    reorderSites,
    deleteSite,
    addAccount,
    renameAccount,
    removeAccount,
    getActiveState,
    setActiveState,
    clearSites,
    importConfig,
    exportConfig,
    getSettings,
    updateSettings
  };
}

module.exports = { createConfigRepository, normalizeProxy, normalizeWebUrl };
