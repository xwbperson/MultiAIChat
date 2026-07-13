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
