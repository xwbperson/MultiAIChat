const { BrowserWindow } = require('electron');

class HibernationManager {
  constructor(viewManager, configStore) {
    this.viewManager = viewManager;
    this.configStore = configStore;
    this.timers = new Map();
    this.checkInterval = null;

    this.startScheduler();
  }

  startScheduler() {
    this.checkInterval = setInterval(() => this.checkAll(), 5000);
  }

  stopScheduler() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    for (const [, timers] of this.timers) {
      clearTimeout(timers.hibernateTimer);
    }
    this.timers.clear();
  }

  checkAll() {
    const settings = this.configStore.getSettings();
    const maxActive = settings.maxActiveTabs || 3;
    const idleTimeout = settings.idleTimeout || 30000;
    const hibernateDelay = settings.hibernateDelay || 10000;

    const views = this.viewManager.getAllViews();
    const now = Date.now();

    // Demote excess active views to idle (keep current active + most recent)
    const activeViews = views.filter(v => v.state === 'active');
    if (activeViews.length > maxActive) {
      const excess = activeViews
        .filter(v => v.key !== this.viewManager.activeKey)
        .sort((a, b) => a.lastActive - b.lastActive);

      for (let i = 0; i < excess.length && activeViews.length - i > maxActive; i++) {
        const viewData = this.viewManager.views.get(excess[i].key);
        if (viewData) {
          viewData.state = 'idle';
          viewData.lastActive = now;
        }
      }
    }

    // Start hibernate countdown for idle views past timeout
    const idleViews = views.filter(v => v.state === 'idle');
    for (const view of idleViews) {
      const timeSinceActive = now - view.lastActive;
      if (timeSinceActive >= idleTimeout && !this.timers.has(view.key)) {
        this.startHibernateCountdown(view.key, hibernateDelay);
      }
    }
  }

  startHibernateCountdown(key, delay) {
    const timer = setTimeout(() => {
      const viewData = this.viewManager.views.get(key);
      if (viewData && viewData.state === 'idle') {
        this.viewManager.hibernate(viewData.siteId, viewData.accountId);
        this.notifyStatusChange(viewData.siteId, viewData.accountId, 'hibernated');
      }
      this.timers.delete(key);
    }, delay);

    this.timers.set(key, { hibernateTimer: timer });
  }

  cancelHibernate(key) {
    const timers = this.timers.get(key);
    if (timers) {
      clearTimeout(timers.hibernateTimer);
      this.timers.delete(key);
    }
  }

  onSiteActivated(siteId, accountId) {
    const key = this.viewManager.getKey(siteId, accountId);
    this.cancelHibernate(key);

    const viewData = this.viewManager.views.get(key);
    if (viewData) {
      viewData.state = 'active';
      viewData.lastActive = Date.now();
    }
  }

  onSiteDeactivated(siteId, accountId) {
    const key = this.viewManager.getKey(siteId, accountId);
    const viewData = this.viewManager.views.get(key);
    if (viewData) {
      viewData.state = 'idle';
      viewData.lastActive = Date.now();
    }
  }

  async forceHibernate(siteId, accountId) {
    const key = this.viewManager.getKey(siteId, accountId);
    this.cancelHibernate(key);
    this.viewManager.hibernate(siteId, accountId);
    this.notifyStatusChange(siteId, accountId, 'hibernated');
  }

  async forceWake(siteId, accountId, site) {
    await this.viewManager.wake(siteId, accountId, site);
    this.notifyStatusChange(siteId, accountId, 'active');
  }

  notifyStatusChange(siteId, accountId, state) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(w => {
      w.webContents.send('hibernate:statusChanged', { siteId, accountId, state });
    });
  }

  getStatus() {
    const views = this.viewManager.getAllViews();
    return {
      total: views.length,
      active: views.filter(v => v.state === 'active').length,
      idle: views.filter(v => v.state === 'idle').length,
      hibernated: views.filter(v => v.state === 'hibernated').length,
      views: views.map(v => ({
        siteId: v.siteId,
        accountId: v.accountId,
        state: v.state,
        lastActive: v.lastActive
      }))
    };
  }
}

module.exports = HibernationManager;
