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
        <button id="btn-back" class="toolbar-btn" title="后退 (Alt+←)" aria-label="后退">←</button>
        <button id="btn-forward" class="toolbar-btn" title="前进 (Alt+→)" aria-label="前进">→</button>
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

    document.getElementById('toolbar-url').addEventListener('click', () => {
      const url = document.getElementById('url-text').textContent;
      if (url && url !== 'AI Workspace') {
        navigator.clipboard.writeText(url);
        this.showTooltip('已复制');
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
