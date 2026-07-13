const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { getWindowState, saveWindowState } = require('./window-manager');
const configStore = require('./config-store');
const ViewManager = require('./view-manager');
const HibernationManager = require('./hibernation-manager');
const TrayManager = require('./tray-manager');
const { setupContextMenu } = require('./context-menu');
const { clearSessionData, resolveProxy, setProxy } = require('./session-manager');
const faviconManager = require('./favicon-manager');
const FaviconCache = require('./favicon-cache');
const { getKeyboardCommand } = require('./keyboard-shortcuts');
const { toChromeUserAgent } = require('./browser-environment');

// Keep every Electron session on the same Chromium user agent without
// advertising Electron or the desktop application's product name.
const browserUserAgent = toChromeUserAgent(app.userAgentFallback);
if (browserUserAgent) app.userAgentFallback = browserUserAgent;

let mainWindow;
let viewManager;
let hibernationManager;
let trayManager;
let faviconCache;

function setAutoLaunch(enable) {
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: app.getPath('exe')
  });
}

function registerShortcuts() {
  const settings = configStore.getSettings();

  if (settings.globalHotkey) {
    try {
      const registered = globalShortcut.register(settings.globalHotkey, () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      });
      if (!registered) console.error(`Failed to register global shortcut: ${settings.globalHotkey}`);
    } catch (error) {
      console.error(`Invalid global shortcut ${settings.globalHotkey}:`, error);
    }
  }
}

function getEffectiveProxy(site) {
  return resolveProxy(site.proxy, configStore.getSettings());
}

async function applyProxyToSite(site) {
  const proxy = getEffectiveProxy(site);
  await Promise.all(site.accounts.map(account => setProxy(account.partition, proxy)));
}

function reloadSiteViews(siteId) {
  for (const view of viewManager.getAllViews()) {
    if (view.siteId !== siteId || view.state === 'hibernated') continue;
    viewManager.getView(view.siteId, view.accountId)?.view?.webContents?.reload();
  }
}

async function activateConfiguredSite(siteId, accountId) {
  const sites = configStore.getSites();
  const site = sites.find(candidate => candidate.id === siteId);
  if (!site) throw new Error(`Site not found: ${siteId}`);
  const account = site.accounts.find(candidate => candidate.id === accountId)
    || site.accounts.find(candidate => candidate.isDefault)
    || site.accounts[0];
  if (!account) throw new Error(`No account configured for site: ${siteId}`);

  await viewManager.activate(site, account, getEffectiveProxy(site));
  configStore.setActiveState(site.id, account.id);
  hibernationManager?.onSiteActivated(site.id, account.id);
  mainWindow.webContents.send('site:activated', { siteId: site.id, accountId: account.id });
  return { site, account };
}

function setActiveZoom(delta, reset = false) {
  const contents = viewManager.getActiveView()?.view?.webContents;
  if (!contents) return;
  const current = Math.round(100 * Math.pow(1.2, contents.getZoomLevel()));
  const percent = reset ? 100 : Math.max(25, Math.min(500, current + delta));
  contents.setZoomLevel(Math.log(percent / 100) / Math.log(1.2));
  viewManager.sendNavigationState();
}

async function executeWebContentsCommand(command) {
  const active = configStore.getActiveState();
  const contents = viewManager.getActiveView()?.view?.webContents;
  switch (command.type) {
    case 'switch-site':
      await activateConfiguredSite(command.siteId);
      break;
    case 'refresh':
      contents?.reload();
      break;
    case 'force-refresh':
      contents?.reloadIgnoringCache();
      break;
    case 'go-back':
      if (contents?.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
      break;
    case 'go-forward':
      if (contents?.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
      break;
    case 'focus-url':
      mainWindow.webContents.focus();
      mainWindow.webContents.send('toolbar:focusUrl');
      break;
    case 'zoom':
      setActiveZoom(command.delta);
      break;
    case 'zoom-reset':
      setActiveZoom(0, true);
      break;
    case 'hibernate-current':
      if (active.siteId && active.accountId) {
        await hibernationManager.forceHibernate(active.siteId, active.accountId);
      }
      break;
    case 'add-site':
      mainWindow.webContents.send('open:addSite');
      break;
    case 'quit':
      if (trayManager) trayManager.isQuitting = true;
      app.quit();
      break;
  }
}

function handleWebContentsShortcut(input) {
  const sites = configStore.getSites();
  const command = getKeyboardCommand(input, sites, configStore.getActiveState().siteId);
  if (!command) return false;
  executeWebContentsCommand(command).catch(error => console.error('Shortcut failed:', error));
  return true;
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

  viewManager = new ViewManager(mainWindow, {
    setupContextMenu: (webContents, getMainWindow) => setupContextMenu(
      webContents,
      getMainWindow,
      () => configStore.getSettings().customContextMenu !== false
    ),
    onBeforeInput: handleWebContentsShortcut
  });
  hibernationManager = new HibernationManager(viewManager, configStore);
  faviconCache = new FaviconCache({
    getSites: () => configStore.getSites(),
    updateSite: (siteId, patch) => configStore.updateSite(siteId, patch),
    getLocalUrl: siteId => faviconManager.getLocalUrl(siteId),
    fetchAndSave: (url, siteId, proxy) => faviconManager.fetchAndSave(url, siteId, proxy),
    resolveProxy: site => getEffectiveProxy(site),
    onUpdated: update => {
      if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('site:updated', update);
      }
    }
  });

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
    const site = configStore.updateSite(siteId, { proxy });
    await applyProxyToSite(site);
    reloadSiteViews(site.id);
    return { success: true };
  });
  ipcMain.handle('proxy:get', (e, siteId) => {
    const sites = configStore.getSites();
    const site = sites.find(s => s.id === siteId);
    return site?.proxy || '';
  });

  // Config store IPC handlers
  ipcMain.handle('site:getAll', () => faviconCache.getSitesForRenderer());
  ipcMain.handle('site:add', (e, site) => configStore.addSite(site));
  ipcMain.handle('site:reorder', (e, siteIds) => configStore.reorderSites(siteIds));
  ipcMain.handle('site:update', async (e, id, data) => {
    const site = configStore.updateSite(id, data);
    if (Object.hasOwn(data, 'proxy')) {
      await applyProxyToSite(site);
      reloadSiteViews(site.id);
    }

    if (Object.hasOwn(data, 'url')) {
      const active = configStore.getActiveState();
      for (const account of site.accounts) {
        hibernationManager.cancelHibernate(viewManager.getKey(site.id, account.id));
        viewManager.removeView(site.id, account.id);
      }
      if (active.siteId === site.id) {
        const account = site.accounts.find(candidate => candidate.id === active.accountId)
          || site.accounts.find(candidate => candidate.isDefault)
          || site.accounts[0];
        await viewManager.activate(site, account, getEffectiveProxy(site));
        configStore.setActiveState(site.id, account.id);
      }
    }
    return site;
  });
  ipcMain.handle('site:delete', async (e, id) => {
    const sites = configStore.getSites();
    const site = sites.find(s => s.id === id);
    if (!site) throw new Error(`Site not found: ${id}`);

    const wasActive = configStore.getActiveState().siteId === id;
    const removedSite = configStore.deleteSite(id);

    // Remove all views before clearing their backing sessions.
    for (const account of removedSite.accounts) {
      hibernationManager.cancelHibernate(viewManager.getKey(id, account.id));
      viewManager.removeView(id, account.id);
    }

    // Clean up session data for all accounts
    for (const account of removedSite.accounts) {
      try {
        await clearSessionData(account.partition);
      } catch (err) {
        console.error(`Failed to clear session for ${account.partition}:`, err);
      }
    }
    try {
      faviconManager.deleteLocal(id);
    } catch (error) {
      console.warn(`Failed to remove favicon for ${id}:`, error.message);
    }

    if (wasActive) {
      const nextSite = configStore.getSites()
        .sort((left, right) => (left.order || 0) - (right.order || 0))[0];
      if (nextSite) await activateConfiguredSite(nextSite.id);
    }

    return { success: true };
  });
  ipcMain.handle('site:addAccount', (e, siteId, account) => configStore.addAccount(siteId, account));
  ipcMain.handle('site:renameAccount', (e, siteId, accountId, label) => (
    configStore.renameAccount(siteId, accountId, label)
  ));
  ipcMain.handle('site:removeAccount', async (e, siteId, accountId) => {
    const sites = configStore.getSites();
    const site = sites.find(s => s.id === siteId);
    if (!site) throw new Error(`Site not found: ${siteId}`);

    const activeBeforeRemoval = configStore.getActiveState();
    const account = configStore.removeAccount(siteId, accountId);

    // Remove the live view before clearing its backing session.
    hibernationManager.cancelHibernate(viewManager.getKey(siteId, accountId));
    viewManager.removeView(siteId, accountId);

    // Clean up session data
    try {
      await clearSessionData(account.partition);
    } catch (err) {
      console.error(`Failed to clear session for ${account.partition}:`, err);
    }

    // Reset active state if this was the active account
    if (activeBeforeRemoval.siteId === siteId && activeBeforeRemoval.accountId === accountId) {
      await activateConfiguredSite(siteId);
    }

    return { success: true };
  });

  ipcMain.handle('site:getActiveState', () => configStore.getActiveState());

  ipcMain.handle('settings:get', () => configStore.getSettings());
  ipcMain.handle('settings:update', async (e, settings) => {
    const updated = configStore.updateSettings(settings);

    if (settings.autoLaunch !== undefined) {
      setAutoLaunch(settings.autoLaunch);
    }

    globalShortcut.unregisterAll();
    registerShortcuts();
    if (settings.defaultProxyMode !== undefined || settings.defaultProxy !== undefined) {
      const inheritedSites = configStore.getSites().filter(site => !site.proxy);
      await Promise.all(inheritedSites.map(site => applyProxyToSite(site)));
      inheritedSites.forEach(site => reloadSiteViews(site.id));
    }
    return updated;
  });

  ipcMain.handle('config:export', () => configStore.exportConfig());
  ipcMain.handle('config:import', async (e, data) => {
    const result = configStore.importConfig(data);
    const settings = configStore.getSettings();
    setAutoLaunch(settings.autoLaunch);
    globalShortcut.unregisterAll();
    registerShortcuts();

    hibernationManager.cancelAllCountdowns();
    viewManager.removeAll();
    const active = configStore.getActiveState();
    if (active.siteId) {
      try {
        await activateConfiguredSite(active.siteId, active.accountId);
      } catch (error) {
        configStore.setActiveState(null, null);
        console.error('Failed to restore active site after import:', error);
      }
    }
    faviconCache.warm().catch(error => console.error('Favicon cache refresh failed:', error));
    return result;
  });
  ipcMain.handle('config:clearAllSiteData', async () => {
    const sites = configStore.clearSites();

    // Close views first so open connections do not race storage deletion.
    hibernationManager.cancelAllCountdowns();
    viewManager.removeAll();

    // Clear all session data.
    for (const site of sites) {
      for (const account of site.accounts) {
        try {
          await clearSessionData(account.partition);
        } catch (err) {
          console.error(`Failed to clear session for ${account.partition}:`, err);
        }
      }
      try {
        faviconManager.deleteLocal(site.id);
      } catch (error) {
        console.warn(`Failed to remove favicon for ${site.id}:`, error.message);
      }
    }

    return { success: true };
  });

  // Navigation IPC handlers
  ipcMain.handle('webview:goBack', () => {
    const activeView = viewManager.getActiveView();
    const history = activeView?.view?.webContents?.navigationHistory;
    if (history?.canGoBack()) {
      history.goBack();
    }
  });
  ipcMain.handle('webview:goForward', () => {
    const activeView = viewManager.getActiveView();
    const history = activeView?.view?.webContents?.navigationHistory;
    if (history?.canGoForward()) {
      history.goForward();
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
      const safeLevel = Math.max(-8, Math.min(8, Number(level) || 0));
      activeView.view.webContents.setZoomLevel(safeLevel);
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
    await activateConfiguredSite(siteId, accountId);
    return { success: true };
  });

  // Hibernation IPC handlers
  ipcMain.handle('hibernate:status', () => hibernationManager.getStatus());
  ipcMain.handle('hibernate:site', async (e, siteId) => {
    const active = configStore.getActiveState();
    const views = viewManager.getAllViews().filter(view => (
      view.siteId === siteId
      && (active.siteId !== siteId || view.accountId === active.accountId)
    ));
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
      const account = site.accounts.find(candidate => candidate.id === accountId);
      if (!account) throw new Error(`Account not found: ${accountId}`);
      await hibernationManager.forceWake(
        siteId,
        accountId,
        site,
        account,
        getEffectiveProxy(site)
      );
    } else {
      // Wake all hibernated views for this site
      const hibernated = viewManager.getAllViews().filter(
        v => v.siteId === siteId && v.state === 'hibernated'
      );
      for (const v of hibernated) {
        const account = site.accounts.find(candidate => candidate.id === v.accountId);
        if (account) {
          await hibernationManager.forceWake(
            siteId,
            v.accountId,
            site,
            account,
            getEffectiveProxy(site)
          );
        }
      }
    }
    return { success: true };
  });

  // Favicon IPC handlers
  ipcMain.handle('favicon:fetch', async (e, url, siteId, proxyConfig) => {
    try {
      const localUrl = await faviconManager.fetchAndSave(
        url,
        siteId,
        resolveProxy(proxyConfig, configStore.getSettings())
      );
      return { success: true, localUrl };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('favicon:getLocal', (e, siteId) => {
    return faviconManager.getLocalUrl(siteId);
  });

  ipcMain.handle('favicon:hasLocal', (e, siteId) => {
    return faviconManager.hasLocalFavicon(siteId);
  });

  ipcMain.handle('favicon:deleteLocal', (e, siteId) => {
    faviconManager.deleteLocal(siteId);
    return { success: true };
  });

  ipcMain.handle('favicon:detectFromDomain', async (e, domain, proxyConfig) => {
    try {
      const faviconUrl = await faviconManager.fetchFaviconFromDomain(
        domain,
        resolveProxy(proxyConfig, configStore.getSettings())
      );
      return { success: true, url: faviconUrl };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('favicon:getGoogleUrl', (e, domain) => {
    return faviconManager.getGoogleFaviconUrl(domain);
  });

  // Context menu for main window
  setupContextMenu(
    mainWindow.webContents,
    () => mainWindow,
    () => configStore.getSettings().customContextMenu !== false
  );

  // Auto-open first site on startup
  mainWindow.webContents.on('did-finish-load', () => {
    faviconCache.warm().catch(error => console.error('Favicon cache warm-up failed:', error));
    const sites = configStore.getSites();
    if (sites.length > 0) {
      // Sort by order
      sites.sort((a, b) => (a.order || 0) - (b.order || 0));
      const savedActive = configStore.getActiveState();
      const savedSite = sites.find(site => site.id === savedActive.siteId);
      const firstSite = savedSite || sites[0];
      const savedAccount = firstSite.accounts.find(account => account.id === savedActive.accountId);
      const defaultAccount = savedAccount
        || firstSite.accounts.find(account => account.isDefault)
        || firstSite.accounts[0];
      if (!defaultAccount) return;

      // Send message to renderer to open first site
      setTimeout(() => {
        mainWindow.webContents.send('open:firstSite', {
          siteId: firstSite.id,
          accountId: defaultAccount.id
        });
      }, 500);
    }
  });
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
