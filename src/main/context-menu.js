const { Menu, clipboard } = require('electron');

function setupContextMenu(webContents, getMainWindow, isEnabled = () => true) {
  webContents.on('context-menu', (e, params) => {
    if (!isEnabled()) return;
    const template = [];

    // Navigation (only for webviews that support it)
    if (params.pageURL) {
      const history = webContents.navigationHistory;
      template.push(
        { label: '后退', enabled: history?.canGoBack?.() || false, click: () => history.goBack() },
        { label: '前进', enabled: history?.canGoForward?.() || false, click: () => history.goForward() },
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
