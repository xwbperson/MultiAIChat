const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  forceQuit: () => ipcRenderer.invoke('window:forceQuit'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Site management
  getSites: () => ipcRenderer.invoke('site:getAll'),
  getActiveState: () => ipcRenderer.invoke('site:getActiveState'),
  addSite: (site) => ipcRenderer.invoke('site:add', site),
  updateSite: (id, data) => ipcRenderer.invoke('site:update', id, data),
  deleteSite: (id) => ipcRenderer.invoke('site:delete', id),
  switchSite: (siteId, accountId) => ipcRenderer.invoke('site:switch', siteId, accountId),
  addAccount: (siteId, account) => ipcRenderer.invoke('site:addAccount', siteId, account),
  renameAccount: (siteId, accountId, label) => ipcRenderer.invoke('site:renameAccount', siteId, accountId, label),
  removeAccount: (siteId, accountId) => ipcRenderer.invoke('site:removeAccount', siteId, accountId),

  // Proxy
  setProxy: (siteId, proxy) => ipcRenderer.invoke('proxy:set', siteId, proxy),
  getProxy: (siteId) => ipcRenderer.invoke('proxy:get', siteId),

  // Navigation
  goBack: () => ipcRenderer.invoke('webview:goBack'),
  goForward: () => ipcRenderer.invoke('webview:goForward'),
  refresh: () => ipcRenderer.invoke('webview:refresh'),
  forceRefresh: () => ipcRenderer.invoke('webview:forceRefresh'),
  setZoom: (level) => ipcRenderer.invoke('webview:setZoom', level),

  // View visibility (for overlays)
  hideView: () => ipcRenderer.invoke('view:hide'),
  showView: () => ipcRenderer.invoke('view:show'),

  // Hibernate
  getHibernateStatus: () => ipcRenderer.invoke('hibernate:status'),
  hibernateSite: (siteId) => ipcRenderer.invoke('hibernate:site', siteId),
  wakeSite: (siteId) => ipcRenderer.invoke('hibernate:wake', siteId),

  // Config
  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: (data) => ipcRenderer.invoke('config:import', data),
  clearAllSiteData: () => ipcRenderer.invoke('config:clearAllSiteData'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),

  // Favicon
  fetchFavicon: (url, siteId, proxyConfig) => ipcRenderer.invoke('favicon:fetch', url, siteId, proxyConfig),
  getLocalFavicon: (siteId) => ipcRenderer.invoke('favicon:getLocal', siteId),
  hasLocalFavicon: (siteId) => ipcRenderer.invoke('favicon:hasLocal', siteId),
  deleteLocalFavicon: (siteId) => ipcRenderer.invoke('favicon:deleteLocal', siteId),
  detectFaviconFromDomain: (domain, proxyConfig) => ipcRenderer.invoke('favicon:detectFromDomain', domain, proxyConfig),
  getGoogleFaviconUrl: (domain) => ipcRenderer.invoke('favicon:getGoogleUrl', domain),

  // Events from main
  onMaximizeChanged: (callback) => ipcRenderer.on('window:maximized', (e, isMaximized) => callback(isMaximized)),
  onSiteUpdate: (callback) => ipcRenderer.on('site:updated', (e, data) => callback(data)),
  onBadgeUpdate: (callback) => ipcRenderer.on('badge:update', (e, data) => callback(data)),
  onHibernateStatus: (callback) => ipcRenderer.on('hibernate:statusChanged', (e, data) => callback(data)),
  onOpenSiteManager: (callback) => ipcRenderer.on('open:siteManager', () => callback()),
  onOpenSettings: (callback) => ipcRenderer.on('open:settings', () => callback()),
  onOpenAddSite: (callback) => ipcRenderer.on('open:addSite', () => callback()),
  onOpenFirstSite: (callback) => ipcRenderer.on('open:firstSite', (e, data) => callback(data)),
  onNavigationState: (callback) => ipcRenderer.on('webview:navigationState', (e, data) => callback(data)),
  onSiteActivated: (callback) => ipcRenderer.on('site:activated', (e, data) => callback(data)),
  onFocusUrl: (callback) => ipcRenderer.on('toolbar:focusUrl', () => callback())
});
