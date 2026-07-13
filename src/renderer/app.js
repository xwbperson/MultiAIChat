document.addEventListener('DOMContentLoaded', () => {
  const btnMinimize = document.getElementById('btn-minimize');
  const btnMaximize = document.getElementById('btn-maximize');
  const btnClose = document.getElementById('btn-close');

  btnMinimize.addEventListener('click', () => window.api.minimize());
  btnMaximize.addEventListener('click', async () => {
    const isMaximized = await window.api.maximize();
    updateMaximizeButton(isMaximized);
  });
  btnClose.addEventListener('click', () => window.api.close());

  function updateMaximizeButton(isMaximized) {
    btnMaximize.textContent = isMaximized ? '❐' : '□';
  }

  window.api.onMaximizeChanged(updateMaximizeButton);
  window.api.isMaximized().then(updateMaximizeButton);

  const sidebar = new Sidebar();
  const toolbar = new Toolbar();
  const settingsPanel = new SettingsPanel();
  const siteManager = new SiteManager(sidebar);

  const siteManagerBtn = document.createElement('button');
  siteManagerBtn.className = 'sidebar-btn';
  siteManagerBtn.title = '站点管理';
  siteManagerBtn.textContent = '📋';
  siteManagerBtn.addEventListener('click', () => siteManager.open());
  document.getElementById('sidebar-bottom').insertBefore(siteManagerBtn, document.getElementById('btn-settings'));
});
