const { WebContentsView } = require('electron');
const path = require('path');
const { getSession, setProxy } = require('./session-manager');
const { setupContextMenu } = require('./context-menu');

class ViewManager {
  constructor(mainWindow, dependencies = {}) {
    this.mainWindow = mainWindow;
    this.views = new Map();
    this.activeKey = null;
    this.WebContentsView = dependencies.WebContentsView || WebContentsView;
    this.getSession = dependencies.getSession || getSession;
    this.setProxy = dependencies.setProxy || setProxy;
    this.setupContextMenu = dependencies.setupContextMenu || setupContextMenu;
    this.onBeforeInput = dependencies.onBeforeInput || null;
  }

  getKey(siteId, accountId) {
    return `${siteId}:${accountId}`;
  }

  canSendToHost() {
    if (!this.mainWindow || this.mainWindow.isDestroyed?.()) return false;
    const contents = this.mainWindow.webContents;
    return Boolean(contents && !contents.isDestroyed?.());
  }

  sendToHost(channel, payload) {
    if (!this.canSendToHost()) return false;
    this.mainWindow.webContents.send(channel, payload);
    return true;
  }

  async createView(site, account, proxyConfig = site.proxy, initialUrl = site.url) {
    const key = this.getKey(site.id, account.id);

    if (this.views.has(key)) {
      return this.views.get(key);
    }

    const ses = this.getSession(account.partition);
    await this.setProxy(account.partition, proxyConfig || 'direct');

    const view = new this.WebContentsView({
      webPreferences: {
        session: ses,
        preload: path.join(__dirname, 'webview-preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    const userAgent = ses.getUserAgent?.()
      ?.replace(/\sElectron\/\S+/g, '')
      .replace(/\sAI Workspace\/\S+/g, '');
    if (userAgent) view.webContents.setUserAgent(userAgent);

    this.mainWindow.contentView.addChildView(view);
    view.setVisible(false);
    this.updateViewBounds(view);
    const loadPromise = view.webContents.loadURL(initialUrl);
    loadPromise?.catch?.((error) => {
      console.error(`Failed to load ${initialUrl}:`, error);
    });

    // Context menu for webview
    this.setupContextMenu(view.webContents, () => this.mainWindow);
    if (this.onBeforeInput) {
      view.webContents.on('before-input-event', (event, input) => {
        if (this.onBeforeInput(input, { siteId: site.id, accountId: account.id })) {
          event.preventDefault();
        }
      });
    }

    const viewData = {
      view,
      state: 'loading',
      url: initialUrl,
      siteId: site.id,
      accountId: account.id,
      lastActive: Date.now(),
      partition: account.partition
    };

    this.views.set(key, viewData);

    view.webContents.on('page-title-updated', (e, title) => {
      const match = title.match(/\((\d+)\)/);
      if (match) {
        this.sendToHost('badge:update', {
          siteId: site.id,
          count: parseInt(match[1])
        });
      }
    });

    view.webContents.on('did-finish-load', () => {
      viewData.url = view.webContents.getURL();
      // Only set to idle if this is NOT the currently active view
      if (this.activeKey !== key) {
        viewData.state = 'idle';
      }
      // If it's the active view, keep state as 'active'
      this.sendNavigationState(key);
    });

    view.webContents.on('did-navigate', () => {
      viewData.url = view.webContents.getURL();
      this.sendNavigationState(key);
    });

    view.webContents.on('did-navigate-in-page', () => {
      viewData.url = view.webContents.getURL();
      this.sendNavigationState(key);
    });

    return viewData;
  }

  sendNavigationState(key = this.activeKey) {
    if (!key || key !== this.activeKey) return;
    const viewData = this.views.get(key);
    const contents = viewData?.view?.webContents;
    if (!contents || contents.isDestroyed?.()) return;
    const history = contents.navigationHistory;
    this.sendToHost('webview:navigationState', {
      url: contents.getURL(),
      canGoBack: history?.canGoBack?.() || false,
      canGoForward: history?.canGoForward?.() || false,
      zoomLevel: contents.getZoomLevel?.() || 0
    });
  }

  async activate(site, account, proxyConfig = site.proxy) {
    let viewData = this.getView(site.id, account.id);
    if (viewData?.state === 'hibernated') {
      viewData = await this.wake(site.id, account.id, site, account, proxyConfig);
    } else if (!viewData) {
      viewData = await this.createView(site, account, proxyConfig);
    }

    return this.switchTo(site.id, account.id);
  }

  async switchTo(siteId, accountId) {
    const key = this.getKey(siteId, accountId);

    // Hide current active view (if it exists and has a view)
    if (this.activeKey && this.views.has(this.activeKey)) {
      const current = this.views.get(this.activeKey);
      if (current.view) {
        current.view.setVisible(false);
      }
      if (current.state === 'active') {
        current.state = 'idle';
        current.lastActive = Date.now();
      }
    }

    let viewData = this.views.get(key);
    if (!viewData) {
      return null;
    }

    // Show the target view (if it has a view)
    if (viewData.view) {
      viewData.view.setVisible(true);
    }
    viewData.state = 'active';
    viewData.lastActive = Date.now();
    this.activeKey = key;

    if (viewData.view) {
      this.mainWindow.contentView.addChildView(viewData.view);
    }
    this.sendNavigationState(key);

    return viewData;
  }

  hibernate(siteId, accountId) {
    const key = this.getKey(siteId, accountId);
    const viewData = this.views.get(key);
    if (!viewData || !viewData.view || viewData.state === 'hibernated') return false;

    viewData.url = viewData.view.webContents.getURL();
    viewData.state = 'hibernated';

    this.mainWindow.contentView.removeChildView(viewData.view);
    viewData.view.webContents.close();
    viewData.view = null;
    return true;
  }

  async wake(siteId, accountId, site, account = {}, proxyConfig = site.proxy) {
    const key = this.getKey(siteId, accountId);
    const viewData = this.views.get(key);
    if (!viewData || viewData.state !== 'hibernated') return;

    const savedUrl = viewData.url;
    const partition = viewData.partition;

    // Remove stale entry so createView can build a fresh one
    this.views.delete(key);

    const newViewData = await this.createView(
      { ...site },
      { ...account, id: accountId, partition },
      proxyConfig,
      savedUrl || site.url
    );

    return newViewData;
  }

  getView(siteId, accountId) {
    return this.views.get(this.getKey(siteId, accountId));
  }

  getActiveView() {
    if (!this.activeKey) return null;
    return this.views.get(this.activeKey) || null;
  }

  hideActiveView() {
    const viewData = this.getActiveView();
    if (viewData?.view) {
      viewData.view.setVisible(false);
    }
  }

  showActiveView() {
    const viewData = this.getActiveView();
    if (viewData?.view) {
      viewData.view.setVisible(true);
    }
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
    view.setBounds({
      x: 80,
      y: 72,
      width: width - 80,
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
    if (this.activeKey === key) this.activeKey = null;
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
