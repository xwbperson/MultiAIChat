const Store = require('electron-store');
const { DEFAULT_SITES } = require('./default-sites');

const configStore = new Store({
  name: 'config',
  defaults: {
    sites: DEFAULT_SITES,
    settings: {
      maxActiveTabs: 3,
      idleTimeout: 30000,
      hibernateDelay: 10000,
      autoLaunch: false,
      minimizeToTray: true,
      globalHotkey: 'Ctrl+Shift+Space',
      customContextMenu: true,
      showBadges: true,
      defaultProxyMode: 'system',
      proxyRules: []
    },
    activeSite: null,
    activeAccount: null
  }
});

// Migration: Set favicon URLs for sites that don't have one
function migrateFaviconUrls() {
  const sites = getSites();
  let updated = false;

  for (const site of sites) {
    // Only set faviconUrl if site doesn't have one at all
    if (!site.faviconUrl) {
      const defaultSite = DEFAULT_SITES.find(d => d.id === site.id);
      if (defaultSite && defaultSite.faviconUrl) {
        site.faviconUrl = defaultSite.faviconUrl;
        updated = true;
      }
    }
  }

  if (updated) {
    configStore.set('sites', sites);
  }
}

// Run migration on startup
migrateFaviconUrls();

function getSites() {
  return configStore.get('sites', []);
}

function addSite(site) {
  const sites = getSites();
  const newSite = {
    id: site.id || `site-${Date.now()}`,
    name: site.name,
    url: site.url,
    color: site.color || '#89b4fa',
    icon: site.icon || '🌐',
    proxy: site.proxy || '',
    order: sites.length,
    accounts: site.accounts || [
      {
        id: `${site.id || 'site'}-default`,
        label: '默认',
        partition: `persist:${site.id || 'site'}-default`,
        isDefault: true
      }
    ]
  };
  sites.push(newSite);
  configStore.set('sites', sites);
  return newSite;
}

function updateSite(id, data) {
  const sites = getSites();
  const index = sites.findIndex(s => s.id === id);
  if (index === -1) throw new Error(`Site not found: ${id}`);
  sites[index] = { ...sites[index], ...data };
  configStore.set('sites', sites);
  return sites[index];
}

function deleteSite(id) {
  const sites = getSites().filter(s => s.id !== id);
  configStore.set('sites', sites);
}

function addAccount(siteId, account) {
  const sites = getSites();
  const site = sites.find(s => s.id === siteId);
  if (!site) throw new Error(`Site not found: ${siteId}`);

  const newAccount = {
    id: account.id || `${siteId}-${Date.now()}`,
    label: account.label || `账号 ${site.accounts.length + 1}`,
    partition: `persist:${account.id || `${siteId}-${Date.now()}`}`,
    isDefault: false
  };
  site.accounts.push(newAccount);
  configStore.set('sites', sites);
  return newAccount;
}

function removeAccount(siteId, accountId) {
  const sites = getSites();
  const site = sites.find(s => s.id === siteId);
  if (!site) throw new Error(`Site not found: ${siteId}`);
  site.accounts = site.accounts.filter(a => a.id !== accountId);
  if (site.accounts.length === 0) {
    throw new Error('Cannot remove last account');
  }
  if (!site.accounts.some(a => a.isDefault)) {
    site.accounts[0].isDefault = true;
  }
  configStore.set('sites', sites);
}

function getSettings() {
  return configStore.get('settings');
}

function updateSettings(settings) {
  const current = getSettings();
  configStore.set('settings', { ...current, ...settings });
}

function getActiveState() {
  return {
    siteId: configStore.get('activeSite'),
    accountId: configStore.get('activeAccount')
  };
}

function setActiveState(siteId, accountId) {
  configStore.set('activeSite', siteId);
  configStore.set('activeAccount', accountId);
}

function exportConfig() {
  const sites = getSites();

  // Strip account details - only export site metadata
  const exportSites = sites.map(site => ({
    id: site.id,
    name: site.name,
    url: site.url,
    icon: site.icon,
    faviconUrl: site.faviconUrl || null,
    color: site.color,
    shortcut: site.shortcut || null,
    proxy: site.proxy || '',
    order: site.order,
    // Export account count and labels only (no partition/session data)
    accountCount: site.accounts?.length || 1,
    accountLabels: site.accounts?.map(a => a.label) || ['默认']
  }));

  return JSON.stringify({
    version: 1,
    exportDate: new Date().toISOString(),
    sites: exportSites,
    settings: getSettings()
  }, null, 2);
}

function importConfig(jsonString) {
  const data = JSON.parse(jsonString);

  if (data.sites) {
    const existingSites = getSites();
    const importedSites = data.sites;

    // Process imported sites - add accounts if missing
    const processedImports = importedSites.map(site => {
      if (!site.accounts || site.accounts.length === 0) {
        const accountLabels = site.accountLabels || ['默认'];
        const accounts = accountLabels.map((label, index) => ({
          id: `${site.id}-${index}`,
          label: label,
          partition: `persist:${site.id}-${index}`,
          isDefault: index === 0
        }));
        return { ...site, accounts };
      }
      return site;
    });

    // Merge strategy:
    // 1. Same ID -> update with imported data
    // 2. Only in import -> add new site
    // 3. Only in current -> keep unchanged
    const mergedSites = [];
    const existingIds = new Set(existingSites.map(s => s.id));
    const importedIds = new Set(processedImports.map(s => s.id));

    // Add all existing sites, update if ID matches import
    for (const existing of existingSites) {
      const imported = processedImports.find(s => s.id === existing.id);
      if (imported) {
        // Merge: keep existing accounts, update other fields
        mergedSites.push({
          ...imported,
          accounts: existing.accounts, // Preserve existing account sessions
          order: existing.order // Preserve current order
        });
      } else {
        // Keep existing site unchanged
        mergedSites.push(existing);
      }
    }

    // Add new sites from import that don't exist in current
    for (const imported of processedImports) {
      if (!existingIds.has(imported.id)) {
        mergedSites.push(imported);
      }
    }

    configStore.set('sites', mergedSites);
  }

  if (data.settings) {
    configStore.set('settings', { ...getSettings(), ...data.settings });
  }
}

function getConfigPath() {
  return configStore.path;
}

module.exports = {
  getSites, addSite, updateSite, deleteSite,
  addAccount, removeAccount,
  getSettings, updateSettings,
  getActiveState, setActiveState,
  exportConfig, importConfig,
  getConfigPath
};
