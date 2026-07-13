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
    const icon = nativeImage.createEmpty();
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
