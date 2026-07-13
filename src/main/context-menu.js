const { Menu, clipboard } = require('electron');

function setupContextMenu(webContents, getMainWindow) {
  webContents.on('context-menu', (e, params) => {
    const mainWindow = getMainWindow();
    const template = [];

    // Navigation (only for webviews that support it)
    if (params.pageURL) {
      template.push(
        { label: '后退', enabled: params.canGoBack, click: () => webContents.goBack() },
        { label: '前进', enabled: params.canGoForward, click: () => webContents.goForward() },
        { type: 'separator' },
        { label: '刷新', click: () => webContents.reload() },
        { type: 'separator' }
      );
    }

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
        { label: '复制链接', click: () => clipboard.writeText(params.linkURL) },
        { type: 'separator' }
      );
    }

    template.push(
      { label: '检查元素', click: () => webContents.inspectElement(params.x, params.y) }
    );

    const menu = Menu.buildFromTemplate(template);
    menu.popup();
  });
}

module.exports = { setupContextMenu };
