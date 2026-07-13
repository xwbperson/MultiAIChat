const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { getWindowState, saveWindowState } = require('./window-manager');
const configStore = require('./config-store');
const ViewManager = require('./view-manager');
const HibernationManager = require('./hibernation-manager');
const TrayManager = require('./tray-manager');
const { setupContextMenu } = require('./context-menu');
const { clearSessionData } = require('./session-manager');

let mainWindow;
let viewManager;
let hibernationManager;
let trayManager;

function setAutoLaunch(enable) {
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: app.getPath('exe')
  });
}

function registerShortcuts() {
  const settings = configStore.getSettings();

  if (settings.globalHotkey) {
    globalShortcut.register(settings.globalHotkey, () => {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  }
}

function createWindow() {
  const state = getWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (state.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  viewManager = new ViewManager(mainWindow);
  hibernationManager = new HibernationManager(viewManager, configStore);

  mainWindow.on('resize', () => {
    viewManager.updateAllBounds();
  });

  mainWindow.on('close', (e) => {
    const settings = configStore.getSettings();
    // If minimizeToTray is enabled and we're not quitting, hide instead of close
    if (!trayManager?.isQuitting && settings.minimizeToTray) {
      e.preventDefault();
      mainWindow.hide();
      return;
    }
    // Actually quitting - do cleanup
    if (hibernationManager) {
      hibernationManager.stopScheduler();
    }
    saveWindowState(mainWindow);
  });

  ipcMain.handle('window:minimize', () => mainWindow.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.restore();
    } else {
      mainWindow.maximize();
    }
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', () => mainWindow.close());
  ipcMain.handle('window:forceQuit', () => {
    if (trayManager) {
      trayManager.isQuitting = true;
    }
    app.quit();
  });
  ipcMain.handle('window:isMaximized', () => mainWindow.isMaximized());

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized', false);
  });

  // Proxy IPC handlers
  ipcMain.handle('proxy:set', async (e, siteId, proxy) => {
    configStore.updateSite(siteId, { proxy });
    return { success: true };
  });
  ipcMain.handle('proxy:get', (e, siteId) => {
    const sites = configStore.getSites();
    const site = sites.find(s => s.id === siteId);
    return site?.proxy || '';
  });

  // Config store IPC handlers
  ipcMain.handle('site:getAll', () => configStore.getSites());
  ipcMain.handle('site:add', (e, site) => configStore.addSite(site));
  ipcMain.handle('site:update', (e, id, data) => configStore.updateSite(id, data));
  ipcMain.handle('site:delete', async (e, id) => {
    const sites = configStore.getSites();
    const site = sites.find(s => s.id === id);
    if (!site) throw new Error(`Site not found: ${id}`);

    // Clean up session data for all accounts
    for (const account of site.accounts) {
      try {
        await clearSessionData(account.partition);
      } catch (err) {
        console.error(`Failed to clear session for ${account.partition}:`, err);
      }
    }

    // Remove all views for this site
    for (const account of site.accounts) {
      viewManager.removeView(id, account.id);
    }

    // Reset active state if this was the active site
    const active = configStore.getActiveState();
    if (active.siteId === id) {
      configStore.setActiveState(null, null);
    }

    // Delete from config
    configStore.deleteSite(id);

    return { success: true };
  });
  ipcMain.handle('site:addAccount', (e, siteId, account) => configStore.addAccount(siteId, account));
  ipcMain.handle('site:removeAccount', async (e, siteId, accountId) => {
    const sites = configStore.getSites();
    const site = sites.find(s => s.id === siteId);
    if (!site) throw new Error(`Site not found: ${siteId}`);

    const account = site.accounts.find(a => a.id === accountId);
    if (!account) throw new Error(`Account not found: ${accountId}`);

    // Clean up session data
    try {
      await clearSessionData(account.partition);
    } catch (err) {
      console.error(`Failed to clear session for ${account.partition}:`, err);
    }

    // Remove view
    viewManager.removeView(siteId, accountId);

    // Reset active state if this was the active account
    const active = configStore.getActiveState();
    if (active.siteId === siteId && active.accountId === accountId) {
      configStore.setActiveState(null, null);
    }

    // Remove from config
    configStore.removeAccount(siteId, accountId);

    return { success: true };
  });

  ipcMain.handle('site:getActiveState', () => configStore.getActiveState());

  ipcMain.handle('settings:get', () => configStore.getSettings());
  ipcMain.handle('settings:update', (e, settings) => {
    configStore.updateSettings(settings);

    if (settings.autoLaunch !== undefined) {
      setAutoLaunch(settings.autoLaunch);
    }

    globalShortcut.unregisterAll();
    registerShortcuts();
  });

  ipcMain.handle('config:export', () => configStore.exportConfig());
  ipcMain.handle('config:import', (e, data) => configStore.importConfig(data));
  ipcMain.handle('config:clearAllSiteData', async () => {
    const sites = configStore.getSites();

    // Clear all session data first
    for (const site of sites) {
      for (const account of site.accounts) {
        try {
          await clearSessionData(account.partition);
        } catch (err) {
          console.error(`Failed to clear session for ${account.partition}:`, err);
        }
      }
    }

    // Remove all views
    viewManager.removeAll();

    // Reset active state
    configStore.setActiveState(null, null);

    // Clear all sites from config (use set to avoid iteration issues)
    configStore.set('sites', []);

    return { success: true };
  });

  // Navigation IPC handlers
  ipcMain.handle('webview:goBack', () => {
    const activeView = viewManager.getActiveView();
    if (activeView?.view?.webContents?.canGoBack()) {
      activeView.view.webContents.goBack();
    }
  });
  ipcMain.handle('webview:goForward', () => {
    const activeView = viewManager.getActiveView();
    if (activeView?.view?.webContents?.canGoForward()) {
      activeView.view.webContents.goForward();
    }
  });
  ipcMain.handle('webview:refresh', () => {
    const activeView = viewManager.getActiveView();
    if (activeView?.view?.webContents) {
      activeView.view.webContents.reload();
    }
  });
  ipcMain.handle('webview:forceRefresh', () => {
    const activeView = viewManager.getActiveView();
    if (activeView?.view?.webContents) {
      activeView.view.webContents.reloadIgnoringCache();
    }
  });
  ipcMain.handle('webview:setZoom', (e, level) => {
    const activeView = viewManager.getActiveView();
    if (activeView?.view?.webContents) {
      activeView.view.webContents.setZoomLevel(level);
    }
  });

  // Tray menu event handlers
  ipcMain.on('open:siteManager', () => {
    mainWindow.webContents.send('open:siteManager');
  });
  ipcMain.on('open:settings', () => {
    mainWindow.webContents.send('open:settings');
  });

  // View visibility control for overlays
  ipcMain.handle('view:hide', () => {
    viewManager.hideActiveView();
  });
  ipcMain.handle('view:show', () => {
    viewManager.showActiveView();
  });

  ipcMain.handle('site:switch', async (e, siteId, accountId) => {
    const sites = configStore.getSites();
    const site = sites.find(s => s.id === siteId);
    if (!site) throw new Error(`Site not found: ${siteId}`);

    const account = site.accounts.find(a => a.id === accountId);
    if (!account) throw new Error(`Account not found: ${accountId}`);

    let viewData = viewManager.getView(siteId, accountId);

    if (!viewData) {
      viewData = await viewManager.createView(site, account);
    }

    await viewManager.switchTo(siteId, accountId);
    configStore.setActiveState(siteId, accountId);

    if (hibernationManager) {
      hibernationManager.onSiteActivated(siteId, accountId);
    }

    return { success: true };
  });

  // Hibernation IPC handlers
  ipcMain.handle('hibernate:status', () => hibernationManager.getStatus());
  ipcMain.handle('hibernate:site', async (e, siteId) => {
    const active = configStore.getActiveState();
    if (active.siteId === siteId) {
      return { success: false, reason: 'Cannot hibernate active site' };
    }
    const views = viewManager.getAllViews().filter(v => v.siteId === siteId);
    for (const v of views) {
      await hibernationManager.forceHibernate(siteId, v.accountId);
    }
    return { success: true };
  });
  ipcMain.handle('hibernate:wake', async (e, siteId, accountId) => {
    const sites = configStore.getSites();
    const site = sites.find(s => s.id === siteId);
    if (!site) throw new Error(`Site not found: ${siteId}`);

    if (accountId) {
      await hibernationManager.forceWake(siteId, accountId, site);
    } else {
      // Wake all hibernated views for this site
      const hibernated = viewManager.getAllViews().filter(
        v => v.siteId === siteId && v.state === 'hibernated'
      );
      for (const v of hibernated) {
        await hibernationManager.forceWake(siteId, v.accountId, site);
      }
    }
    return { success: true };
  });

  // Context menu for main window
  setupContextMenu(mainWindow.webContents, () => mainWindow);
}

app.whenReady().then(() => {
  const settings = configStore.getSettings();
  if (settings.autoLaunch) {
    setAutoLaunch(true);
  }

  createWindow();
  trayManager = new TrayManager(mainWindow, configStore);
  registerShortcuts();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (trayManager) {
    trayManager.isQuitting = true;
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
