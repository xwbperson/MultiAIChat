window.dialogs = (() => {
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function requestText({ dialogId, title, label, value = '', confirmLabel = '确定' }) {
    return new Promise(resolve => {
      const token = Symbol('text-dialog');
      const dialog = document.createElement('div');
      dialog.className = 'edit-dialog-overlay';
      dialog.dataset.dialog = dialogId;
      dialog.innerHTML = `
        <form class="edit-dialog" role="dialog" aria-modal="true" aria-labelledby="text-dialog-title">
          <h3 id="text-dialog-title">${escapeHtml(title)}</h3>
          <div class="edit-field">
            <label for="text-dialog-input">${escapeHtml(label)}</label>
            <input id="text-dialog-input" type="text" value="${escapeHtml(value)}" required maxlength="100">
          </div>
          <div class="edit-actions">
            <button type="button" class="settings-action-btn" data-action="cancel">取消</button>
            <button type="submit" class="settings-action-btn primary">${escapeHtml(confirmLabel)}</button>
          </div>
        </form>
      `;

      document.body.appendChild(dialog);
      window.viewOverlay.acquire(token);
      const input = dialog.querySelector('#text-dialog-input');
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKeyDown, true);
        dialog.remove();
        window.viewOverlay.release(token);
        resolve(result);
      };
      const onKeyDown = event => {
        if (event.key !== 'Escape') return;
        event.stopImmediatePropagation();
        finish(null);
      };

      dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => finish(null));
      dialog.addEventListener('click', event => {
        if (event.target === dialog) finish(null);
      });
      dialog.querySelector('form').addEventListener('submit', event => {
        event.preventDefault();
        const result = input.value.trim();
        if (!result) {
          input.setCustomValidity('请输入内容');
          input.reportValidity();
          return;
        }
        finish(result);
      });
      input.addEventListener('input', () => input.setCustomValidity(''));
      document.addEventListener('keydown', onKeyDown, true);
      input.focus();
      input.select();
    });
  }

  return { requestText };
})();
