class Toolbar {
  constructor() {
    this.container = document.getElementById('toolbar');
    this.currentZoom = 100;
    this.init();
  }

  init() {
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="toolbar-nav">
        <button id="btn-back" class="toolbar-btn" title="后退 (Alt+←)" aria-label="后退" disabled>←</button>
        <button id="btn-forward" class="toolbar-btn" title="前进 (Alt+→)" aria-label="前进" disabled>→</button>
        <button id="btn-refresh" class="toolbar-btn" title="刷新 (F5)" aria-label="刷新">↻</button>
      </div>
      <div class="toolbar-separator"></div>
      <div class="toolbar-url" id="toolbar-url" title="点击复制" role="button" tabindex="0">
        <span id="url-text">AI Workspace</span>
      </div>
      <div class="toolbar-separator"></div>
      <div class="toolbar-zoom">
        <button id="btn-zoom-out" class="toolbar-btn" title="缩小 (Ctrl+-)" aria-label="缩小">−</button>
        <span id="zoom-level" class="zoom-level" role="status">100%</span>
        <button id="btn-zoom-in" class="toolbar-btn" title="放大 (Ctrl++)" aria-label="放大">+</button>
        <button id="btn-zoom-reset" class="toolbar-btn" title="重置 (Ctrl+0)" aria-label="重置缩放">⟲</button>
      </div>
    `;
  }

  bindEvents() {
    document.getElementById('btn-back').addEventListener('click', () => {
      window.api.goBack?.();
    });

    document.getElementById('btn-forward').addEventListener('click', () => {
      window.api.goForward?.();
    });

    document.getElementById('btn-refresh').addEventListener('click', () => {
      window.api.refresh?.();
    });

    const copyCurrentUrl = () => {
      const url = document.getElementById('url-text').textContent;
      if (url && url !== 'AI Workspace') {
        navigator.clipboard.writeText(url)
          .then(() => this.showTooltip('已复制'))
          .catch(() => this.showTooltip('复制失败'));
      }
    };
    document.getElementById('toolbar-url').addEventListener('click', copyCurrentUrl);
    document.getElementById('toolbar-url').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        copyCurrentUrl();
      }
    });

    document.getElementById('btn-zoom-in').addEventListener('click', () => this.zoom(10));
    document.getElementById('btn-zoom-out').addEventListener('click', () => this.zoom(-10));
    document.getElementById('btn-zoom-reset').addEventListener('click', () => this.setZoom(100));
  }

  setUrl(url) {
    const urlText = document.getElementById('url-text');
    if (urlText) {
      urlText.textContent = url || 'AI Workspace';
    }
  }

  setNavigationState(state = {}) {
    this.setUrl(state.url);
    document.getElementById('btn-back').disabled = !state.canGoBack;
    document.getElementById('btn-forward').disabled = !state.canGoForward;
    if (Number.isFinite(state.zoomLevel)) {
      this.currentZoom = Math.round(100 * Math.pow(1.2, state.zoomLevel));
      document.getElementById('zoom-level').textContent = `${this.currentZoom}%`;
    }
  }

  focusUrl() {
    const urlText = document.getElementById('url-text');
    const urlContainer = document.getElementById('toolbar-url');
    if (!urlText || !urlContainer) return;
    urlContainer.focus();
    const range = document.createRange();
    range.selectNodeContents(urlText);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  zoom(delta) {
    this.currentZoom = Math.max(25, Math.min(500, this.currentZoom + delta));
    this.setZoom(this.currentZoom);
  }

  setZoom(level) {
    this.currentZoom = level;
    const zoomEl = document.getElementById('zoom-level');
    if (zoomEl) {
      zoomEl.textContent = `${level}%`;
    }
    // Electron zoom level: 0 = 100%, positive = zoom in, negative = zoom out
    // Convert percentage to zoom level: level 0 = 100%, each step ~20%
    const zoomLevel = Math.log(level / 100) / Math.log(1.2);
    window.api.setZoom?.(zoomLevel);
  }

  showTooltip(text) {
    const urlEl = document.getElementById('toolbar-url');
    if (!urlEl) return;

    const tooltip = document.createElement('span');
    tooltip.className = 'toolbar-tooltip';
    tooltip.textContent = text;
    urlEl.appendChild(tooltip);

    setTimeout(() => tooltip.remove(), 1500);
  }
}

window.Toolbar = Toolbar;
