# AI Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready Electron desktop app that aggregates multiple AI websites (ChatGPT, Claude, DeepSeek, etc.) into a single window with sidebar navigation, account isolation, tab hibernation, and per-site proxy configuration.

**Architecture:** Electron main process manages BrowserWindow + WebContentsView for each site. Each account gets an isolated session partition. A hibernation scheduler destroys inactive WebContents to save memory. Renderer process provides sidebar navigation, toolbar, and settings UI via native HTML/CSS/JS communicating through IPC.

**Tech Stack:** Electron 36, Node.js, vanilla HTML/CSS/JS, electron-store, electron-builder

## Global Constraints

- Electron 36+ (uses WebContentsView, not deprecated BrowserView)
- Windows primary target (frameless window with custom title bar)
- Session partition naming: `persist:<siteId>-<accountId>`
- Config stored at `%APPDATA%/ai-workspace/`
- All IPC channels prefixed with `site:`, `proxy:`, `window:`, `hibernate:`
- Sidebar width: 68px fixed
- Max active tabs default: 3
- Idle timeout default: 30s
- Hibernate delay default: 10s

---

### Task 1: Project Scaffolding

**Covers:** Foundation for all features

**Files:**
- Create: `package.json`
- Create: `src/main/main.js`
- Create: `src/main/preload.js`
- Create: `src/renderer/index.html`
- Create: `src/renderer/styles/main.css`
- Create: `.gitignore`

- [ ] **Step 1: Initialize npm project**

```bash
cd D:\Project\ProjectsActive\MultiAIChat
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install electron@latest electron-store@8
npm install --save-dev electron-builder
```

- [ ] **Step 3: Create package.json scripts**

```json
{
  "name": "ai-workspace",
  "version": "1.0.0",
  "description": "Multi-AI site aggregation desktop client",
  "main": "src/main/main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder --win",
    "dev": "electron . --dev"
  },
  "build": {
    "appId": "com.aiworkspace.app",
    "productName": "AI Workspace",
    "win": {
      "target": "nsis",
      "icon": "build/icon.ico"
    },
    "directories": {
      "output": "dist"
    }
  }
}
```

- [ ] **Step 4: Create main process entry**

```javascript
// src/main/main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 5: Create preload script**

```javascript
// src/main/preload.js
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
```

- [ ] **Step 6: Create basic renderer HTML**

```html
<!-- src/renderer/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Workspace</title>
  <link rel="stylesheet" href="styles/main.css">
</head>
<body>
  <div id="app">
    <div id="titlebar">
      <div class="titlebar-drag"></div>
      <div class="window-controls">
        <button id="btn-minimize" class="win-btn">─</button>
        <button id="btn-maximize" class="win-btn">□</button>
        <button id="btn-close" class="win-btn close">✕</button>
      </div>
    </div>
    <div id="sidebar"></div>
    <div id="main">
      <div id="toolbar"></div>
      <div id="view-container"></div>
    </div>
    <div id="statusbar"></div>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 7: Create base CSS**

```css
/* src/renderer/styles/main.css */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --sidebar-width: 68px;
  --titlebar-height: 32px;
  --toolbar-height: 40px;
  --statusbar-height: 24px;
  --bg-primary: #1e1e2e;
  --bg-secondary: #181825;
  --bg-surface: #313244;
  --text-primary: #cdd6f4;
  --text-secondary: #a6adc8;
  --accent: #89b4fa;
  --accent-hover: #74c7ec;
  --border: #45475a;
  --danger: #f38ba8;
  --success: #a6e3a1;
  --warning: #f9e2af;
}

html, body {
  height: 100%;
  overflow: hidden;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
}

#app {
  display: grid;
  grid-template-rows: var(--titlebar-height) 1fr var(--statusbar-height);
  grid-template-columns: var(--sidebar-width) 1fr;
  height: 100vh;
}

#titlebar {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  background: var(--bg-secondary);
  -webkit-app-region: drag;
}

.titlebar-drag {
  flex: 1;
  height: 100%;
}

.window-controls {
  display: flex;
  -webkit-app-region: no-drag;
}

.win-btn {
  width: 46px;
  height: var(--titlebar-height);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.win-btn:hover {
  background: var(--bg-surface);
}

.win-btn.close:hover {
  background: var(--danger);
  color: white;
}

#sidebar {
  grid-row: 2;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  overflow-x: hidden;
}

#main {
  grid-row: 2;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

#toolbar {
  height: var(--toolbar-height);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 12px;
}

#view-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

#statusbar {
  grid-column: 1 / -1;
  height: var(--statusbar-height);
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 11px;
  color: var(--text-secondary);
}
```

- [ ] **Step 8: Create .gitignore**

```
node_modules/
dist/
out/
*.log
.DS_Store
Thumbs.db
```

- [ ] **Step 9: Verify Electron launches**

Run: `npm start`
Expected: Empty frameless window with dark theme appears

- [ ] **Step 10: Commit**

```bash
git init
git add .
git commit -m "feat: initial Electron project scaffolding"
```

---

### Task 2: Window Controls & Title Bar

**Covers:** Frameless window, custom title bar, window state memory

**Files:**
- Modify: `src/main/main.js`
- Create: `src/main/window-manager.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles/main.css`
- Create: `src/renderer/app.js`

- [ ] **Step 1: Create window manager module**

```javascript
// src/main/window-manager.js
const { BrowserWindow, screen } = require('electron');
const Store = require('electron-store');

const store = new Store({ name: 'window-state' });

const DEFAULT_STATE = {
  width: 1400,
  height: 900,
  x: undefined,
  y: undefined,
  isMaximized: false
};

function getWindowState() {
  const saved = store.get('windowState', DEFAULT_STATE);
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  // Ensure window is visible on screen
  if (saved.x !== undefined && saved.y !== undefined) {
    const bounds = { x: saved.x, y: saved.y, width: saved.width, height: saved.height };
    if (bounds.x > width - 100 || bounds.y > height - 100) {
      saved.x = undefined;
      saved.y = undefined;
    }
  }

  return {
    width: Math.min(saved.width, width),
    height: Math.min(saved.height, height),
    x: saved.x,
    y: saved.y,
    isMaximized: saved.isMaximized
  };
}

function saveWindowState(mainWindow) {
  if (!mainWindow) return;

  const isMaximized = mainWindow.isMaximized();
  let bounds;

  if (isMaximized) {
    // Restore from maximized to get actual position/size
    mainWindow.restore();
    bounds = mainWindow.getBounds();
    mainWindow.maximize();
  } else {
    bounds = mainWindow.getBounds();
  }

  store.set('windowState', {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized
  });
}

module.exports = { getWindowState, saveWindowState };
```

- [ ] **Step 2: Update main.js with window manager**

```javascript
// src/main/main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { getWindowState, saveWindowState } = require('./window-manager');

let mainWindow;

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

  // Save window state on close
  mainWindow.on('close', () => saveWindowState(mainWindow));

  // Window control IPC handlers
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

  // Notify renderer of maximize state changes
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized', false);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 3: Update preload with window maximize event**

```javascript
// src/main/preload.js - add to api object
onMaximizeChanged: (callback) => ipcRenderer.on('window:maximized', (e, isMaximized) => callback(isMaximized)),
```

- [ ] **Step 4: Create renderer app.js with window controls**

```javascript
// src/renderer/app.js
document.addEventListener('DOMContentLoaded', () => {
  // Window controls
  const btnMinimize = document.getElementById('btn-minimize');
  const btnMaximize = document.getElementById('btn-maximize');
  const btnClose = document.getElementById('btn-close');

  btnMinimize.addEventListener('click', () => window.api.minimize());
  btnMaximize.addEventListener('click', async () => {
    const isMaximized = await window.api.maximize();
    updateMaximizeButton(isMaximized);
  });
  btnClose.addEventListener('click', () => window.api.close());

  // Update maximize button icon
  function updateMaximizeButton(isMaximized) {
    btnMaximize.textContent = isMaximized ? '❐' : '□';
  }

  // Listen for maximize state changes
  window.api.onMaximizeChanged(updateMaximizeButton);

  // Initial state
  window.api.isMaximized().then(updateMaximizeButton);
});
```

- [ ] **Step 5: Add title text to titlebar**

```html
<!-- In index.html #titlebar, before .titlebar-drag -->
<div class="app-title">AI Workspace</div>
```

```css
.app-title {
  padding: 0 12px;
  font-size: 12px;
  color: var(--text-secondary);
  user-select: none;
}
```

- [ ] **Step 6: Verify window controls work**

Run: `npm start`
Expected: Window opens frameless, minimize/maximize/close buttons work, window state persists across restarts

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: frameless window with custom title bar and state persistence"
```

---

### Task 3: Config Store & Default Sites

**Covers:** Data persistence, site configuration model

**Files:**
- Create: `src/main/config-store.js`
- Create: `src/main/default-sites.js`

- [ ] **Step 1: Create default sites configuration**

```javascript
// src/main/default-sites.js
const DEFAULT_SITES = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    color: '#10a37f',
    icon: '🤖',
    proxy: '',
    order: 0,
    accounts: [
      { id: 'chatgpt-default', label: '默认', partition: 'persist:chatgpt-default', isDefault: true }
    ]
  },
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://claude.ai',
    color: '#d4a574',
    icon: '🧠',
    proxy: '',
    order: 1,
    accounts: [
      { id: 'claude-default', label: '默认', partition: 'persist:claude-default', isDefault: true }
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    color: '#4d6bfe',
    icon: '🔷',
    proxy: '',
    order: 2,
    accounts: [
      { id: 'deepseek-default', label: '默认', partition: 'persist:deepseek-default', isDefault: true }
    ]
  },
  {
    id: 'kimi',
    name: 'Kimi',
    url: 'https://kimi.moonshot.cn',
    color: '#6236d9',
    icon: '🌙',
    proxy: '',
    order: 3,
    accounts: [
      { id: 'kimi-default', label: '默认', partition: 'persist:kimi-default', isDefault: true }
    ]
  },
  {
    id: 'doubao',
    name: '豆包',
    url: 'https://www.doubao.com',
    color: '#fe694a',
    icon: '🤖',
    proxy: '',
    order: 4,
    accounts: [
      { id: 'doubao-default', label: '默认', partition: 'persist:doubao-default', isDefault: true }
    ]
  },
  {
    id: 'copilot',
    name: 'Copilot',
    url: 'https://copilot.microsoft.com',
    color: '#7c3aed',
    icon: '🪟',
    proxy: '',
    order: 5,
    accounts: [
      { id: 'copilot-default', label: '默认', partition: 'persist:copilot-default', isDefault: true }
    ]
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com',
    color: '#4285f4',
    icon: '💎',
    proxy: '',
    order: 6,
    accounts: [
      { id: 'gemini-default', label: '默认', partition: 'persist:gemini-default', isDefault: true }
    ]
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    color: '#20b2aa',
    icon: '🔍',
    proxy: '',
    order: 7,
    accounts: [
      { id: 'perplexity-default', label: '默认', partition: 'persist:perplexity-default', isDefault: true }
    ]
  }
];

module.exports = { DEFAULT_SITES };
```

- [ ] **Step 2: Create config store module**

```javascript
// src/main/config-store.js
const Store = require('electron-store');
const { DEFAULT_SITES } = require('./default-sites');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

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
  // If removed account was default, set first as default
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
  return JSON.stringify({
    sites: getSites(),
    settings: getSettings()
  }, null, 2);
}

function importConfig(jsonString) {
  const data = JSON.parse(jsonString);
  if (data.sites) configStore.set('sites', data.sites);
  if (data.settings) configStore.set('settings', { ...getSettings(), ...data.settings });
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
```

- [ ] **Step 3: Wire config IPC handlers in main.js**

```javascript
// Add to src/main/main.js after window control handlers
const configStore = require('./config-store');

// Site management
ipcMain.handle('site:getAll', () => configStore.getSites());
ipcMain.handle('site:add', (e, site) => configStore.addSite(site));
ipcMain.handle('site:update', (e, id, data) => configStore.updateSite(id, data));
ipcMain.handle('site:delete', (e, id) => configStore.deleteSite(id));

// Settings
ipcMain.handle('settings:get', () => configStore.getSettings());
ipcMain.handle('settings:update', (e, settings) => configStore.updateSettings(settings));

// Config import/export
ipcMain.handle('config:export', () => configStore.exportConfig());
ipcMain.handle('config:import', (e, data) => configStore.importConfig(data));
```

- [ ] **Step 4: Test config persistence**

Run: `npm start`, then in DevTools console: `window.api.getSites().then(console.log)`
Expected: Array of 8 default sites printed

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: config store with default sites and settings management"
```

---

### Task 4: Session Manager & WebContentsView

**Covers:** Session partition isolation, WebContentsView creation

**Files:**
- Create: `src/main/session-manager.js`
- Create: `src/main/view-manager.js`

- [ ] **Step 1: Create session manager**

```javascript
// src/main/session-manager.js
const { session } = require('electron');

const sessions = new Map();

function getSession(partition) {
  if (!sessions.has(partition)) {
    const ses = session.fromPartition(partition);
    sessions.set(partition, ses);
  }
  return sessions.get(partition);
}

async function setProxy(partition, proxyConfig) {
  const ses = getSession(partition);

  if (!proxyConfig || proxyConfig === 'direct') {
    await ses.setProxy({ mode: 'direct' });
  } else if (proxyConfig === 'system') {
    await ses.setProxy({ mode: 'system' });
  } else if (proxyConfig.startsWith('socks')) {
    await ses.setProxy({
      mode: 'fixed_servers',
      proxyRules: proxyConfig
    });
  } else {
    // HTTP proxy
    await ses.setProxy({
      mode: 'fixed_servers',
      proxyRules: `http=${proxyConfig};https=${proxyConfig}`
    });
  }
}

function clearSessionData(partition) {
  const ses = getSession(partition);
  return ses.clearStorageData();
}

module.exports = { getSession, setProxy, clearSessionData };
```

- [ ] **Step 2: Create view manager**

```javascript
// src/main/view-manager.js
const { WebContentsView, BrowserWindow } = require('electron');
const path = require('path');
const { getSession, setProxy } = require('./session-manager');

class ViewManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.views = new Map(); // key: "siteId:accountId" -> { view, state, url, siteId, accountId }
    this.activeKey = null;
  }

  getKey(siteId, accountId) {
    return `${siteId}:${accountId}`;
  }

  async createView(site, account) {
    const key = this.getKey(site.id, account.id);

    if (this.views.has(key)) {
      return this.views.get(key);
    }

    const ses = getSession(account.partition);

    // Set proxy if configured
    if (site.proxy) {
      await setProxy(account.partition, site.proxy);
    }

    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        preload: path.join(__dirname, 'webview-preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    // Add to window but keep hidden
    this.mainWindow.contentView.addChildView(view);

    // Set bounds to fill the view container area
    this.updateViewBounds(view);

    // Load the site URL
    view.webContents.loadURL(site.url);

    // Track state
    const viewData = {
      view,
      state: 'loading', // loading, active, idle, hibernating, hibernated
      url: site.url,
      siteId: site.id,
      accountId: account.id,
      lastActive: Date.now(),
      partition: account.partition
    };

    this.views.set(key, viewData);

    // Handle page title changes for badge updates
    view.webContents.on('page-title-updated', (e, title) => {
      const match = title.match(/\((\d+)\)/);
      if (match) {
        this.mainWindow.webContents.send('badge:update', {
          siteId: site.id,
          count: parseInt(match[1])
        });
      }
    });

    // Handle load completion
    view.webContents.did_finish_load && view.webContents.on('did-finish-load', () => {
      viewData.state = 'idle';
      viewData.url = view.webContents.getURL();
    });

    return viewData;
  }

  async switchTo(siteId, accountId) {
    const key = this.getKey(siteId, accountId);

    // Hide current active view
    if (this.activeKey && this.views.has(this.activeKey)) {
      const current = this.views.get(this.activeKey);
      current.view.setVisible(false);
      if (current.state === 'active') {
        current.state = 'idle';
        current.lastActive = Date.now();
      }
    }

    // Show or create target view
    let viewData = this.views.get(key);
    if (!viewData) {
      return null; // View doesn't exist yet, caller should create it
    }

    viewData.view.setVisible(true);
    viewData.state = 'active';
    viewData.lastActive = Date.now();
    this.activeKey = key;

    // Bring to front
    this.mainWindow.contentView.addChildView(viewData.view);

    return viewData;
  }

  hibernate(siteId, accountId) {
    const key = this.getKey(siteId, accountId);
    const viewData = this.views.get(key);
    if (!viewData || viewData.state === 'hibernated') return;

    viewData.url = viewData.view.webContents.getURL();
    viewData.state = 'hibernated';

    // Remove view
    this.mainWindow.contentView.removeChildView(viewData.view);
    viewData.view.webContents.close();
    viewData.view = null;
  }

  async wake(siteId, accountId, site) {
    const key = this.getKey(siteId, accountId);
    const viewData = this.views.get(key);
    if (!viewData || viewData.state !== 'hibernated') return;

    // Recreate view
    const newViewData = await this.createView(
      { ...site, proxy: viewData.partition },
      { id: accountId, partition: viewData.partition }
    );

    // Update URL to saved one
    if (viewData.url && viewData.url !== site.url) {
      newViewData.view.webContents.loadURL(viewData.url);
    }

    return newViewData;
  }

  getView(siteId, accountId) {
    return this.views.get(this.getKey(siteId, accountId));
  }

  getAllViews() {
    const result = [];
    for (const [key, data] of this.views) {
      result.push({
        key,
        siteId: data.siteId,
        accountId: data.accountId,
        state: data.state,
        url: data.url,
        lastActive: data.lastActive
      });
    }
    return result;
  }

  updateViewBounds(view) {
    if (!view) return;
    const { width, height } = this.mainWindow.getContentBounds();
    // Account for sidebar (68px), toolbar (40px), statusbar (24px), titlebar (32px)
    view.setBounds({
      x: 68,
      y: 72, // titlebar + toolbar
      width: width - 68,
      height: height - 72 - 24
    });
  }

  updateAllBounds() {
    for (const [, data] of this.views) {
      if (data.view) {
        this.updateViewBounds(data.view);
      }
    }
  }

  removeView(siteId, accountId) {
    const key = this.getKey(siteId, accountId);
    const viewData = this.views.get(key);
    if (!viewData) return;

    if (viewData.view) {
      this.mainWindow.contentView.removeChildView(viewData.view);
      viewData.view.webContents.close();
    }
    this.views.delete(key);
  }

  removeAll() {
    for (const [, data] of this.views) {
      if (data.view) {
        this.mainWindow.contentView.removeChildView(data.view);
        data.view.webContents.close();
      }
    }
    this.views.clear();
    this.activeKey = null;
  }
}

module.exports = ViewManager;
```

- [ ] **Step 3: Create webview preload for injected scripts**

```javascript
// src/main/webview-preload.js
// Minimal preload for AI site webviews
// Can be extended for custom context menus, notifications, etc.
```

- [ ] **Step 4: Wire view management into main.js**

```javascript
// Add to src/main/main.js
const ViewManager = require('./view-manager');
const configStore = require('./config-store');

let viewManager;

// In createWindow(), after loadFile:
viewManager = new ViewManager(mainWindow);

// Update bounds on resize
mainWindow.on('resize', () => {
  viewManager.updateAllBounds();
});

// Site switch handler
ipcMain.handle('site:switch', async (e, siteId, accountId) => {
  const sites = configStore.getSites();
  const site = sites.find(s => s.id === siteId);
  if (!site) throw new Error(`Site not found: ${siteId}`);

  const account = site.accounts.find(a => a.id === accountId);
  if (!account) throw new Error(`Account not found: ${accountId}`);

  // Check if view exists
  let viewData = viewManager.getView(siteId, accountId);

  if (!viewData) {
    // Create new view
    viewData = await viewManager.createView(site, account);
  }

  // Switch to it
  await viewManager.switchTo(siteId, accountId);
  configStore.setActiveState(siteId, accountId);

  return { success: true };
});
```

- [ ] **Step 5: Test view creation**

Run: `npm start`, in DevTools: `window.api.switchSite('chatgpt', 'chatgpt-default')`
Expected: ChatGPT loads in the view area

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: session manager and WebContentsView with partition isolation"
```

---

### Task 5: Sidebar Navigation UI

**Covers:** Sidebar rendering, site icons, account switching, hibernate indicators

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles/main.css`
- Create: `src/renderer/sidebar.js`
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Add sidebar HTML structure**

```html
<!-- Update #sidebar in index.html -->
<div id="sidebar">
  <div id="site-list"></div>
  <div id="sidebar-bottom">
    <button id="btn-settings" class="sidebar-btn" title="设置">⚙</button>
  </div>
</div>
```

- [ ] **Step 2: Create sidebar module**

```javascript
// src/renderer/sidebar.js
class Sidebar {
  constructor() {
    this.container = document.getElementById('site-list');
    this.sites = [];
    this.activeSiteId = null;
    this.activeAccountId = null;
    this.expandedSites = new Set();
    this.badges = new Map();
    this.hibernatedKeys = new Set();

    this.init();
  }

  async init() {
    await this.loadSites();
    this.render();

    // Listen for badge updates
    window.api.onBadgeUpdate(({ siteId, count }) => {
      this.badges.set(siteId, count);
      this.updateBadge(siteId);
    });

    // Listen for hibernate status changes
    window.api.onHibernateStatus(({ siteId, accountId, state }) => {
      const key = `${siteId}:${accountId}`;
      if (state === 'hibernated') {
        this.hibernatedKeys.add(key);
      } else {
        this.hibernatedKeys.delete(key);
      }
      this.updateHibernateIndicator(siteId, accountId);
    });
  }

  async loadSites() {
    this.sites = await window.api.getSites();
  }

  render() {
    this.container.innerHTML = '';

    this.sites.forEach(site => {
      const siteEl = this.createSiteElement(site);
      this.container.appendChild(siteEl);
    });
  }

  createSiteElement(site) {
    const wrapper = document.createElement('div');
    wrapper.className = 'site-item';
    wrapper.dataset.siteId = site.id;

    const isActive = site.id === this.activeSiteId;
    const isExpanded = this.expandedSites.has(site.id);
    const hasMultipleAccounts = site.accounts.length > 1;

    // Main site button
    const btn = document.createElement('button');
    btn.className = `site-btn ${isActive ? 'active' : ''}`;
    btn.title = site.name;

    // Icon with status indicator
    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'site-icon-wrapper';

    const icon = document.createElement('span');
    icon.className = 'site-icon';
    icon.textContent = site.icon;

    const statusDot = document.createElement('span');
    statusDot.className = 'status-dot';
    statusDot.dataset.siteId = site.id;

    iconWrapper.appendChild(icon);
    iconWrapper.appendChild(statusDot);

    // Site name (truncated to 6 chars)
    const name = document.createElement('span');
    name.className = 'site-name';
    name.textContent = site.name.length > 6 ? site.name.slice(0, 6) : site.name;

    // Badge
    const badge = document.createElement('span');
    badge.className = 'site-badge';
    badge.dataset.siteId = site.id;
    badge.style.display = 'none';

    btn.appendChild(iconWrapper);
    btn.appendChild(name);
    if (hasMultipleAccounts) {
      const expandIcon = document.createElement('span');
      expandIcon.className = 'expand-icon';
      expandIcon.textContent = isExpanded ? '▾' : '▸';
      btn.appendChild(expandIcon);
    }
    btn.appendChild(badge);

    btn.addEventListener('click', () => {
      if (hasMultipleAccounts) {
        this.toggleExpand(site.id);
      } else {
        this.selectSite(site.id, site.accounts[0].id);
      }
    });

    wrapper.appendChild(btn);

    // Account list (if expanded)
    if (isExpanded && hasMultipleAccounts) {
      const accountList = document.createElement('div');
      accountList.className = 'account-list';

      site.accounts.forEach(account => {
        const accountBtn = document.createElement('button');
        accountBtn.className = `account-btn ${account.id === this.activeAccountId ? 'active' : ''}`;

        const dot = document.createElement('span');
        dot.className = `account-dot ${this.isHibernated(site.id, account.id) ? 'hibernated' : ''}`;

        const label = document.createElement('span');
        label.className = 'account-label';
        label.textContent = account.label;

        accountBtn.appendChild(dot);
        accountBtn.appendChild(label);

        accountBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectSite(site.id, account.id);
        });

        accountList.appendChild(accountBtn);
      });

      // Add account button
      const addBtn = document.createElement('button');
      addBtn.className = 'account-btn add-account';
      addBtn.innerHTML = '<span class="account-dot"></span><span class="account-label">+ 添加</span>';
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.addAccount(site.id);
      });
      accountList.appendChild(addBtn);

      wrapper.appendChild(accountList);
    }

    return wrapper;
  }

  toggleExpand(siteId) {
    if (this.expandedSites.has(siteId)) {
      this.expandedSites.delete(siteId);
    } else {
      this.expandedSites.add(siteId);
    }
    this.render();
  }

  async selectSite(siteId, accountId) {
    this.activeSiteId = siteId;
    this.activeAccountId = accountId;
    this.render();

    // Notify main process
    await window.api.switchSite(siteId, accountId);
  }

  async addAccount(siteId) {
    const label = prompt('请输入账号名称:');
    if (!label) return;

    const site = this.sites.find(s => s.id === siteId);
    const accountId = `${siteId}-${Date.now()}`;

    await window.api.addAccount(siteId, { id: accountId, label });
    await this.loadSites();
    this.render();
  }

  isHibernated(siteId, accountId) {
    return this.hibernatedKeys.has(`${siteId}:${accountId}`);
  }

  updateBadge(siteId) {
    const badge = this.container.querySelector(`.site-badge[data-site-id="${siteId}"]`);
    if (badge) {
      const count = this.badges.get(siteId) || 0;
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  updateHibernateIndicator(siteId, accountId) {
    this.render(); // Re-render to update indicators
  }
}

module.exports = Sidebar;
```

- [ ] **Step 3: Add sidebar CSS**

```css
/* Add to main.css */
#sidebar {
  display: flex;
  flex-direction: column;
}

#site-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 0;
}

#site-list::-webkit-scrollbar {
  width: 4px;
}

#site-list::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 2px;
}

#sidebar-bottom {
  padding: 8px 0;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: center;
}

.sidebar-btn {
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 20px;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s;
}

.sidebar-btn:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.site-item {
  margin: 2px 8px;
}

.site-btn {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s;
  position: relative;
}

.site-btn:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.site-btn.active {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.site-icon-wrapper {
  position: relative;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px solid var(--border);
  transition: border-color 0.15s;
}

.site-btn.active .site-icon-wrapper {
  border-color: var(--accent);
}

.site-icon {
  font-size: 18px;
  line-height: 1;
}

.status-dot {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--bg-secondary);
  background: var(--success);
}

.status-dot.hibernated {
  background: var(--text-secondary);
  opacity: 0.5;
}

.status-dot.idle {
  background: var(--warning);
}

.site-name {
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.expand-icon {
  font-size: 8px;
  margin-top: 2px;
}

.site-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: var(--warning);
  color: var(--bg-primary);
  font-size: 10px;
  font-weight: 600;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.account-list {
  margin: 4px 0;
  padding: 4px 12px;
  background: var(--bg-primary);
  border-radius: 6px;
}

.account-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  font-size: 11px;
  transition: all 0.15s;
}

.account-btn:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.account-btn.active {
  background: var(--bg-surface);
  color: var(--accent);
}

.account-btn.add-account {
  color: var(--text-secondary);
  opacity: 0.7;
}

.account-btn.add-account:hover {
  opacity: 1;
}

.account-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
  flex-shrink: 0;
}

.account-dot.hibernated {
  background: var(--text-secondary);
  opacity: 0.5;
}
```

- [ ] **Step 4: Initialize sidebar in app.js**

```javascript
// Add to src/renderer/app.js
const Sidebar = require('./sidebar');

// After DOMContentLoaded, before window controls:
const sidebar = new Sidebar();
```

- [ ] **Step 5: Test sidebar**

Run: `npm start`
Expected: Sidebar shows 8 AI site icons with names, clicking loads the site

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: sidebar navigation with site icons and account switching"
```

---

### Task 6: Top Toolbar

**Covers:** URL display, navigation buttons, zoom controls

**Files:**
- Create: `src/renderer/toolbar.js`
- Modify: `src/renderer/styles/main.css`
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Create toolbar module**

```javascript
// src/renderer/toolbar.js
class Toolbar {
  constructor() {
    this.container = document.getElementById('toolbar');
    this.currentZoom = 100;
    this.init();
  }

  init() {
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="toolbar-nav">
        <button id="btn-back" class="toolbar-btn" title="后退 (Alt+←)">←</button>
        <button id="btn-forward" class="toolbar-btn" title="前进 (Alt+→)">→</button>
        <button id="btn-refresh" class="toolbar-btn" title="刷新 (F5)">↻</button>
      </div>
      <div class="toolbar-separator"></div>
      <div class="toolbar-url" id="toolbar-url" title="点击复制">
        <span id="url-text">AI Workspace</span>
      </div>
      <div class="toolbar-separator"></div>
      <div class="toolbar-zoom">
        <button id="btn-zoom-out" class="toolbar-btn" title="缩小 (Ctrl+-)">−</button>
        <span id="zoom-level" class="zoom-level">100%</span>
        <button id="btn-zoom-in" class="toolbar-btn" title="放大 (Ctrl++)">+</button>
        <button id="btn-zoom-reset" class="toolbar-btn" title="重置 (Ctrl+0)">⟲</button>
      </div>
    `;
  }

  bindEvents() {
    // Navigation
    document.getElementById('btn-back').addEventListener('click', () => {
      window.api.goBack?.();
    });

    document.getElementById('btn-forward').addEventListener('click', () => {
      window.api.goForward?.();
    });

    document.getElementById('btn-refresh').addEventListener('click', () => {
      window.api.refresh?.();
    });

    // URL copy
    document.getElementById('toolbar-url').addEventListener('click', () => {
      const url = document.getElementById('url-text').textContent;
      if (url && url !== 'AI Workspace') {
        navigator.clipboard.writeText(url);
        this.showTooltip('已复制');
      }
    });

    // Zoom
    document.getElementById('btn-zoom-in').addEventListener('click', () => this.zoom(10));
    document.getElementById('btn-zoom-out').addEventListener('click', () => this.zoom(-10));
    document.getElementById('btn-zoom-reset').addEventListener('click', () => this.setZoom(100));
  }

  setUrl(url) {
    const urlText = document.getElementById('url-text');
    if (urlText) {
      urlText.textContent = url || 'AI Workspace';
    }
  }

  zoom(delta) {
    this.currentZoom = Math.max(25, Math.min(500, this.currentZoom + delta));
    this.setZoom(this.currentZoom);
  }

  setZoom(level) {
    this.currentZoom = level;
    const zoomEl = document.getElementById('zoom-level');
    if (zoomEl) {
      zoomEl.textContent = `${level}%`;
    }
    // Apply zoom to active view
    window.api.setZoom?.(level / 100);
  }

  showTooltip(text) {
    const urlEl = document.getElementById('toolbar-url');
    if (!urlEl) return;

    const tooltip = document.createElement('span');
    tooltip.className = 'toolbar-tooltip';
    tooltip.textContent = text;
    urlEl.appendChild(tooltip);

    setTimeout(() => tooltip.remove(), 1500);
  }
}

module.exports = Toolbar;
```

- [ ] **Step 2: Add toolbar CSS**

```css
/* Add to main.css */
.toolbar-nav {
  display: flex;
  gap: 4px;
}

.toolbar-btn {
  width: 32px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toolbar-btn:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.toolbar-separator {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 8px;
}

.toolbar-url {
  flex: 1;
  height: 28px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  cursor: pointer;
  transition: border-color 0.15s;
  position: relative;
}

.toolbar-url:hover {
  border-color: var(--accent);
}

#url-text {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toolbar-zoom {
  display: flex;
  align-items: center;
  gap: 4px;
}

.zoom-level {
  font-size: 11px;
  color: var(--text-secondary);
  min-width: 36px;
  text-align: center;
  cursor: pointer;
}

.zoom-level:hover {
  color: var(--text-primary);
}

.toolbar-tooltip {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  background: var(--accent);
  color: var(--bg-primary);
  font-size: 11px;
  border-radius: 4px;
  white-space: nowrap;
  margin-top: 4px;
  animation: fadeInOut 1.5s ease;
}

@keyframes fadeInOut {
  0% { opacity: 0; transform: translateX(-50%) translateY(-4px); }
  20% { opacity: 1; transform: translateX(-50%) translateY(0); }
  80% { opacity: 1; }
  100% { opacity: 0; }
}
```

- [ ] **Step 3: Initialize toolbar in app.js**

```javascript
// Add to src/renderer/app.js
const Toolbar = require('./toolbar');

// After sidebar initialization:
const toolbar = new Toolbar();
```

- [ ] **Step 4: Test toolbar**

Run: `npm start`, switch to a site
Expected: Toolbar shows with nav buttons, URL updates, zoom controls work

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: top toolbar with navigation, URL display, and zoom controls"
```

---

### Task 7: Tab Hibernation System

**Covers:** Memory management, hibernation state machine, LRU scheduling

**Files:**
- Create: `src/main/hibernation-manager.js`
- Modify: `src/main/main.js`

- [ ] **Step 1: Create hibernation manager**

```javascript
// src/main/hibernation-manager.js
class HibernationManager {
  constructor(viewManager, configStore) {
    this.viewManager = viewManager;
    this.configStore = configStore;
    this.timers = new Map(); // key -> { idleTimer, hibernateTimer }
    this.checkInterval = null;

    this.startScheduler();
  }

  startScheduler() {
    // Check every 5 seconds for tabs that should hibernate
    this.checkInterval = setInterval(() => this.checkAll(), 5000);
  }

  stopScheduler() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    for (const [, timers] of this.timers) {
      clearTimeout(timers.idleTimer);
      clearTimeout(timers.hibernateTimer);
    }
    this.timers.clear();
  }

  checkAll() {
    const settings = this.configStore.getSettings();
    const maxActive = settings.maxActiveTabs || 3;
    const idleTimeout = settings.idleTimeout || 30000;
    const hibernateDelay = settings.hibernateDelay || 10000;

    const views = this.viewManager.getAllViews();
    const now = Date.now();

    // Count active views
    const activeViews = views.filter(v => v.state === 'active');
    const idleViews = views.filter(v => v.state === 'idle');

    // Sort idle views by lastActive (oldest first) - LRU
    idleViews.sort((a, b) => a.lastActive - b.lastActive);

    // If we have more active views than allowed, mark oldest as idle
    if (activeViews.length > maxActive) {
      const excess = activeViews
        .filter(v => v.key !== this.viewManager.activeKey)
        .sort((a, b) => a.lastActive - b.lastActive);

      for (let i = 0; i < excess.length && activeViews.length - i > maxActive; i++) {
        const viewData = this.viewManager.views.get(excess[i].key);
        if (viewData) {
          viewData.state = 'idle';
          viewData.lastActive = now;
        }
      }
    }

    // Check idle views for hibernation
    for (const view of idleViews) {
      const timeSinceActive = now - view.lastActive;

      if (timeSinceActive >= idleTimeout) {
        // Start hibernate countdown if not already started
        if (!this.timers.has(view.key)) {
          this.startHibernateCountdown(view.key, hibernateDelay);
        }
      }
    }
  }

  startHibernateCountdown(key, delay) {
    const timer = setTimeout(() => {
      const viewData = this.viewManager.views.get(key);
      if (viewData && viewData.state === 'idle') {
        this.viewManager.hibernate(viewData.siteId, viewData.accountId);
        this.notifyStatusChange(viewData.siteId, viewData.accountId, 'hibernated');
      }
      this.timers.delete(key);
    }, delay);

    this.timers.set(key, { hibernateTimer: timer });
  }

  cancelHibernate(key) {
    const timers = this.timers.get(key);
    if (timers) {
      clearTimeout(timers.hibernateTimer);
      this.timers.delete(key);
    }
  }

  onSiteActivated(siteId, accountId) {
    const key = this.viewManager.getKey(siteId, accountId);
    this.cancelHibernate(key);

    const viewData = this.viewManager.views.get(key);
    if (viewData) {
      viewData.state = 'active';
      viewData.lastActive = Date.now();
    }
  }

  onSiteDeactivated(siteId, accountId) {
    const key = this.viewManager.getKey(siteId, accountId);
    const viewData = this.viewManager.views.get(key);
    if (viewData) {
      viewData.state = 'idle';
      viewData.lastActive = Date.now();
    }
  }

  async forceHibernate(siteId, accountId) {
    const key = this.viewManager.getKey(siteId, accountId);
    this.cancelHibernate(key);
    this.viewManager.hibernate(siteId, accountId);
    this.notifyStatusChange(siteId, accountId, 'hibernated');
  }

  async forceWake(siteId, accountId, site) {
    await this.viewManager.wake(siteId, accountId, site);
    this.notifyStatusChange(siteId, accountId, 'active');
  }

  notifyStatusChange(siteId, accountId, state) {
    const { BrowserWindow } = require('electron');
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(w => {
      w.webContents.send('hibernate:statusChanged', { siteId, accountId, state });
    });
  }

  getStatus() {
    const views = this.viewManager.getAllViews();
    return {
      total: views.length,
      active: views.filter(v => v.state === 'active').length,
      idle: views.filter(v => v.state === 'idle').length,
      hibernated: views.filter(v => v.state === 'hibernated').length,
      views: views.map(v => ({
        siteId: v.siteId,
        accountId: v.accountId,
        state: v.state,
        lastActive: v.lastActive
      }))
    };
  }
}

module.exports = HibernationManager;
```

- [ ] **Step 2: Wire hibernation into main.js**

```javascript
// Add to src/main/main.js
const HibernationManager = require('./hibernation-manager');

let hibernationManager;

// After viewManager creation:
hibernationManager = new HibernationManager(viewManager, configStore);

// Update site:switch handler to notify hibernation manager
ipcMain.handle('site:switch', async (e, siteId, accountId) => {
  // ... existing code ...

  // Notify hibernation manager
  if (hibernationManager) {
    hibernationManager.onSiteActivated(siteId, accountId);
  }

  return { success: true };
});

// Add hibernate IPC handlers
ipcMain.handle('hibernate:status', () => hibernationManager.getStatus());
ipcMain.handle('hibernate:site', async (e, siteId) => {
  const active = configStore.getActiveState();
  if (active.siteId === siteId) {
    // Don't hibernate the currently active site
    return { success: false, reason: 'Cannot hibernate active site' };
  }
  // Hibernate all accounts for this site
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
  await hibernationManager.forceWake(siteId, accountId, site);
  return { success: true };
});
```

- [ ] **Step 3: Test hibernation**

Run: `npm start`, open 4+ sites, wait 40+ seconds
Expected: Oldest inactive tabs show hibernated state in sidebar

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: tab hibernation system with LRU scheduling"
```

---

### Task 8: Settings Panel

**Covers:** Settings UI, proxy configuration, hibernation settings

**Files:**
- Create: `src/renderer/settings.js`
- Modify: `src/renderer/styles/main.css`
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Create settings panel**

```javascript
// src/renderer/settings.js
class SettingsPanel {
  constructor() {
    this.isOpen = false;
    this.settings = {};
    this.init();
  }

  async init() {
    this.settings = await window.api.getSettings();
    this.createOverlay();

    // Settings button
    document.getElementById('btn-settings').addEventListener('click', () => this.toggle());
  }

  createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'settings-overlay';
    overlay.className = 'settings-overlay hidden';
    overlay.innerHTML = `
      <div class="settings-panel">
        <div class="settings-header">
          <h2>设置</h2>
          <button id="settings-close" class="settings-close-btn">✕</button>
        </div>
        <div class="settings-content">
          <section class="settings-section">
            <h3>网络</h3>
            <div class="setting-row">
              <label>默认代理模式</label>
              <select id="setting-proxy-mode">
                <option value="direct">直连</option>
                <option value="system">系统代理</option>
                <option value="custom">自定义代理</option>
              </select>
            </div>
            <div class="setting-row" id="proxy-custom-row" style="display:none">
              <label>代理地址</label>
              <input type="text" id="setting-proxy-address" placeholder="http://127.0.0.1:7890">
            </div>
          </section>

          <section class="settings-section">
            <h3>性能</h3>
            <div class="setting-row">
              <label>最大同时活跃页面</label>
              <select id="setting-max-active">
                <option value="2">2 个</option>
                <option value="3">3 个</option>
                <option value="5">5 个</option>
                <option value="10">10 个</option>
              </select>
            </div>
            <div class="setting-row">
              <label>空闲超时（秒）</label>
              <input type="number" id="setting-idle-timeout" min="10" max="300" value="30">
            </div>
            <div class="setting-row">
              <label>休眠确认延迟（秒）</label>
              <input type="number" id="setting-hibernate-delay" min="5" max="60" value="10">
            </div>
          </section>

          <section class="settings-section">
            <h3>外观</h3>
            <div class="setting-row">
              <label>开机自启</label>
              <input type="checkbox" id="setting-auto-launch">
            </div>
            <div class="setting-row">
              <label>关闭时最小化到托盘</label>
              <input type="checkbox" id="setting-minimize-tray" checked>
            </div>
            <div class="setting-row">
              <label>全局快捷键呼出</label>
              <input type="text" id="setting-hotkey" value="Ctrl+Shift+Space" readonly>
            </div>
            <div class="setting-row">
              <label>通知角标</label>
              <input type="checkbox" id="setting-badges" checked>
            </div>
          </section>

          <section class="settings-section">
            <h3>数据</h3>
            <div class="setting-actions">
              <button id="btn-export" class="settings-action-btn">导出配置</button>
              <button id="btn-import" class="settings-action-btn">导入配置</button>
              <button id="btn-clear-data" class="settings-action-btn danger">清除全部站点数据</button>
            </div>
          </section>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('settings-close').addEventListener('click', () => this.close());

    document.getElementById('setting-proxy-mode').addEventListener('change', (e) => {
      document.getElementById('proxy-custom-row').style.display =
        e.target.value === 'custom' ? 'flex' : 'none';
    });

    document.getElementById('btn-export').addEventListener('click', async () => {
      const config = await window.api.exportConfig();
      const blob = new Blob([config], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ai-workspace-config.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('btn-import').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        try {
          await window.api.importConfig(text);
          this.settings = await window.api.getSettings();
          this.loadSettings();
          alert('配置已导入');
        } catch (err) {
          alert('导入失败: ' + err.message);
        }
      };
      input.click();
    });

    // Save on change
    const inputs = document.querySelectorAll('.settings-content input, .settings-content select');
    inputs.forEach(input => {
      input.addEventListener('change', () => this.saveSettings());
    });
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.isOpen = true;
    document.getElementById('settings-overlay').classList.remove('hidden');
    this.loadSettings();
  }

  close() {
    this.isOpen = false;
    document.getElementById('settings-overlay').classList.add('hidden');
  }

  loadSettings() {
    const s = this.settings;
    document.getElementById('setting-proxy-mode').value = s.defaultProxyMode || 'system';
    document.getElementById('setting-max-active').value = s.maxActiveTabs || 3;
    document.getElementById('setting-idle-timeout').value = (s.idleTimeout || 30000) / 1000;
    document.getElementById('setting-hibernate-delay').value = (s.hibernateDelay || 10000) / 1000;
    document.getElementById('setting-auto-launch').checked = s.autoLaunch || false;
    document.getElementById('setting-minimize-tray').checked = s.minimizeToTray !== false;
    document.getElementById('setting-badges').checked = s.showBadges !== false;
  }

  async saveSettings() {
    const settings = {
      defaultProxyMode: document.getElementById('setting-proxy-mode').value,
      maxActiveTabs: parseInt(document.getElementById('setting-max-active').value),
      idleTimeout: parseInt(document.getElementById('setting-idle-timeout').value) * 1000,
      hibernateDelay: parseInt(document.getElementById('setting-hibernate-delay').value) * 1000,
      autoLaunch: document.getElementById('setting-auto-launch').checked,
      minimizeToTray: document.getElementById('setting-minimize-tray').checked,
      showBadges: document.getElementById('setting-badges').checked
    };

    await window.api.updateSettings(settings);
    this.settings = { ...this.settings, ...settings };
  }
}

module.exports = SettingsPanel;
```

- [ ] **Step 2: Add settings CSS**

```css
/* Add to main.css */
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.settings-overlay.hidden {
  display: none;
}

.settings-panel {
  width: 500px;
  max-height: 80vh;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.settings-header h2 {
  font-size: 16px;
  font-weight: 600;
}

.settings-close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
}

.settings-close-btn:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.settings-section {
  margin-bottom: 24px;
}

.settings-section h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.setting-row label {
  font-size: 13px;
  color: var(--text-primary);
}

.setting-row input[type="text"],
.setting-row input[type="number"],
.setting-row select {
  width: 180px;
  height: 32px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 0 10px;
  font-size: 12px;
}

.setting-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
}

.setting-row input:focus,
.setting-row select:focus {
  outline: none;
  border-color: var(--accent);
}

.setting-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.settings-action-btn {
  padding: 8px 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-action-btn:hover {
  background: var(--border);
}

.settings-action-btn.danger {
  color: var(--danger);
  border-color: var(--danger);
}

.settings-action-btn.danger:hover {
  background: var(--danger);
  color: white;
}
```

- [ ] **Step 3: Initialize settings in app.js**

```javascript
// Add to src/renderer/app.js
const SettingsPanel = require('./settings');

// After toolbar initialization:
const settingsPanel = new SettingsPanel();
```

- [ ] **Step 4: Test settings**

Run: `npm start`, click gear icon
Expected: Settings panel opens with all sections, changes persist

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: settings panel with proxy, hibernation, and appearance options"
```

---

### Task 9: Site Management Panel

**Covers:** Add/edit/delete sites, per-site proxy, account management

**Files:**
- Create: `src/renderer/site-manager.js`
- Modify: `src/renderer/styles/main.css`
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Create site manager panel**

```javascript
// src/renderer/site-manager.js
class SiteManager {
  constructor(sidebar) {
    this.sidebar = sidebar;
    this.isOpen = false;
    this.init();
  }

  init() {
    this.createOverlay();
  }

  createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'site-manager-overlay';
    overlay.className = 'settings-overlay hidden';
    overlay.innerHTML = `
      <div class="settings-panel" style="width: 600px">
        <div class="settings-header">
          <h2>站点管理</h2>
          <div class="site-manager-actions">
            <button id="btn-add-site" class="settings-action-btn">+ 添加站点</button>
            <button id="site-manager-close" class="settings-close-btn">✕</button>
          </div>
        </div>
        <div class="settings-content" id="site-list-container">
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('site-manager-close').addEventListener('click', () => this.close());
    document.getElementById('btn-add-site').addEventListener('click', () => this.showAddSite());
  }

  async open() {
    this.isOpen = true;
    document.getElementById('site-manager-overlay').classList.remove('hidden');
    await this.renderSiteList();
  }

  close() {
    this.isOpen = false;
    document.getElementById('site-manager-overlay').classList.add('hidden');
  }

  async renderSiteList() {
    const sites = await window.api.getSites();
    const container = document.getElementById('site-list-container');

    container.innerHTML = sites.map(site => `
      <div class="site-card" data-site-id="${site.id}">
        <div class="site-card-header">
          <span class="site-card-icon">${site.icon}</span>
          <span class="site-card-name">${site.name}</span>
          <div class="site-card-actions">
            <button class="site-edit-btn" data-site-id="${site.id}">✎</button>
            <button class="site-delete-btn" data-site-id="${site.id}">🗑</button>
          </div>
        </div>
        <div class="site-card-details">
          <div class="site-detail">
            <span class="detail-label">URL:</span>
            <span class="detail-value">${site.url}</span>
          </div>
          <div class="site-detail">
            <span class="detail-label">代理:</span>
            <span class="detail-value">${site.proxy || '默认'}</span>
          </div>
          <div class="site-detail">
            <span class="detail-label">账号:</span>
            <div class="account-list-inline">
              ${site.accounts.map(acc => `
                <span class="account-tag ${acc.isDefault ? 'default' : ''}">${acc.label}</span>
              `).join('')}
              <button class="add-account-btn" data-site-id="${site.id}">+ 添加</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    // Bind events
    container.querySelectorAll('.site-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => this.showEditSite(btn.dataset.siteId));
    });

    container.querySelectorAll('.site-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteSite(btn.dataset.siteId));
    });

    container.querySelectorAll('.add-account-btn').forEach(btn => {
      btn.addEventListener('click', () => this.addAccount(btn.dataset.siteId));
    });
  }

  showAddSite() {
    const name = prompt('站点名称:');
    if (!name) return;
    const url = prompt('站点 URL:', 'https://');
    if (!url) return;
    const icon = prompt('图标 (emoji):', '🌐') || '🌐';
    const color = prompt('颜色 (hex):', '#89b4fa') || '#89b4fa';

    window.api.addSite({ name, url, icon, color });
    this.renderSiteList();
    this.sidebar.loadSites().then(() => this.sidebar.render());
  }

  async showEditSite(siteId) {
    const sites = await window.api.getSites();
    const site = sites.find(s => s.id === siteId);
    if (!site) return;

    const name = prompt('站点名称:', site.name);
    if (!name) return;
    const url = prompt('站点 URL:', site.url);
    if (!url) return;
    const proxy = prompt('代理地址 (留空使用默认):', site.proxy || '');

    await window.api.updateSite(siteId, { name, url, proxy });
    await this.renderSiteList();
    await this.sidebar.loadSites();
    this.sidebar.render();
  }

  async deleteSite(siteId) {
    if (!confirm('确定要删除此站点吗？所有账号数据将被清除。')) return;
    await window.api.deleteSite(siteId);
    await this.renderSiteList();
    await this.sidebar.loadSites();
    this.sidebar.render();
  }

  async addAccount(siteId) {
    const label = prompt('账号名称:');
    if (!label) return;

    const accountId = `${siteId}-${Date.now()}`;
    await window.api.addAccount(siteId, { id: accountId, label });
    await this.renderSiteList();
    await this.sidebar.loadSites();
    this.sidebar.render();
  }
}

module.exports = SiteManager;
```

- [ ] **Step 2: Add site manager CSS**

```css
/* Add to main.css */
.site-manager-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.site-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
}

.site-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-secondary);
}

.site-card-icon {
  font-size: 20px;
}

.site-card-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
}

.site-card-actions {
  display: flex;
  gap: 4px;
}

.site-edit-btn,
.site-delete-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
}

.site-edit-btn:hover,
.site-delete-btn:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.site-delete-btn:hover {
  color: var(--danger);
}

.site-card-details {
  padding: 12px 16px;
}

.site-detail {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
}

.detail-label {
  color: var(--text-secondary);
  min-width: 40px;
}

.detail-value {
  color: var(--text-primary);
  word-break: break-all;
}

.account-list-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.account-tag {
  padding: 2px 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 11px;
}

.account-tag.default {
  border-color: var(--accent);
  color: var(--accent);
}

.add-account-btn {
  padding: 2px 8px;
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.add-account-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
```

- [ ] **Step 3: Wire site manager into app.js**

```javascript
// Add to src/renderer/app.js
const SiteManager = require('./site-manager');

// After settings panel:
const siteManager = new SiteManager(sidebar);

// Add site manager button to sidebar bottom
const siteManagerBtn = document.createElement('button');
siteManagerBtn.className = 'sidebar-btn';
siteManagerBtn.title = '站点管理';
siteManagerBtn.textContent = '📋';
siteManagerBtn.addEventListener('click', () => siteManager.open());
document.getElementById('sidebar-bottom').insertBefore(siteManagerBtn, document.getElementById('btn-settings'));
```

- [ ] **Step 4: Test site management**

Run: `npm start`, click site manager button
Expected: Can add/edit/delete sites, manage accounts

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: site management panel with add/edit/delete and account management"
```

---

### Task 10: Keyboard Shortcuts

**Covers:** Global hotkey, site switching, zoom, navigation shortcuts

**Files:**
- Modify: `src/main/main.js`
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Add global shortcut registration**

```javascript
// Add to src/main/main.js
const { globalShortcut } = require('electron');

// After createWindow:
function registerShortcuts() {
  const settings = configStore.getSettings();

  // Global hotkey to show/hide
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

// Call after window is ready
app.whenReady().then(() => {
  createWindow();
  registerShortcuts();
});

// Re-register when settings change
ipcMain.handle('settings:update', (e, settings) => {
  configStore.updateSettings(settings);
  globalShortcut.unregisterAll();
  registerShortcuts();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
```

- [ ] **Step 2: Add renderer keyboard shortcuts**

```javascript
// Add to src/renderer/app.js - keyboard shortcuts section
document.addEventListener('keydown', async (e) => {
  // Ctrl+1-9: Switch to site by index
  if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const index = parseInt(e.key) - 1;
    const sites = await window.api.getSites();
    if (sites[index]) {
      const site = sites[index];
      const defaultAccount = site.accounts.find(a => a.isDefault) || site.accounts[0];
      sidebar.selectSite(site.id, defaultAccount.id);
    }
    return;
  }

  // Ctrl+Tab: Next site
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    const sites = await window.api.getSites();
    const currentIndex = sites.findIndex(s => s.id === sidebar.activeSiteId);
    const nextIndex = e.shiftKey
      ? (currentIndex - 1 + sites.length) % sites.length
      : (currentIndex + 1) % sites.length;
    const nextSite = sites[nextIndex];
    const defaultAccount = nextSite.accounts.find(a => a.isDefault) || nextSite.accounts[0];
    sidebar.selectSite(nextSite.id, defaultAccount.id);
    return;
  }

  // Ctrl+L: Focus URL bar
  if (e.ctrlKey && e.key === 'l') {
    e.preventDefault();
    const urlText = document.getElementById('url-text');
    if (urlText) {
      const range = document.createRange();
      range.selectNodeContents(urlText);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return;
  }

  // Ctrl++/Ctrl+-: Zoom
  if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    toolbar.zoom(10);
    return;
  }
  if (e.ctrlKey && e.key === '-') {
    e.preventDefault();
    toolbar.zoom(-10);
    return;
  }

  // Ctrl+0: Reset zoom
  if (e.ctrlKey && e.key === '0') {
    e.preventDefault();
    toolbar.setZoom(100);
    return;
  }

  // F5 / Ctrl+R: Refresh
  if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
    e.preventDefault();
    window.api.refresh?.();
    return;
  }

  // Ctrl+Shift+R: Force refresh
  if (e.ctrlKey && e.shiftKey && e.key === 'R') {
    e.preventDefault();
    window.api.forceRefresh?.();
    return;
  }

  // Alt+Left/Right: Navigation
  if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    window.api.goBack?.();
    return;
  }
  if (e.altKey && e.key === 'ArrowRight') {
    e.preventDefault();
    window.api.goForward?.();
    return;
  }

  // Ctrl+W: Hibernate current
  if (e.ctrlKey && e.key === 'w') {
    e.preventDefault();
    if (sidebar.activeSiteId) {
      window.api.hibernateSite(sidebar.activeSiteId);
    }
    return;
  }

  // Ctrl+N: Add new site
  if (e.ctrlKey && e.key === 'n') {
    e.preventDefault();
    siteManager.showAddSite();
    return;
  }

  // Escape: Close panels
  if (e.key === 'Escape') {
    if (settingsPanel.isOpen) settingsPanel.close();
    if (siteManager.isOpen) siteManager.close();
  }
});
```

- [ ] **Step 3: Test shortcuts**

Run: `npm start`
Expected: Ctrl+1-9 switches sites, Ctrl+Tab cycles, zoom shortcuts work

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: keyboard shortcuts for site switching, zoom, and navigation"
```

---

### Task 11: System Tray & Window Behavior

**Covers:** System tray, minimize to tray, close to tray

**Files:**
- Create: `src/main/tray-manager.js`
- Modify: `src/main/main.js`

- [ ] **Step 1: Create tray manager**

```javascript
// src/main/tray-manager.js
const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

class TrayManager {
  constructor(mainWindow, configStore) {
    this.mainWindow = mainWindow;
    this.configStore = configStore;
    this.tray = null;
    this.isQuitting = false;

    this.init();
  }

  init() {
    // Create tray icon
    const iconPath = this.getTrayIcon();
    this.tray = new Tray(iconPath);

    this.tray.setToolTip('AI Workspace');

    this.updateContextMenu();

    this.tray.on('double-click', () => {
      this.mainWindow.show();
      this.mainWindow.focus();
    });

    // Handle close to tray
    this.mainWindow.on('close', (e) => {
      const settings = this.configStore.getSettings();
      if (!this.isQuitting && settings.minimizeToTray) {
        e.preventDefault();
        this.mainWindow.hide();
      }
    });

    app.on('before-quit', () => {
      this.isQuitting = true;
    });
  }

  getTrayIcon() {
    // Create a simple tray icon programmatically
    const icon = nativeImage.createEmpty();
    // In production, use a proper .ico file
    // For now, create a 16x16 colored icon
    return icon;
  }

  updateContextMenu() {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示 AI Workspace',
        click: () => {
          this.mainWindow.show();
          this.mainWindow.focus();
        }
      },
      { type: 'separator' },
      {
        label: '站点管理',
        click: () => {
          this.mainWindow.show();
          this.mainWindow.webContents.send('open:siteManager');
        }
      },
      {
        label: '设置',
        click: () => {
          this.mainWindow.show();
          this.mainWindow.webContents.send('open:settings');
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          this.isQuitting = true;
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = TrayManager;
```

- [ ] **Step 2: Wire tray into main.js**

```javascript
// Add to src/main/main.js
const TrayManager = require('./tray-manager');

let trayManager;

// After createWindow:
trayManager = new TrayManager(mainWindow, configStore);

// Listen for open commands from tray
ipcMain.on('open:siteManager', () => {
  mainWindow.webContents.send('open:siteManager');
});

ipcMain.on('open:settings', () => {
  mainWindow.webContents.send('open:settings');
});
```

- [ ] **Step 3: Update app.js to handle tray commands**

```javascript
// Add to src/renderer/app.js
window.api.onOpenSiteManager?.(() => siteManager.open());
window.api.onOpenSettings?.(() => settingsPanel.open());
```

- [ ] **Step 4: Update preload with tray events**

```javascript
// Add to src/main/preload.js
onOpenSiteManager: (callback) => ipcRenderer.on('open:siteManager', () => callback()),
onOpenSettings: (callback) => ipcRenderer.on('open:settings', () => callback()),
```

- [ ] **Step 5: Test tray**

Run: `npm start`, close window
Expected: App minimizes to tray, double-click restores, context menu works

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: system tray with minimize-to-tray and context menu"
```

---

### Task 12: Proxy Configuration Per Site

**Covers:** Per-site proxy UI, proxy templates, TUN detection

**Files:**
- Modify: `src/renderer/site-manager.js`
- Modify: `src/main/session-manager.js`

- [ ] **Step 1: Add proxy UI to site edit dialog**

```javascript
// Update showEditSite in site-manager.js
async showEditSite(siteId) {
  const sites = await window.api.getSites();
  const site = sites.find(s => s.id === siteId);
  if (!site) return;

  // Create a proper edit dialog instead of prompt
  const dialog = document.createElement('div');
  dialog.className = 'edit-dialog-overlay';
  dialog.innerHTML = `
    <div class="edit-dialog">
      <h3>编辑站点 - ${site.name}</h3>
      <div class="edit-field">
        <label>名称</label>
        <input type="text" id="edit-name" value="${site.name}">
      </div>
      <div class="edit-field">
        <label>URL</label>
        <input type="text" id="edit-url" value="${site.url}">
      </div>
      <div class="edit-field">
        <label>图标 (emoji)</label>
        <input type="text" id="edit-icon" value="${site.icon}">
      </div>
      <div class="edit-field">
        <label>颜色</label>
        <input type="color" id="edit-color" value="${site.color}">
      </div>
      <div class="edit-field">
        <label>代理</label>
        <select id="edit-proxy-mode">
          <option value="" ${!site.proxy ? 'selected' : ''}>使用默认</option>
          <option value="direct" ${site.proxy === 'direct' ? 'selected' : ''}>直连</option>
          <option value="custom" ${site.proxy && site.proxy !== 'direct' ? 'selected' : ''}>自定义</option>
        </select>
        <input type="text" id="edit-proxy" value="${site.proxy || ''}" placeholder="http://127.0.0.1:7890" style="display:${site.proxy && site.proxy !== 'direct' ? 'block' : 'none'}">
      </div>
      <div class="edit-actions">
        <button id="edit-cancel" class="settings-action-btn">取消</button>
        <button id="edit-save" class="settings-action-btn primary">保存</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  // Handle proxy mode change
  dialog.querySelector('#edit-proxy-mode').addEventListener('change', (e) => {
    dialog.querySelector('#edit-proxy').style.display =
      e.target.value === 'custom' ? 'block' : 'none';
  });

  // Cancel
  dialog.querySelector('#edit-cancel').addEventListener('click', () => dialog.remove());

  // Save
  dialog.querySelector('#edit-save').addEventListener('click', async () => {
    const proxyMode = dialog.querySelector('#edit-proxy-mode').value;
    let proxy = '';
    if (proxyMode === 'direct') proxy = 'direct';
    else if (proxyMode === 'custom') proxy = dialog.querySelector('#edit-proxy').value;

    await window.api.updateSite(siteId, {
      name: dialog.querySelector('#edit-name').value,
      url: dialog.querySelector('#edit-url').value,
      icon: dialog.querySelector('#edit-icon').value,
      color: dialog.querySelector('#edit-color').value,
      proxy
    });

    dialog.remove();
    await this.renderSiteList();
    await this.sidebar.loadSites();
    this.sidebar.render();
  });
}
```

- [ ] **Step 2: Add edit dialog CSS**

```css
/* Add to main.css */
.edit-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
}

.edit-dialog {
  width: 400px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
}

.edit-dialog h3 {
  margin-bottom: 16px;
  font-size: 16px;
}

.edit-field {
  margin-bottom: 12px;
}

.edit-field label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.edit-field input,
.edit-field select {
  width: 100%;
  height: 32px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 0 10px;
  font-size: 12px;
}

.edit-field input:focus,
.edit-field select:focus {
  outline: none;
  border-color: var(--accent);
}

.edit-field input[type="color"] {
  height: 40px;
  padding: 4px;
  cursor: pointer;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.settings-action-btn.primary {
  background: var(--accent);
  color: var(--bg-primary);
  border-color: var(--accent);
}

.settings-action-btn.primary:hover {
  background: var(--accent-hover);
}
```

- [ ] **Step 3: Apply proxy when creating views**

```javascript
// Update view-manager.js createView method
async createView(site, account) {
  // ... existing code ...

  // Set proxy if configured
  if (site.proxy) {
    const ses = getSession(account.partition);
    if (site.proxy === 'direct') {
      await ses.setProxy({ mode: 'direct' });
    } else {
      await ses.setProxy({
        mode: 'fixed_servers',
        proxyRules: site.proxy
      });
    }
  }

  // ... rest of method ...
}
```

- [ ] **Step 4: Test proxy configuration**

Run: `npm start`, edit a site, set proxy to direct
Expected: Site loads without proxy

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: per-site proxy configuration with edit dialog"
```

---

### Task 13: Status Bar & Memory Display

**Covers:** Status bar with current site info, proxy status, memory usage

**Files:**
- Modify: `src/renderer/app.js`
- Modify: `src/renderer/styles/main.css`

- [ ] **Step 1: Create status bar updater**

```javascript
// Add to src/renderer/app.js
class StatusBar {
  constructor() {
    this.container = document.getElementById('statusbar');
    this.updateInterval = null;
    this.init();
  }

  init() {
    this.update();
    this.updateInterval = setInterval(() => this.update(), 5000);
  }

  async update() {
    const sites = await window.api.getSites();
    const active = await window.api.getActiveState?.() || {};
    const hibernateStatus = await window.api.getHibernateStatus?.() || {};

    const currentSite = sites.find(s => s.id === active.siteId);
    const currentAccount = currentSite?.accounts.find(a => a.id === active.accountId);

    const parts = [];

    // Current site/account
    if (currentSite) {
      parts.push(`${currentSite.icon} ${currentSite.name}${currentAccount ? ' - ' + currentAccount.label : ''}`);
    }

    // Proxy status
    if (currentSite?.proxy) {
      parts.push(`代理: ${currentSite.proxy === 'direct' ? '直连' : currentSite.proxy}`);
    }

    // Memory/hibernation status
    if (hibernationStatus.total !== undefined) {
      parts.push(`活跃: ${hibernationStatus.active} | 休眠: ${hibernationStatus.hibernated}`);
    }

    this.container.innerHTML = parts.map(p => `<span>${p}</span>`).join('<span class="status-separator">|</span>');
  }
}

// Initialize after other components
const statusBar = new StatusBar();
```

- [ ] **Step 2: Add status bar CSS**

```css
/* Add to main.css */
.status-separator {
  color: var(--border);
  margin: 0 8px;
}

#statusbar span {
  font-size: 11px;
}
```

- [ ] **Step 3: Add getActiveState to preload**

```javascript
// Add to src/main/preload.js
getActiveState: () => ipcRenderer.invoke('site:getActiveState'),
```

```javascript
// Add to src/main/main.js
ipcMain.handle('site:getActiveState', () => configStore.getActiveState());
```

- [ ] **Step 4: Test status bar**

Run: `npm start`, switch between sites
Expected: Status bar updates with current site name and status

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: status bar with site info and hibernation status"
```

---

### Task 14: Drag & Drop Reordering

**Covers:** Sidebar drag to reorder sites

**Files:**
- Modify: `src/renderer/sidebar.js`
- Modify: `src/renderer/styles/main.css`

- [ ] **Step 1: Add drag and drop to sidebar**

```javascript
// Add to sidebar.js - in createSiteElement method
createSiteElement(site) {
  // ... existing code ...

  // Make draggable
  wrapper.draggable = true;
  wrapper.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', site.id);
    wrapper.classList.add('dragging');
  });

  wrapper.addEventListener('dragend', () => {
    wrapper.classList.remove('dragging');
  });

  wrapper.addEventListener('dragover', (e) => {
    e.preventDefault();
    wrapper.classList.add('drag-over');
  });

  wrapper.addEventListener('dragleave', () => {
    wrapper.classList.remove('drag-over');
  });

  wrapper.addEventListener('drop', async (e) => {
    e.preventDefault();
    wrapper.classList.remove('drag-over');

    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId === site.id) return;

    const sites = await window.api.getSites();
    const draggedIndex = sites.findIndex(s => s.id === draggedId);
    const targetIndex = sites.findIndex(s => s.id === site.id);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder
    const [dragged] = sites.splice(draggedIndex, 1);
    sites.splice(targetIndex, 0, dragged);

    // Update order
    for (let i = 0; i < sites.length; i++) {
      await window.api.updateSite(sites[i].id, { order: i });
    }

    await this.loadSites();
    this.render();
  });

  return wrapper;
}
```

- [ ] **Step 2: Add drag CSS**

```css
/* Add to main.css */
.site-item.dragging {
  opacity: 0.5;
}

.site-item.drag-over {
  border-top: 2px solid var(--accent);
}
```

- [ ] **Step 3: Test drag and drop**

Run: `npm start`, drag sites in sidebar
Expected: Sites reorder and position persists

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: drag and drop site reordering in sidebar"
```

---

### Task 15: Custom Context Menu

**Covers:** Right-click menu for webviews, copy/paste, navigation

**Files:**
- Modify: `src/main/webview-preload.js`
- Create: `src/main/context-menu.js`

- [ ] **Step 1: Create context menu handler**

```javascript
// src/main/context-menu.js
const { Menu, MenuItem, BrowserWindow } = require('electron');

function setupContextMenu(mainWindow) {
  mainWindow.webContents.on('context-menu', (e, params) => {
    const template = [
      { label: '后退', enabled: params.canGoBack, click: () => mainWindow.webContents.goBack() },
      { label: '前进', enabled: params.canGoForward, click: () => mainWindow.webContents.goForward() },
      { type: 'separator' },
      { label: '刷新', click: () => mainWindow.webContents.reload() },
      { type: 'separator' }
    ];

    if (params.selectionText) {
      template.push(
        { label: '复制', role: 'copy' },
        { type: 'separator' }
      );
    }

    if (params.isEditable) {
      template.push(
        { label: '剪切', role: 'cut' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
        { type: 'separator' }
      );
    }

    if (params.linkURL) {
      template.push(
        { label: '复制链接', click: () => require('electron').clipboard.writeText(params.linkURL) },
        { type: 'separator' }
      );
    }

    template.push(
      { label: '检查元素', click: () => mainWindow.webContents.inspectElement(params.x, params.y) }
    );

    const menu = Menu.buildFromTemplate(template);
    menu.popup();
  });
}

module.exports = { setupContextMenu };
```

- [ ] **Step 2: Wire context menu into main.js**

```javascript
// Add to src/main/main.js
const { setupContextMenu } = require('./context-menu');

// After createWindow:
setupContextMenu(mainWindow);
```

- [ ] **Step 3: Test context menu**

Run: `npm start`, right-click on page
Expected: Custom context menu appears with appropriate options

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: custom context menu with copy/paste and navigation"
```

---

### Task 16: Auto-Launch on Startup

**Covers:** Windows auto-start option

**Files:**
- Modify: `src/main/main.js`

- [ ] **Step 1: Add auto-launch support**

```javascript
// Add to src/main/main.js
const { app } = require('electron');

function setAutoLaunch(enable) {
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: app.getPath('exe')
  });
}

// Update settings handler to apply auto-launch
ipcMain.handle('settings:update', (e, settings) => {
  configStore.updateSettings(settings);

  if (settings.autoLaunch !== undefined) {
    setAutoLaunch(settings.autoLaunch);
  }

  // ... rest of handler
});

// Apply on startup
app.whenReady().then(() => {
  const settings = configStore.getSettings();
  if (settings.autoLaunch) {
    setAutoLaunch(true);
  }
  // ... rest of init
});
```

- [ ] **Step 2: Test auto-launch**

Run: `npm start`, enable auto-launch in settings, restart computer
Expected: App starts automatically on login

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: auto-launch on Windows startup option"
```

---

### Task 17: Final Integration & Polish

**Covers:** Integration testing, bug fixes, final polish

**Files:**
- Various fixes as needed

- [ ] **Step 1: Run full integration test**

Test all features:
1. App launches with frameless window
2. Sidebar shows 8 default AI sites
3. Clicking a site loads it in WebContentsView
4. Multiple sites can be opened
5. Hibernation works after timeout
6. Settings panel opens and saves
7. Site manager can add/edit/delete sites
8. Keyboard shortcuts work
9. System tray works
10. Window state persists

- [ ] **Step 2: Fix any integration issues**

Address any bugs found during testing.

- [ ] **Step 3: Add package.json build scripts**

```json
{
  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev",
    "build": "electron-builder --win --publish never",
    "build:publish": "electron-builder --win --publish always"
  }
}
```

- [ ] **Step 4: Create app icon**

Create a simple icon for the app (or use a placeholder).

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: final integration and polish for v1.0 release"
```

- [ ] **Step 6: Build distributable**

```bash
npm run build
```

Expected: `dist/` folder created with Windows installer

---

## Summary

This plan covers all Phase 1-4 features from the design document:

- **Phase 1 (Tasks 1-6):** Core skeleton - Electron setup, window management, sidebar, BrowserView
- **Phase 2 (Tasks 7-9):** Core features - Hibernation, multi-account, site management
- **Phase 3 (Tasks 10-14):** UX polish - Shortcuts, tray, proxy, drag-drop, context menu
- **Phase 4 (Tasks 15-17):** Production - Auto-launch, integration, build

Each task is independently testable and produces a working increment.
