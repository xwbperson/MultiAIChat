class Sidebar {
  constructor() {
    this.container = document.getElementById('site-list');
    this.sites = [];
    this.activeSiteId = null;
    this.activeAccountId = null;
    this.expandedSites = new Set();
    this.badges = new Map();
    this.hibernatedKeys = new Set();

    this.init();
  }

  async init() {
    await this.loadSites();
    this.render();

    window.api.onBadgeUpdate(({ siteId, count }) => {
      this.badges.set(siteId, count);
      this.updateBadge(siteId);
    });

    window.api.onHibernateStatus(({ siteId, accountId, state }) => {
      const key = `${siteId}:${accountId}`;
      if (state === 'hibernated') {
        this.hibernatedKeys.add(key);
      } else {
        this.hibernatedKeys.delete(key);
      }
      this.updateHibernateIndicator(siteId, accountId);
    });
  }

  async loadSites() {
    this.sites = await window.api.getSites();
  }

  render() {
    this.container.innerHTML = '';

    this.sites.forEach(site => {
      const siteEl = this.createSiteElement(site);
      this.container.appendChild(siteEl);
    });
  }

  createSiteElement(site) {
    const wrapper = document.createElement('div');
    wrapper.className = 'site-item';
    wrapper.dataset.siteId = site.id;

    const isActive = site.id === this.activeSiteId;
    const isExpanded = this.expandedSites.has(site.id);
    const hasMultipleAccounts = site.accounts.length > 1;

    const btn = document.createElement('button');
    btn.className = `site-btn ${isActive ? 'active' : ''}`;
    btn.title = site.name;

    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'site-icon-wrapper';
    if (site.color) {
      iconWrapper.style.borderColor = site.color;
    }
    if (isActive) {
      iconWrapper.style.borderColor = 'var(--accent)';
    }

    const icon = document.createElement('span');
    icon.className = 'site-icon';
    icon.textContent = site.icon;

    const statusDot = document.createElement('span');
    statusDot.className = 'status-dot';
    statusDot.dataset.siteId = site.id;

    iconWrapper.appendChild(icon);
    iconWrapper.appendChild(statusDot);

    const name = document.createElement('span');
    name.className = 'site-name';
    name.textContent = site.name.length > 6 ? site.name.slice(0, 6) : site.name;

    const badge = document.createElement('span');
    badge.className = 'site-badge';
    badge.dataset.siteId = site.id;
    badge.style.display = 'none';

    btn.appendChild(iconWrapper);
    btn.appendChild(name);
    if (hasMultipleAccounts) {
      const expandIcon = document.createElement('span');
      expandIcon.className = 'expand-icon';
      expandIcon.textContent = isExpanded ? '▾' : '▸';
      btn.appendChild(expandIcon);
    }
    btn.appendChild(badge);

    btn.addEventListener('click', () => {
      if (hasMultipleAccounts) {
        this.toggleExpand(site.id);
      } else {
        this.selectSite(site.id, site.accounts[0].id);
      }
    });

    wrapper.appendChild(btn);

    if (isExpanded && hasMultipleAccounts) {
      const accountList = document.createElement('div');
      accountList.className = 'account-list';

      site.accounts.forEach(account => {
        const accountBtn = document.createElement('button');
        accountBtn.className = `account-btn ${account.id === this.activeAccountId ? 'active' : ''}`;

        const dot = document.createElement('span');
        dot.className = `account-dot ${this.isHibernated(site.id, account.id) ? 'hibernated' : ''}`;

        const label = document.createElement('span');
        label.className = 'account-label';
        label.textContent = account.label;

        accountBtn.appendChild(dot);
        accountBtn.appendChild(label);

        accountBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectSite(site.id, account.id);
        });

        accountList.appendChild(accountBtn);
      });

      const addBtn = document.createElement('button');
      addBtn.className = 'account-btn add-account';
      addBtn.innerHTML = '<span class="account-dot"></span><span class="account-label">+ 添加</span>';
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.addAccount(site.id);
      });
      accountList.appendChild(addBtn);

      wrapper.appendChild(accountList);
    }

    return wrapper;
  }

  toggleExpand(siteId) {
    if (this.expandedSites.has(siteId)) {
      this.expandedSites.delete(siteId);
    } else {
      this.expandedSites.add(siteId);
    }
    this.render();
  }

  async selectSite(siteId, accountId) {
    this.activeSiteId = siteId;
    this.activeAccountId = accountId;
    this.render();
    await window.api.switchSite(siteId, accountId);
  }

  async addAccount(siteId) {
    const label = prompt('请输入账号名称:');
    if (!label) return;

    const accountId = `${siteId}-${Date.now()}`;

    await window.api.addAccount(siteId, { id: accountId, label });
    await this.loadSites();
    this.render();
  }

  isHibernated(siteId, accountId) {
    return this.hibernatedKeys.has(`${siteId}:${accountId}`);
  }

  updateBadge(siteId) {
    const badge = this.container.querySelector(`.site-badge[data-site-id="${siteId}"]`);
    if (badge) {
      const count = this.badges.get(siteId) || 0;
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  updateHibernateIndicator(siteId, accountId) {
    this.render();
  }
}

window.Sidebar = Sidebar;
