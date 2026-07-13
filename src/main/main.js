const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { getWindowState, saveWindowState } = require('./window-manager');
const configStore = require('./config-store');
const ViewManager = require('./view-manager');

let mainWindow;
let viewManager;

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

  mainWindow.on('resize', () => {
    viewManager.updateAllBounds();
  });

  mainWindow.on('close', () => saveWindowState(mainWindow));

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
  ipcMain.handle('window:isMaximized', () => mainWindow.isMaximized());

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized', false);
  });

  // Config store IPC handlers
  ipcMain.handle('site:getAll', () => configStore.getSites());
  ipcMain.handle('site:add', (e, site) => configStore.addSite(site));
  ipcMain.handle('site:update', (e, id, data) => configStore.updateSite(id, data));
  ipcMain.handle('site:delete', (e, id) => configStore.deleteSite(id));

  ipcMain.handle('settings:get', () => configStore.getSettings());
  ipcMain.handle('settings:update', (e, settings) => configStore.updateSettings(settings));

  ipcMain.handle('config:export', () => configStore.exportConfig());
  ipcMain.handle('config:import', (e, data) => configStore.importConfig(data));

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

    return { success: true };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
