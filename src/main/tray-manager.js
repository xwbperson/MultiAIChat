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
    const iconPath = this.getTrayIcon();
    this.tray = new Tray(iconPath);
    this.tray.setToolTip('AI Workspace');
    this.updateContextMenu();

    this.tray.on('double-click', () => {
      this.mainWindow.show();
      this.mainWindow.focus();
    });
  }

  getTrayIcon() {
    // Create a simple 16x16 colored icon for the tray
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const offset = (y * size + x) * 4;
        // Create a simple "AI" pattern - blue circle
        const cx = x - size / 2;
        const cy = y - size / 2;
        const dist = Math.sqrt(cx * cx + cy * cy);
        if (dist < size / 2 - 1) {
          canvas[offset] = 0x89;     // R
          canvas[offset + 1] = 0xb4; // G
          canvas[offset + 2] = 0xfa; // B
          canvas[offset + 3] = 0xff; // A
        } else {
          canvas[offset] = 0x00;
          canvas[offset + 1] = 0x00;
          canvas[offset + 2] = 0x00;
          canvas[offset + 3] = 0x00;
        }
      }
    }
    return nativeImage.createFromBuffer(canvas, { width: size, height: size });
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
