const { BrowserWindow } = require('electron');
const { selectHibernateCandidates } = require('./hibernation-policy');

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
    this.cancelAllCountdowns();
  }

  cancelAllCountdowns() {
    for (const [, timers] of this.timers) clearTimeout(timers.hibernateTimer);
    this.timers.clear();
  }

  checkAll() {
    const settings = this.configStore.getSettings();
    const candidates = new Set(selectHibernateCandidates(this.viewManager.getAllViews(), {
      activeKey: this.viewManager.activeKey,
      maxActiveTabs: settings.maxActiveTabs,
      idleTimeout: settings.idleTimeout,
      now: Date.now()
    }));

    for (const key of this.timers.keys()) {
      if (!candidates.has(key)) this.cancelHibernate(key);
    }

    for (const key of candidates) {
      if (!this.timers.has(key)) {
        this.startHibernateCountdown(key, settings.hibernateDelay);
      }
    }
  }

  startHibernateCountdown(key, delay) {
    const timer = setTimeout(() => {
      const viewData = this.viewManager.getAllViews().find(view => view.key === key);
      const settings = this.configStore.getSettings();
      const stillEligible = selectHibernateCandidates(this.viewManager.getAllViews(), {
        activeKey: this.viewManager.activeKey,
        maxActiveTabs: settings.maxActiveTabs,
        idleTimeout: settings.idleTimeout,
        now: Date.now()
      }).includes(key);
      if (viewData && stillEligible) {
        const hibernated = this.viewManager.hibernate(viewData.siteId, viewData.accountId);
        if (hibernated) this.notifyStatusChange(viewData.siteId, viewData.accountId, 'hibernated');
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
  }

  async forceHibernate(siteId, accountId) {
    const key = this.viewManager.getKey(siteId, accountId);
    this.cancelHibernate(key);
    const hibernated = this.viewManager.hibernate(siteId, accountId);
    if (hibernated) this.notifyStatusChange(siteId, accountId, 'hibernated');
    return hibernated;
  }

  async forceWake(siteId, accountId, site, account, proxyConfig) {
    const viewData = await this.viewManager.wake(siteId, accountId, site, account, proxyConfig);
    if (viewData) this.notifyStatusChange(siteId, accountId, 'idle');
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
