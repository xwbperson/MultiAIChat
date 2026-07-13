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
});
