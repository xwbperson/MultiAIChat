class StatusBar {
  constructor() {
    this.container = document.getElementById('statusbar');
    this.updateInterval = null;
    this.init();
  }

  init() {
    this.update();
    this.updateInterval = setInterval(() => this.update(), 5000);
  }

  async update() {
    try {
      const sites = await window.api.getSites();
      const active = await window.api.getActiveState?.() || {};
      const hibernateStatus = await window.api.getHibernateStatus?.() || {};

      const currentSite = sites.find(s => s.id === active.siteId);
      const currentAccount = currentSite?.accounts.find(a => a.id === active.accountId);

      const parts = [];

      if (currentSite) {
        parts.push(`${currentSite.icon} ${currentSite.name}${currentAccount ? ' - ' + currentAccount.label : ''}`);
      }

      if (currentSite?.proxy) {
        parts.push(`代理: ${currentSite.proxy === 'direct' ? '直连' : currentSite.proxy}`);
      }

      if (hibernateStatus.total !== undefined) {
        parts.push(`活跃: ${hibernateStatus.active} | 休眠: ${hibernateStatus.hibernated}`);
      }

      this.container.innerHTML = parts.map(p => `<span>${p}</span>`).join('<span class="status-separator">|</span>');
    } catch (err) {
      console.error('StatusBar update failed:', err);
    }
  }
}

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
  const statusBar = new StatusBar();

  // Connect sidebar and toolbar
  sidebar.setToolbar(toolbar);

  // Handle tray menu commands
  window.api.onOpenSiteManager?.(() => siteManager.open());
  window.api.onOpenSettings?.(() => settingsPanel.open());

  const siteManagerBtn = document.createElement('button');
  siteManagerBtn.className = 'sidebar-btn';
  siteManagerBtn.title = '站点管理';
  siteManagerBtn.textContent = '📋';
  siteManagerBtn.addEventListener('click', () => siteManager.open());
  document.getElementById('sidebar-bottom').insertBefore(siteManagerBtn, document.getElementById('btn-settings'));

  // Keyboard shortcuts
  document.addEventListener('keydown', async (e) => {
    // Ctrl+1-9: Switch to site by index
    if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const index = parseInt(e.key) - 1;
      const sites = await window.api.getSites();
      if (sites[index]) {
        const site = sites[index];
        const defaultAccount = site.accounts.find(a => a.isDefault) || site.accounts[0];
        sidebar.selectSite(site.id, defaultAccount.id);
      }
      return;
    }

    // Ctrl+Tab / Ctrl+Shift+Tab: Next/previous site
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
      const sites = await window.api.getSites();
      const currentIndex = sites.findIndex(s => s.id === sidebar.activeSiteId);
      const nextIndex = e.shiftKey
        ? (currentIndex - 1 + sites.length) % sites.length
        : (currentIndex + 1) % sites.length;
      const nextSite = sites[nextIndex];
      const defaultAccount = nextSite.accounts.find(a => a.isDefault) || nextSite.accounts[0];
      sidebar.selectSite(nextSite.id, defaultAccount.id);
      return;
    }

    // Ctrl+L: Focus URL bar (select text for copying)
    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      const urlText = document.getElementById('url-text');
      if (urlText) {
        const range = document.createRange();
        range.selectNodeContents(urlText);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
      return;
    }

    // Ctrl++ / Ctrl+=: Zoom in
    if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      toolbar.zoom(10);
      return;
    }

    // Ctrl+-: Zoom out
    if (e.ctrlKey && e.key === '-') {
      e.preventDefault();
      toolbar.zoom(-10);
      return;
    }

    // Ctrl+0: Reset zoom
    if (e.ctrlKey && e.key === '0') {
      e.preventDefault();
      toolbar.setZoom(100);
      return;
    }

    // F5 / Ctrl+R: Refresh
    if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
      e.preventDefault();
      window.api.refresh?.();
      return;
    }

    // Ctrl+Shift+R: Force refresh
    if (e.ctrlKey && e.shiftKey && e.key === 'R') {
      e.preventDefault();
      window.api.forceRefresh?.();
      return;
    }

    // Alt+Left: Go back
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      window.api.goBack?.();
      return;
    }

    // Alt+Right: Go forward
    if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      window.api.goForward?.();
      return;
    }

    // Ctrl+W: Hibernate current site
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      if (sidebar.activeSiteId) {
        window.api.hibernateSite(sidebar.activeSiteId);
      }
      return;
    }

    // Ctrl+N: Add new site
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      siteManager.showAddSite();
      return;
    }

    // Escape: Close panels
    if (e.key === 'Escape') {
      if (settingsPanel.isOpen) settingsPanel.close();
      if (siteManager.isOpen) siteManager.close();
    }

    // Ctrl+Q: Force quit
    if (e.ctrlKey && e.key === 'q') {
      e.preventDefault();
      window.api.forceQuit();
    }
  });
});
