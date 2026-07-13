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
  const primary = screen.getPrimaryDisplay();
  let display = primary;

  if (saved.x !== undefined && saved.y !== undefined) {
    const bounds = { x: saved.x, y: saved.y, width: saved.width, height: saved.height };
    display = screen.getDisplayMatching(bounds);
    const area = display.workArea;
    const visibleWidth = Math.max(0, Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x));
    const visibleHeight = Math.max(0, Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y));
    if (visibleWidth < 100 || visibleHeight < 100) {
      saved.x = undefined;
      saved.y = undefined;
      display = primary;
    }
  }

  const { width, height } = display.workAreaSize;

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
  const bounds = mainWindow.getNormalBounds();

  store.set('windowState', {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized
  });
}

module.exports = { getWindowState, saveWindowState };
