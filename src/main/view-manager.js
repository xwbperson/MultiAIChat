const { WebContentsView } = require('electron');
const path = require('path');
const { getSession, setProxy } = require('./session-manager');
const { setupContextMenu } = require('./context-menu');

class ViewManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.views = new Map();
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

    this.mainWindow.contentView.addChildView(view);
    this.updateViewBounds(view);
    view.webContents.loadURL(site.url);

    // Context menu for webview
    setupContextMenu(view.webContents, () => this.mainWindow);

    const viewData = {
      view,
      state: 'loading',
      url: site.url,
      siteId: site.id,
      accountId: account.id,
      lastActive: Date.now(),
      partition: account.partition
    };

    this.views.set(key, viewData);

    view.webContents.on('page-title-updated', (e, title) => {
      const match = title.match(/\((\d+)\)/);
      if (match) {
        this.mainWindow.webContents.send('badge:update', {
          siteId: site.id,
          count: parseInt(match[1])
        });
      }
    });

    view.webContents.on('did-finish-load', () => {
      viewData.state = 'idle';
      viewData.url = view.webContents.getURL();
    });

    return viewData;
  }

  async switchTo(siteId, accountId) {
    const key = this.getKey(siteId, accountId);

    if (this.activeKey && this.views.has(this.activeKey)) {
      const current = this.views.get(this.activeKey);
      current.view.setVisible(false);
      if (current.state === 'active') {
        current.state = 'idle';
        current.lastActive = Date.now();
      }
    }

    let viewData = this.views.get(key);
    if (!viewData) {
      return null;
    }

    viewData.view.setVisible(true);
    viewData.state = 'active';
    viewData.lastActive = Date.now();
    this.activeKey = key;

    this.mainWindow.contentView.addChildView(viewData.view);

    return viewData;
  }

  hibernate(siteId, accountId) {
    const key = this.getKey(siteId, accountId);
    const viewData = this.views.get(key);
    if (!viewData || viewData.state === 'hibernated') return;

    viewData.url = viewData.view.webContents.getURL();
    viewData.state = 'hibernated';

    this.mainWindow.contentView.removeChildView(viewData.view);
    viewData.view.webContents.close();
    viewData.view = null;
  }

  async wake(siteId, accountId, site) {
    const key = this.getKey(siteId, accountId);
    const viewData = this.views.get(key);
    if (!viewData || viewData.state !== 'hibernated') return;

    const savedUrl = viewData.url;
    const partition = viewData.partition;

    // Remove stale entry so createView can build a fresh one
    this.views.delete(key);

    const newViewData = await this.createView(
      { ...site, proxy: partition },
      { id: accountId, partition: partition }
    );

    if (savedUrl && savedUrl !== site.url) {
      newViewData.view.webContents.loadURL(savedUrl);
    }

    return newViewData;
  }

  getView(siteId, accountId) {
    return this.views.get(this.getKey(siteId, accountId));
  }

  getActiveView() {
    if (!this.activeKey) return null;
    return this.views.get(this.activeKey) || null;
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
      x: 68,
      y: 72,
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
