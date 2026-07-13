const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const ViewManager = require('../src/main/view-manager');

class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.url = '';
    this.loadedUrls = [];
    this.navigationHistory = {
      canGoBack: () => false,
      canGoForward: () => false
    };
  }

  setUserAgent(userAgent) { this.userAgent = userAgent; }
  setWindowOpenHandler() {}
  getURL() { return this.url; }
  close() { this.closed = true; }

  async loadURL(url) {
    this.url = url;
    this.loadedUrls.push(url);
  }
}

class FakeWebContentsView {
  constructor(options = {}) {
    this.options = options;
    this.webContents = new FakeWebContents();
  }

  setVisible(visible) { this.visible = visible; }
  setBounds(bounds) { this.bounds = bounds; }
}

test('site views use a sandboxed Chrome-like environment without a fingerprinting preload', async () => {
  const session = {
    getUserAgent: () => (
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
      + 'AppleWebKit/537.36 (KHTML, like Gecko) '
      + 'Chrome/145.0.0.0 Safari/537.36 Electron/43.1.0 ai-workspace/1.0.0'
    )
  };
  const manager = new ViewManager(createWindow(), {
    WebContentsView: FakeWebContentsView,
    getSession: () => session,
    setProxy: async () => {},
    setupContextMenu: () => {}
  });

  const viewData = await manager.createView(
    { id: 'chat', name: 'Chat', url: 'https://chat.example/' },
    { id: 'personal', partition: 'persist:personal' }
  );

  assert.equal(viewData.view.options.webPreferences.contextIsolation, true);
  assert.equal(viewData.view.options.webPreferences.nodeIntegration, false);
  assert.equal(viewData.view.options.webPreferences.sandbox, true);
  assert.equal(viewData.view.options.webPreferences.preload, undefined);
  assert.equal(
    viewData.view.webContents.userAgent,
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
      + 'AppleWebKit/537.36 (KHTML, like Gecko) '
      + 'Chrome/145.0.0.0 Safari/537.36'
  );
});

function createWindow() {
  return {
    contentView: {
      addChildView() {},
      removeChildView() {}
    },
    getContentBounds: () => ({ width: 1200, height: 800 }),
    webContents: { send() {} }
  };
}

test('activating a hibernated account rebuilds it at the saved URL', async () => {
  const manager = new ViewManager(createWindow(), {
    WebContentsView: FakeWebContentsView,
    getSession: () => ({}),
    setProxy: async () => {},
    setupContextMenu: () => {}
  });
  const site = { id: 'chat', name: 'Chat', url: 'https://chat.example/' };
  const account = { id: 'personal', partition: 'persist:personal' };

  await manager.activate(site, account);
  const firstView = manager.getActiveView().view;
  firstView.webContents.url = 'https://chat.example/thread/42';
  manager.hibernate(site.id, account.id);

  const restored = await manager.activate(site, account);

  assert.equal(restored.state, 'active');
  assert.notEqual(restored.view, firstView);
  assert.equal(restored.view.webContents.loadedUrls.at(-1), 'https://chat.example/thread/42');
  assert.equal(restored.view.visible, true);
});

test('late navigation events are ignored after the host window is destroyed', async () => {
  const mainWindow = createWindow();
  let hostDestroyed = false;
  mainWindow.webContents.isDestroyed = () => hostDestroyed;
  mainWindow.webContents.send = () => {
    if (hostDestroyed) throw new Error('Object has been destroyed');
  };
  const manager = new ViewManager(mainWindow, {
    WebContentsView: FakeWebContentsView,
    getSession: () => ({}),
    setProxy: async () => {},
    setupContextMenu: () => {}
  });
  const site = { id: 'chat', name: 'Chat', url: 'https://chat.example/' };
  const account = { id: 'personal', partition: 'persist:personal' };
  await manager.activate(site, account);

  hostDestroyed = true;

  assert.doesNotThrow(() => {
    manager.getActiveView().view.webContents.emit('did-navigate');
  });
});

test('late badge events are ignored after the host window is destroyed', async () => {
  const mainWindow = createWindow();
  let hostDestroyed = false;
  mainWindow.webContents.isDestroyed = () => hostDestroyed;
  mainWindow.webContents.send = () => {
    if (hostDestroyed) throw new Error('Object has been destroyed');
  };
  const manager = new ViewManager(mainWindow, {
    WebContentsView: FakeWebContentsView,
    getSession: () => ({}),
    setProxy: async () => {},
    setupContextMenu: () => {}
  });
  const site = { id: 'chat', name: 'Chat', url: 'https://chat.example/' };
  const account = { id: 'personal', partition: 'persist:personal' };
  await manager.activate(site, account);

  hostDestroyed = true;

  assert.doesNotThrow(() => {
    manager.getActiveView().view.webContents.emit('page-title-updated', {}, 'Inbox (3)');
  });
});

test('navigation state ignores a destroyed child view', async () => {
  const manager = new ViewManager(createWindow(), {
    WebContentsView: FakeWebContentsView,
    getSession: () => ({}),
    setProxy: async () => {},
    setupContextMenu: () => {}
  });
  const site = { id: 'chat', name: 'Chat', url: 'https://chat.example/' };
  const account = { id: 'personal', partition: 'persist:personal' };
  await manager.activate(site, account);
  const contents = manager.getActiveView().view.webContents;
  contents.isDestroyed = () => true;
  contents.getURL = () => {
    throw new Error('Object has been destroyed');
  };

  assert.doesNotThrow(() => manager.sendNavigationState());
});
