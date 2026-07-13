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
    // Hide the webview so overlay is visible
    window.api.hideView?.();
  }

  close() {
    this.isOpen = false;
    document.getElementById('site-manager-overlay').classList.add('hidden');
    // Show the webview again
    window.api.showView?.();
  }

  async renderSiteList() {
    const sites = await window.api.getSites();
    const container = document.getElementById('site-list-container');

    container.innerHTML = sites.map((site, index) => `
      <div class="site-card" data-site-id="${site.id}" data-index="${index}" draggable="true">
        <div class="site-card-header">
          <span class="site-card-drag-handle" title="拖拽排序" role="button" tabindex="0" aria-label="拖拽排序 ${site.name}">⠿</span>
          <span class="site-card-icon" aria-hidden="true">${site.icon}</span>
          <span class="site-card-name">${site.name}</span>
          <div class="site-card-actions">
            <button class="site-edit-btn" data-site-id="${site.id}" aria-label="编辑 ${site.name}">✎</button>
            <button class="site-delete-btn" data-site-id="${site.id}" aria-label="删除 ${site.name}">🗑</button>
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
            <span class="detail-label">快捷键:</span>
            <div class="shortcut-controls">
              <span class="shortcut-display ${site.shortcut ? 'has-shortcut' : 'no-shortcut'}">${site.shortcut || '未设置'}</span>
              <button class="shortcut-edit-btn" data-site-id="${site.id}" data-shortcut="${site.shortcut || ''}" title="修改快捷键">✎</button>
              ${site.shortcut ? `<button class="shortcut-remove-btn" data-site-id="${site.id}" title="删除快捷键">×</button>` : ''}
            </div>
          </div>
          <div class="site-detail">
            <span class="detail-label">账号:</span>
            <div class="account-list-inline">
              ${site.accounts.map(acc => `
                <span class="account-tag ${acc.isDefault ? 'default' : ''}">
                  <span class="account-label-text">${acc.label}</span>
                  <button class="rename-account-btn" data-site-id="${site.id}" data-account-id="${acc.id}" data-label="${acc.label}" title="重命名" aria-label="重命名 ${acc.label}">✎</button>
                  ${!acc.isDefault ? `<button class="remove-account-btn" data-site-id="${site.id}" data-account-id="${acc.id}" title="删除账号" aria-label="删除 ${acc.label}">×</button>` : ''}
                </span>
              `).join('')}
              <button class="add-account-btn" data-site-id="${site.id}">+ 添加</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    // Add drag and drop event listeners
    this.setupDragAndDrop(container);

    container.querySelectorAll('.site-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => this.showEditSite(btn.dataset.siteId));
    });

    container.querySelectorAll('.site-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteSite(btn.dataset.siteId));
    });

    container.querySelectorAll('.add-account-btn').forEach(btn => {
      btn.addEventListener('click', () => this.addAccount(btn.dataset.siteId));
    });

    container.querySelectorAll('.remove-account-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeAccount(btn.dataset.siteId, btn.dataset.accountId);
      });
    });

    container.querySelectorAll('.rename-account-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.renameAccount(btn.dataset.siteId, btn.dataset.accountId, btn.dataset.label);
      });
    });

    container.querySelectorAll('.shortcut-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editShortcut(btn.dataset.siteId, btn.dataset.shortcut);
      });
    });

    container.querySelectorAll('.shortcut-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeShortcut(btn.dataset.siteId);
      });
    });
  }

  setupDragAndDrop(container) {
    let draggedCard = null;
    let draggedSiteId = null;

    container.querySelectorAll('.site-card').forEach(card => {
      // Mouse drag support
      card.addEventListener('dragstart', (e) => {
        draggedCard = card;
        draggedSiteId = card.dataset.siteId;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.siteId);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        draggedCard = null;
        draggedSiteId = null;
        container.querySelectorAll('.site-card').forEach(c => c.classList.remove('drag-over'));
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (card !== draggedCard) {
          card.classList.add('drag-over');
        }
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });

      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');

        if (!draggedSiteId || card.dataset.siteId === draggedSiteId) return;

        const sites = await window.api.getSites();
        const draggedIndex = sites.findIndex(s => s.id === draggedSiteId);
        const targetIndex = parseInt(card.dataset.index);

        if (draggedIndex === -1 || targetIndex === -1) return;

        const [dragged] = sites.splice(draggedIndex, 1);
        sites.splice(targetIndex, 0, dragged);

        for (let i = 0; i < sites.length; i++) {
          await window.api.updateSite(sites[i].id, { order: i });
        }

        await this.renderSiteList();
        if (this.sidebar) {
          await this.sidebar.loadSites();
          this.sidebar.render();
        }
      });

      // Keyboard support for drag handle
      const dragHandle = card.querySelector('.site-card-drag-handle');
      if (dragHandle) {
        dragHandle.addEventListener('keydown', async (e) => {
          const siteId = card.dataset.siteId;
          const sites = await window.api.getSites();
          const currentIndex = sites.findIndex(s => s.id === siteId);

          if (e.key === 'ArrowUp' && currentIndex > 0) {
            e.preventDefault();
            // Swap with previous
            [sites[currentIndex - 1], sites[currentIndex]] = [sites[currentIndex], sites[currentIndex - 1]];
            await this.updateSiteOrder(sites);
            // Focus the moved item
            setTimeout(() => {
              const handles = container.querySelectorAll('.site-card-drag-handle');
              if (handles[currentIndex - 1]) handles[currentIndex - 1].focus();
            }, 50);
          } else if (e.key === 'ArrowDown' && currentIndex < sites.length - 1) {
            e.preventDefault();
            // Swap with next
            [sites[currentIndex], sites[currentIndex + 1]] = [sites[currentIndex + 1], sites[currentIndex]];
            await this.updateSiteOrder(sites);
            // Focus the moved item
            setTimeout(() => {
              const handles = container.querySelectorAll('.site-card-drag-handle');
              if (handles[currentIndex + 1]) handles[currentIndex + 1].focus();
            }, 50);
          }
        });
      }
    });
  }

  async updateSiteOrder(sites) {
    for (let i = 0; i < sites.length; i++) {
      await window.api.updateSite(sites[i].id, { order: i });
    }
    await this.renderSiteList();
    if (this.sidebar) {
      await this.sidebar.loadSites();
      this.sidebar.render();
    }
  }

  showAddSite() {
    const dialog = document.createElement('div');
    dialog.className = 'edit-dialog-overlay';
    dialog.innerHTML = `
      <div class="edit-dialog">
        <h3>添加新站点</h3>
        <div class="edit-field">
          <label>站点名称 *</label>
          <input type="text" id="add-name" placeholder="例如: ChatGPT" autofocus>
        </div>
        <div class="edit-field">
          <label>站点 URL *</label>
          <input type="text" id="add-url" placeholder="https://chat.openai.com" value="https://">
        </div>
        <div class="edit-field">
          <label>图标 (emoji)</label>
          <input type="text" id="add-icon" placeholder="🌐" value="🌐">
        </div>
        <div class="edit-field">
          <label>颜色</label>
          <div class="color-picker-row">
            <input type="color" id="add-color" value="#89b4fa">
            <span class="color-preview">#89b4fa</span>
          </div>
        </div>
        <div class="edit-field">
          <label>代理设置</label>
          <select id="add-proxy-mode">
            <option value="">使用默认</option>
            <option value="direct">直连</option>
            <option value="system">系统代理</option>
            <option value="custom">自定义代理</option>
          </select>
          <input type="text" id="add-proxy" placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080" style="display:none; margin-top: 8px;">
        </div>
        <div class="edit-actions">
          <button id="add-cancel" class="settings-action-btn">取消</button>
          <button id="add-save" class="settings-action-btn primary">添加</button>
        </div>
        <div class="quick-add-section">
          <h4>快速添加常用站点</h4>
          <div class="quick-add-grid">
            <button class="quick-add-btn" data-name="ChatGPT" data-url="https://chatgpt.com" data-icon="🤖" data-color="#10a37f">
              <span class="quick-icon">🤖</span>
              <span class="quick-name">ChatGPT</span>
            </button>
            <button class="quick-add-btn" data-name="Claude" data-url="https://claude.ai" data-icon="🧠" data-color="#d4a574">
              <span class="quick-icon">🧠</span>
              <span class="quick-name">Claude</span>
            </button>
            <button class="quick-add-btn" data-name="DeepSeek" data-url="https://chat.deepseek.com" data-icon="🔷" data-color="#4d6bfe">
              <span class="quick-icon">🔷</span>
              <span class="quick-name">DeepSeek</span>
            </button>
            <button class="quick-add-btn" data-name="Kimi" data-url="https://kimi.moonshot.cn" data-icon="🌙" data-color="#6236d9">
              <span class="quick-icon">🌙</span>
              <span class="quick-name">Kimi</span>
            </button>
            <button class="quick-add-btn" data-name="豆包" data-url="https://www.doubao.com" data-icon="🤖" data-color="#fe694a">
              <span class="quick-icon">🤖</span>
              <span class="quick-name">豆包</span>
            </button>
            <button class="quick-add-btn" data-name="Copilot" data-url="https://copilot.microsoft.com" data-icon="🪟" data-color="#7c3aed">
              <span class="quick-icon">🪟</span>
              <span class="quick-name">Copilot</span>
            </button>
            <button class="quick-add-btn" data-name="Gemini" data-url="https://gemini.google.com" data-icon="💎" data-color="#4285f4">
              <span class="quick-icon">💎</span>
              <span class="quick-name">Gemini</span>
            </button>
            <button class="quick-add-btn" data-name="Perplexity" data-url="https://www.perplexity.ai" data-icon="🔍" data-color="#20b2aa">
              <span class="quick-icon">🔍</span>
              <span class="quick-name">Perplexity</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Focus on name input
    setTimeout(() => dialog.querySelector('#add-name').focus(), 100);

    // Color picker update
    const colorInput = dialog.querySelector('#add-color');
    const colorPreview = dialog.querySelector('.color-preview');
    colorInput.addEventListener('input', () => {
      colorPreview.textContent = colorInput.value;
    });

    // Proxy mode change
    dialog.querySelector('#add-proxy-mode').addEventListener('change', (e) => {
      dialog.querySelector('#add-proxy').style.display =
        e.target.value === 'custom' ? 'block' : 'none';
    });

    // Quick add buttons
    dialog.querySelectorAll('.quick-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        dialog.querySelector('#add-name').value = btn.dataset.name;
        dialog.querySelector('#add-url').value = btn.dataset.url;
        dialog.querySelector('#add-icon').value = btn.dataset.icon;
        dialog.querySelector('#add-color').value = btn.dataset.color;
        colorPreview.textContent = btn.dataset.color;
      });
    });

    // Cancel
    dialog.querySelector('#add-cancel').addEventListener('click', () => dialog.remove());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.remove();
    });

    // Save
    dialog.querySelector('#add-save').addEventListener('click', async () => {
      const name = dialog.querySelector('#add-name').value.trim();
      const url = dialog.querySelector('#add-url').value.trim();
      const icon = dialog.querySelector('#add-icon').value.trim() || '🌐';
      const color = dialog.querySelector('#add-color').value;
      const proxyMode = dialog.querySelector('#add-proxy-mode').value;
      let proxy = '';
      if (proxyMode === 'direct') proxy = 'direct';
      else if (proxyMode === 'system') proxy = 'system';
      else if (proxyMode === 'custom') proxy = dialog.querySelector('#add-proxy').value.trim();

      if (!name) {
        alert('请输入站点名称');
        return;
      }
      if (!url || url === 'https://') {
        alert('请输入有效的站点 URL');
        return;
      }

      try {
        await window.api.addSite({ name, url, icon, color, proxy });
        dialog.remove();
        await this.renderSiteList();
        await this.sidebar.loadSites();
        this.sidebar.render();
      } catch (err) {
        alert('添加失败: ' + err.message);
      }
    });
  }

  async showEditSite(siteId) {
    const sites = await window.api.getSites();
    const site = sites.find(s => s.id === siteId);
    if (!site) return;

    const dialog = document.createElement('div');
    dialog.className = 'edit-dialog-overlay';
    dialog.innerHTML = `
      <div class="edit-dialog">
        <h3>编辑站点 - ${site.name}</h3>
        <div class="edit-field">
          <label>名称</label>
          <input type="text" id="edit-name" value="${site.name}">
        </div>
        <div class="edit-field">
          <label>URL</label>
          <input type="text" id="edit-url" value="${site.url}">
        </div>
        <div class="edit-field">
          <label>图标 (emoji)</label>
          <input type="text" id="edit-icon" value="${site.icon}">
        </div>
        <div class="edit-field">
          <label>颜色</label>
          <input type="color" id="edit-color" value="${site.color}">
        </div>
        <div class="edit-field">
          <label>代理</label>
          <select id="edit-proxy-mode">
            <option value="" ${!site.proxy ? 'selected' : ''}>使用默认</option>
            <option value="direct" ${site.proxy === 'direct' ? 'selected' : ''}>直连</option>
            <option value="system" ${site.proxy === 'system' ? 'selected' : ''}>系统代理</option>
            <option value="custom" ${site.proxy && site.proxy !== 'direct' && site.proxy !== 'system' ? 'selected' : ''}>自定义</option>
          </select>
          <input type="text" id="edit-proxy" value="${site.proxy && site.proxy !== 'direct' && site.proxy !== 'system' ? site.proxy : ''}" placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080" style="display:${site.proxy && site.proxy !== 'direct' && site.proxy !== 'system' ? 'block' : 'none'}">
        </div>
        <div class="edit-actions">
          <button id="edit-cancel" class="settings-action-btn">取消</button>
          <button id="edit-save" class="settings-action-btn primary">保存</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    dialog.querySelector('#edit-proxy-mode').addEventListener('change', (e) => {
      dialog.querySelector('#edit-proxy').style.display =
        e.target.value === 'custom' ? 'block' : 'none';
    });

    dialog.querySelector('#edit-cancel').addEventListener('click', () => dialog.remove());

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.remove();
    });

    dialog.querySelector('#edit-save').addEventListener('click', async () => {
      const proxyMode = dialog.querySelector('#edit-proxy-mode').value;
      let proxy = '';
      if (proxyMode === 'direct') proxy = 'direct';
      else if (proxyMode === 'system') proxy = 'system';
      else if (proxyMode === 'custom') proxy = dialog.querySelector('#edit-proxy').value.trim();

      await window.api.updateSite(siteId, {
        name: dialog.querySelector('#edit-name').value,
        url: dialog.querySelector('#edit-url').value,
        icon: dialog.querySelector('#edit-icon').value,
        color: dialog.querySelector('#edit-color').value,
        proxy
      });

      dialog.remove();
      await this.renderSiteList();
      await this.sidebar.loadSites();
      this.sidebar.render();
    });
  }

  async deleteSite(siteId) {
    const sites = await window.api.getSites();
    const site = sites.find(s => s.id === siteId);
    if (!site) return;

    const accountCount = site.accounts.length;
    const message = `确定要删除 "${site.name}" 吗？\n\n将删除 ${accountCount} 个账号的所有数据（Cookie、缓存等），此操作不可撤销。`;

    if (!confirm(message)) return;

    try {
      await window.api.deleteSite(siteId);
      await this.renderSiteList();
      await this.sidebar.loadSites();
      this.sidebar.render();
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
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

  async removeAccount(siteId, accountId) {
    const sites = await window.api.getSites();
    const site = sites.find(s => s.id === siteId);
    if (!site) return;

    const account = site.accounts.find(a => a.id === accountId);
    if (!account) return;

    if (site.accounts.length <= 1) {
      alert('不能删除最后一个账号，请直接删除站点。');
      return;
    }

    if (!confirm(`确定要删除账号 "${account.label}" 吗？该账号的所有数据将被清除。`)) return;

    try {
      await window.api.removeAccount(siteId, accountId);
      await this.renderSiteList();
      await this.sidebar.loadSites();
      this.sidebar.render();
    } catch (err) {
      alert('删除账号失败: ' + err.message);
    }
  }

  async renameAccount(siteId, accountId, currentLabel) {
    const newLabel = prompt('输入新的账号名称:', currentLabel);
    if (!newLabel || newLabel === currentLabel) return;

    try {
      // Update the account label in the site's accounts array
      const sites = await window.api.getSites();
      const site = sites.find(s => s.id === siteId);
      if (!site) return;

      const updatedAccounts = site.accounts.map(acc => {
        if (acc.id === accountId) {
          return { ...acc, label: newLabel };
        }
        return acc;
      });

      await window.api.updateSite(siteId, { accounts: updatedAccounts });
      await this.renderSiteList();
      await this.sidebar.loadSites();
      this.sidebar.render();
    } catch (err) {
      alert('重命名失败: ' + err.message);
    }
  }

  async editShortcut(siteId, currentShortcut) {
    const sites = await window.api.getSites();
    const site = sites.find(s => s.id === siteId);
    if (!site) return;

    // Get all used shortcuts
    const usedShortcuts = sites
      .filter(s => s.shortcut && s.id !== siteId)
      .map(s => s.shortcut);

    // Create shortcut selection dialog
    const dialog = document.createElement('div');
    dialog.className = 'edit-dialog-overlay';
    dialog.innerHTML = `
      <div class="edit-dialog">
        <h3>设置快捷键 - ${site.name}</h3>
        <div class="edit-field">
          <label>选择快捷键</label>
          <select id="shortcut-select">
            <option value="">不使用快捷键</option>
            ${[1,2,3,4,5,6,7,8,9].map(n => {
              const key = `Ctrl+${n}`;
              const isUsed = usedShortcuts.includes(key);
              const isCurrent = currentShortcut === key;
              return `<option value="${key}" ${isCurrent ? 'selected' : ''} ${isUsed ? 'disabled' : ''}>${key} ${isUsed ? '(已使用)' : ''}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="edit-actions">
          <button id="shortcut-cancel" class="settings-action-btn">取消</button>
          <button id="shortcut-save" class="settings-action-btn primary">保存</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Cancel
    dialog.querySelector('#shortcut-cancel').addEventListener('click', () => dialog.remove());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.remove();
    });

    // Save
    dialog.querySelector('#shortcut-save').addEventListener('click', async () => {
      const shortcut = dialog.querySelector('#shortcut-select').value;
      try {
        await window.api.updateSite(siteId, { shortcut: shortcut || null });
        dialog.remove();
        await this.renderSiteList();
      } catch (err) {
        alert('保存失败: ' + err.message);
      }
    });
  }

  async removeShortcut(siteId) {
    try {
      await window.api.updateSite(siteId, { shortcut: null });
      await this.renderSiteList();
    } catch (err) {
      alert('删除快捷键失败: ' + err.message);
    }
  }
}

window.SiteManager = SiteManager;
