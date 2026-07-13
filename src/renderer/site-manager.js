class SiteManager {
  constructor(sidebar) {
    this.sidebar = sidebar;
    this.isOpen = false;
    this.init();
  }

  init() {
    this.createOverlay();
  }

  createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'site-manager-overlay';
    overlay.className = 'settings-overlay hidden';
    overlay.innerHTML = `
      <div class="settings-panel" style="width: 600px">
        <div class="settings-header">
          <h2>站点管理</h2>
          <div class="site-manager-actions">
            <button id="btn-add-site" class="settings-action-btn">+ 添加站点</button>
            <button id="site-manager-close" class="settings-close-btn">✕</button>
          </div>
        </div>
        <div class="settings-content" id="site-list-container">
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('site-manager-close').addEventListener('click', () => this.close());
    document.getElementById('btn-add-site').addEventListener('click', () => this.showAddSite());
    document.getElementById('site-manager-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });
  }

  async open() {
    this.isOpen = true;
    document.getElementById('site-manager-overlay').classList.remove('hidden');
    await this.renderSiteList();
  }

  close() {
    this.isOpen = false;
    document.getElementById('site-manager-overlay').classList.add('hidden');
  }

  async renderSiteList() {
    const sites = await window.api.getSites();
    const container = document.getElementById('site-list-container');

    container.innerHTML = sites.map(site => `
      <div class="site-card" data-site-id="${site.id}">
        <div class="site-card-header">
          <span class="site-card-icon">${site.icon}</span>
          <span class="site-card-name">${site.name}</span>
          <div class="site-card-actions">
            <button class="site-edit-btn" data-site-id="${site.id}">✎</button>
            <button class="site-delete-btn" data-site-id="${site.id}">🗑</button>
          </div>
        </div>
        <div class="site-card-details">
          <div class="site-detail">
            <span class="detail-label">URL:</span>
            <span class="detail-value">${site.url}</span>
          </div>
          <div class="site-detail">
            <span class="detail-label">代理:</span>
            <span class="detail-value">${site.proxy || '默认'}</span>
          </div>
          <div class="site-detail">
            <span class="detail-label">账号:</span>
            <div class="account-list-inline">
              ${site.accounts.map(acc => `
                <span class="account-tag ${acc.isDefault ? 'default' : ''}">${acc.label}</span>
              `).join('')}
              <button class="add-account-btn" data-site-id="${site.id}">+ 添加</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.site-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => this.showEditSite(btn.dataset.siteId));
    });

    container.querySelectorAll('.site-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteSite(btn.dataset.siteId));
    });

    container.querySelectorAll('.add-account-btn').forEach(btn => {
      btn.addEventListener('click', () => this.addAccount(btn.dataset.siteId));
    });
  }

  showAddSite() {
    const name = prompt('站点名称:');
    if (!name) return;
    const url = prompt('站点 URL:', 'https://');
    if (!url) return;
    const icon = prompt('图标 (emoji):', '🌐') || '🌐';
    const color = prompt('颜色 (hex):', '#89b4fa') || '#89b4fa';

    window.api.addSite({ name, url, icon, color });
    this.renderSiteList();
    this.sidebar.loadSites().then(() => this.sidebar.render());
  }

  async showEditSite(siteId) {
    const sites = await window.api.getSites();
    const site = sites.find(s => s.id === siteId);
    if (!site) return;

    const name = prompt('站点名称:', site.name);
    if (!name) return;
    const url = prompt('站点 URL:', site.url);
    if (!url) return;
    const proxy = prompt('代理地址 (留空使用默认):', site.proxy || '');

    await window.api.updateSite(siteId, { name, url, proxy });
    await this.renderSiteList();
    await this.sidebar.loadSites();
    this.sidebar.render();
  }

  async deleteSite(siteId) {
    if (!confirm('确定要删除此站点吗？所有账号数据将被清除。')) return;
    await window.api.deleteSite(siteId);
    await this.renderSiteList();
    await this.sidebar.loadSites();
    this.sidebar.render();
  }

  async addAccount(siteId) {
    const label = prompt('账号名称:');
    if (!label) return;

    const accountId = `${siteId}-${Date.now()}`;
    await window.api.addAccount(siteId, { id: accountId, label });
    await this.renderSiteList();
    await this.sidebar.loadSites();
    this.sidebar.render();
  }
}

window.SiteManager = SiteManager;
