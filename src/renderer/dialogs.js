window.dialogs = (() => {
  let queue = Promise.resolve();

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function enqueue(openDialog) {
    const result = queue.then(openDialog, openDialog);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  function getFocusableElements(dialog) {
    return Array.from(dialog.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
  }

  function keepFocusInside(event, dialog) {
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(dialog);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openMessageDialog(message, options, asksForConfirmation) {
    return new Promise(resolve => {
      const dialogId = asksForConfirmation ? 'confirm' : 'alert';
      const token = Symbol(`${dialogId}-dialog`);
      const previousFocus = document.activeElement;
      const title = options.title || (asksForConfirmation ? '确认操作' : '提示');
      const confirmLabel = options.confirmLabel || (asksForConfirmation ? '确定' : '知道了');
      const cancelLabel = options.cancelLabel || '取消';
      const dialog = document.createElement('div');
      dialog.className = 'edit-dialog-overlay';
      dialog.dataset.dialog = dialogId;
      dialog.innerHTML = `
        <form class="edit-dialog app-dialog" role="${asksForConfirmation ? 'dialog' : 'alertdialog'}" aria-modal="true" aria-labelledby="${dialogId}-title">
          <h3 id="${dialogId}-title">${escapeHtml(title)}</h3>
          <p class="app-dialog-message">${escapeHtml(message)}</p>
          <div class="edit-actions">
            ${asksForConfirmation ? `<button type="button" class="settings-action-btn" data-action="cancel">${escapeHtml(cancelLabel)}</button>` : ''}
            <button type="submit" class="settings-action-btn ${options.danger ? 'danger' : 'primary'}" data-action="confirm">${escapeHtml(confirmLabel)}</button>
          </div>
        </form>
      `;

      document.body.appendChild(dialog);
      window.viewOverlay.acquire(token);
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKeyDown, true);
        dialog.remove();
        window.viewOverlay.release(token);
        if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
          previousFocus.focus({ preventScroll: true });
        }
        resolve(result);
      };
      const onKeyDown = event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          finish(!asksForConfirmation);
          return;
        }
        keepFocusInside(event, dialog);
      };

      dialog.querySelector('form').addEventListener('submit', event => {
        event.preventDefault();
        finish(true);
      });
      dialog.querySelector('[data-action="cancel"]')?.addEventListener('click', () => finish(false));
      dialog.addEventListener('click', event => {
        if (event.target === dialog) finish(!asksForConfirmation);
      });
      document.addEventListener('keydown', onKeyDown, true);
      dialog.querySelector('[data-action="confirm"]').focus();
    });
  }

  function showMessage(message, options = {}) {
    return enqueue(() => openMessageDialog(message, options, false)).then(() => undefined);
  }

  function confirmAction(message, options = {}) {
    return enqueue(() => openMessageDialog(message, options, true));
  }

  function requestText({ dialogId, title, label, value = '', confirmLabel = '确定' }) {
    return enqueue(() => new Promise(resolve => {
      const token = Symbol('text-dialog');
      const previousFocus = document.activeElement;
      const dialog = document.createElement('div');
      dialog.className = 'edit-dialog-overlay';
      dialog.dataset.dialog = dialogId;
      dialog.innerHTML = `
        <form class="edit-dialog app-dialog" role="dialog" aria-modal="true" aria-labelledby="text-dialog-title">
          <h3 id="text-dialog-title">${escapeHtml(title)}</h3>
          <div class="edit-field">
            <label for="text-dialog-input">${escapeHtml(label)}</label>
            <input id="text-dialog-input" type="text" value="${escapeHtml(value)}" aria-required="true" maxlength="100">
            <p class="app-dialog-error hidden" role="alert">请输入内容</p>
          </div>
          <div class="edit-actions">
            <button type="button" class="settings-action-btn" data-action="cancel">取消</button>
            <button type="submit" class="settings-action-btn primary" data-action="confirm">${escapeHtml(confirmLabel)}</button>
          </div>
        </form>
      `;

      document.body.appendChild(dialog);
      window.viewOverlay.acquire(token);
      const input = dialog.querySelector('#text-dialog-input');
      const error = dialog.querySelector('.app-dialog-error');
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKeyDown, true);
        dialog.remove();
        window.viewOverlay.release(token);
        if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
          previousFocus.focus({ preventScroll: true });
        }
        resolve(result);
      };
      const onKeyDown = event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          finish(null);
          return;
        }
        keepFocusInside(event, dialog);
      };

      dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => finish(null));
      dialog.addEventListener('click', event => {
        if (event.target === dialog) finish(null);
      });
      dialog.querySelector('form').addEventListener('submit', event => {
        event.preventDefault();
        const result = input.value.trim();
        if (!result) {
          input.setAttribute('aria-invalid', 'true');
          error.classList.remove('hidden');
          input.focus();
          return;
        }
        finish(result);
      });
      input.addEventListener('input', () => {
        input.removeAttribute('aria-invalid');
        error.classList.add('hidden');
      });
      document.addEventListener('keydown', onKeyDown, true);
      input.focus();
      input.select();
    }));
  }

  return { showMessage, confirmAction, requestText };
})();
