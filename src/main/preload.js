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

  // Events from main
  onMaximizeChanged: (callback) => ipcRenderer.on('window:maximized', (e, isMaximized) => callback(isMaximized)),
  onSiteUpdate: (callback) => ipcRenderer.on('site:updated', (e, data) => callback(data)),
  onBadgeUpdate: (callback) => ipcRenderer.on('badge:update', (e, data) => callback(data)),
  onHibernateStatus: (callback) => ipcRenderer.on('hibernate:statusChanged', (e, data) => callback(data)),
  onOpenSiteManager: (callback) => ipcRenderer.on('open:siteManager', () => callback()),
  onOpenSettings: (callback) => ipcRenderer.on('open:settings', () => callback())
});
