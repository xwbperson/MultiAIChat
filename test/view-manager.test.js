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

  setUserAgent() {}
  setWindowOpenHandler() {}
  getURL() { return this.url; }
  close() { this.closed = true; }

  async loadURL(url) {
    this.url = url;
    this.loadedUrls.push(url);
  }
}

class FakeWebContentsView {
  constructor() {
    this.webContents = new FakeWebContents();
  }

  setVisible(visible) { this.visible = visible; }
  setBounds(bounds) { this.bounds = bounds; }
}

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
