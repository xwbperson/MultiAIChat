const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Site management
  getSites: () => ipcRenderer.invoke('site:getAll'),
  addSite: (site) => ipcRenderer.invoke('site:add', site),
  updateSite: (id, data) => ipcRenderer.invoke('site:update', id, data),
  deleteSite: (id) => ipcRenderer.invoke('site:delete', id),
  switchSite: (siteId, accountId) => ipcRenderer.invoke('site:switch', siteId, accountId),

  // Proxy
  setProxy: (siteId, proxy) => ipcRenderer.invoke('proxy:set', siteId, proxy),
  getProxy: (siteId) => ipcRenderer.invoke('proxy:get', siteId),

  // Hibernate
  getHibernateStatus: () => ipcRenderer.invoke('hibernate:status'),
  hibernateSite: (siteId) => ipcRenderer.invoke('hibernate:site', siteId),
  wakeSite: (siteId) => ipcRenderer.invoke('hibernate:wake', siteId),

  // Config
  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: (data) => ipcRenderer.invoke('config:import', data),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),

  // Events from main
  onSiteUpdate: (callback) => ipcRenderer.on('site:updated', (e, data) => callback(data)),
  onBadgeUpdate: (callback) => ipcRenderer.on('badge:update', (e, data) => callback(data)),
  onHibernateStatus: (callback) => ipcRenderer.on('hibernate:statusChanged', (e, data) => callback(data))
});
