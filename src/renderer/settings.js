class SettingsPanel {
  constructor() {
    this.isOpen = false;
    this.settings = {};
    this.init();
  }

  async init() {
    this.settings = await window.api.getSettings();
    this.createOverlay();
    document.getElementById('btn-settings').addEventListener('click', () => this.toggle());
  }

  createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'settings-overlay';
    overlay.className = 'settings-overlay hidden';
    overlay.innerHTML = `
      <div class="settings-panel">
        <div class="settings-header">
          <h2>设置</h2>
          <button id="settings-close" class="settings-close-btn">✕</button>
        </div>
        <div class="settings-content">
          <section class="settings-section">
            <h3>网络</h3>
            <div class="setting-row">
              <label>默认代理模式</label>
              <select id="setting-proxy-mode">
                <option value="direct">直连</option>
                <option value="system">系统代理</option>
                <option value="custom">自定义代理</option>
              </select>
            </div>
            <div class="setting-row" id="proxy-custom-row" style="display:none">
              <label>代理地址</label>
              <input type="text" id="setting-proxy-address" placeholder="http://127.0.0.1:7890">
            </div>
          </section>

          <section class="settings-section">
            <h3>性能</h3>
            <div class="setting-row">
              <label>最大同时活跃页面</label>
              <select id="setting-max-active">
                <option value="2">2 个</option>
                <option value="3">3 个</option>
                <option value="5">5 个</option>
                <option value="10">10 个</option>
              </select>
            </div>
            <div class="setting-row">
              <label>空闲超时（秒）</label>
              <input type="number" id="setting-idle-timeout" min="10" max="300" value="30">
            </div>
            <div class="setting-row">
              <label>休眠确认延迟（秒）</label>
              <input type="number" id="setting-hibernate-delay" min="5" max="60" value="10">
            </div>
          </section>

          <section class="settings-section">
            <h3>外观</h3>
            <div class="setting-row">
              <label>开机自启</label>
              <input type="checkbox" id="setting-auto-launch">
            </div>
            <div class="setting-row">
              <label>关闭时最小化到托盘</label>
              <input type="checkbox" id="setting-minimize-tray" checked>
            </div>
            <div class="setting-row">
              <label>全局快捷键呼出</label>
              <input type="text" id="setting-hotkey" value="Ctrl+Shift+Space" readonly>
            </div>
            <div class="setting-row">
              <label>通知角标</label>
              <input type="checkbox" id="setting-badges" checked>
            </div>
          </section>

          <section class="settings-section">
            <h3>数据</h3>
            <div class="setting-actions">
              <button id="btn-export" class="settings-action-btn" aria-label="导出配置到文件">导出配置</button>
              <button id="btn-import" class="settings-action-btn" aria-label="从文件导入配置">导入配置</button>
              <button id="btn-clear-data" class="settings-action-btn danger" aria-label="清除全部站点数据">清除全部站点数据</button>
            </div>
          </section>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('settings-close').addEventListener('click', () => this.close());

    document.getElementById('settings-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });

    document.getElementById('setting-proxy-mode').addEventListener('change', (e) => {
      document.getElementById('proxy-custom-row').style.display =
        e.target.value === 'custom' ? 'flex' : 'none';
    });

    document.getElementById('btn-export').addEventListener('click', async () => {
      const config = await window.api.exportConfig();
      const parsed = JSON.parse(config);
      const siteCount = parsed.sites?.length || 0;

      const now = new Date();
      const dateStr = now.toISOString().slice(0,10);
      const timeStr = now.toTimeString().slice(0,5).replace(':', '');
      const filename = `ai-workspace-config-${dateStr}-${timeStr}.json`;

      const blob = new Blob([config], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      this.showToast(`已导出 ${siteCount} 个站点配置（不含账号登录信息）`);
    });

    document.getElementById('btn-import').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        try {
          const data = JSON.parse(text);
          const siteCount = data.sites?.length || 0;
          await window.api.importConfig(text);
          this.settings = await window.api.getSettings();
          this.loadSettings();
          this.showToast(`已导入 ${siteCount} 个站点配置，请重新打开站点管理查看`);
        } catch (err) {
          alert('导入失败: ' + err.message);
        }
      };
      input.click();
    });

    document.getElementById('btn-clear-data').addEventListener('click', async () => {
      if (!confirm('确定要清除全部站点数据吗？此操作不可撤销。')) return;
      try {
        await window.api.clearAllSiteData();
        alert('站点数据已清除，重启应用后生效');
      } catch (err) {
        alert('清除失败: ' + err.message);
      }
    });

    const inputs = document.querySelectorAll('.settings-content input, .settings-content select');
    inputs.forEach(input => {
      input.addEventListener('change', () => this.saveSettings());
    });
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.isOpen = true;
    document.getElementById('settings-overlay').classList.remove('hidden');
    this.loadSettings();
    // Hide the webview so overlay is visible
    window.api.hideView?.();
  }

  close() {
    this.isOpen = false;
    document.getElementById('settings-overlay').classList.add('hidden');
    // Show the webview again
    window.api.showView?.();
  }

  loadSettings() {
    const s = this.settings;
    document.getElementById('setting-proxy-mode').value = s.defaultProxyMode || 'system';
    document.getElementById('setting-max-active').value = s.maxActiveTabs || 3;
    document.getElementById('setting-idle-timeout').value = (s.idleTimeout || 30000) / 1000;
    document.getElementById('setting-hibernate-delay').value = (s.hibernateDelay || 10000) / 1000;
    document.getElementById('setting-auto-launch').checked = s.autoLaunch || false;
    document.getElementById('setting-minimize-tray').checked = s.minimizeToTray !== false;
    document.getElementById('setting-badges').checked = s.showBadges !== false;

    document.getElementById('proxy-custom-row').style.display =
      s.defaultProxyMode === 'custom' ? 'flex' : 'none';
  }

  async saveSettings() {
    const settings = {
      defaultProxyMode: document.getElementById('setting-proxy-mode').value,
      maxActiveTabs: parseInt(document.getElementById('setting-max-active').value),
      idleTimeout: parseInt(document.getElementById('setting-idle-timeout').value) * 1000,
      hibernateDelay: parseInt(document.getElementById('setting-hibernate-delay').value) * 1000,
      autoLaunch: document.getElementById('setting-auto-launch').checked,
      minimizeToTray: document.getElementById('setting-minimize-tray').checked,
      showBadges: document.getElementById('setting-badges').checked
    };

    await window.api.updateSettings(settings);
    this.settings = { ...this.settings, ...settings };
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
      toast.classList.add('toast-fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}
