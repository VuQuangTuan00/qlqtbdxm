/* ============================================================
   Modal - Reusable modal/dialog component
   ============================================================ */
'use strict';

const modal = (() => {
  const container = document.getElementById('modal-container');
  let modalSequence = 0;

  /**
   * Mở modal tùy chỉnh
   * @param {Object} opts
   * @param {string} opts.title
   * @param {string|HTMLElement} opts.content
   * @param {string} [opts.size] - sm|''|lg|xl
   * @param {Array} [opts.buttons]
   * @param {Function} [opts.onClose]
   * @returns {{ el, close }}
   */
  function open({ title, content, size = '', buttons = [], onClose }) {
    const previousFocus = document.activeElement;
    const titleId = `modal-title-${++modalSequence}`;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const sizeClass = size ? `modal-${size}` : '';
    overlay.innerHTML = `
      <div class="modal ${sizeClass}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
        <div class="modal-header">
          <h5 class="modal-title" id="${titleId}">${title}</h5>
          <button class="modal-close" aria-label="Đóng">&times;</button>
        </div>
        <div class="modal-body"></div>
        ${buttons.length ? `<div class="modal-footer"></div>` : ''}
      </div>
    `;

    const modalEl   = overlay.querySelector('.modal');
    const bodyEl    = overlay.querySelector('.modal-body');
    const footerEl  = overlay.querySelector('.modal-footer');
    const closeBtn  = overlay.querySelector('.modal-close');
    let closed = false;

    // Set content
    if (typeof content === 'string') {
      bodyEl.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      bodyEl.appendChild(content);
    }

    // Buttons
    if (footerEl && buttons.length) {
      for (const btn of buttons) {
        const b = document.createElement('button');
        b.className = `btn ${btn.class || 'btn-secondary'}`;
        b.textContent = btn.label;

        if (btn.loadingText) {
          let pending = false;
          b.addEventListener('click', async () => {
            if (!btn.action || pending) return;
            pending = true;

            const footerButtons = [...footerEl.querySelectorAll('button')];
            const previousDisabled = footerButtons.map((button) => button.disabled);
            footerButtons.forEach((button) => { button.disabled = true; });
            modalEl.setAttribute('aria-busy', 'true');
            b.classList.add('modal-action-loading');
            b.textContent = '';

            const spinner = document.createElement('span');
            spinner.className = 'modal-action-loading-spinner';
            spinner.setAttribute('aria-hidden', 'true');
            const loadingLabel = document.createElement('span');
            loadingLabel.textContent = btn.loadingText;
            b.append(spinner, loadingLabel);

            try {
              await btn.action(close);
            } catch (error) {
              console.error('Modal action failed:', error);
              if (window.toast?.error) window.toast.error('Lỗi', error.message || 'Không thể hoàn thành thao tác');
            } finally {
              if (!closed && overlay.isConnected) {
                pending = false;
                footerButtons.forEach((button, index) => { button.disabled = previousDisabled[index]; });
                modalEl.removeAttribute('aria-busy');
                b.classList.remove('modal-action-loading');
                b.textContent = btn.label;
              }
            }
          });
        } else {
          b.addEventListener('click', () => btn.action && btn.action(close));
        }
        footerEl.appendChild(b);
      }
    }

    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKeyDown);
      overlay.classList.add('leaving');
      overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
      setTimeout(() => overlay.remove(), 300);
      onClose && onClose();
      if (previousFocus instanceof HTMLElement) setTimeout(() => previousFocus.focus(), 0);
    }

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // Escape key
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = [...modalEl.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);

    container.appendChild(overlay);
    setTimeout(() => {
      const firstFocusable = modalEl.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href]');
      if (firstFocusable) firstFocusable.focus();
    }, 0);
    return { el: modalEl, close };
  }

  /**
   * Dialog xác nhận
   * @param {Object} opts
   * @returns {Promise<boolean>}
   */
  function confirm({ title = 'Xác nhận', message, sub, confirmText = 'Xác nhận', cancelText = 'Hủy', type = 'warning' }) {
    return new Promise((resolve) => {
      let resolved = false;
      const { close } = open({
        title,
        size: 'sm',
        content: `
          <div class="confirm-content">
            <div class="confirm-icon ${type}">${type === 'danger'
              ? '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>'
              : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg>'}</div>
            <div class="confirm-message">${message}</div>
            ${sub ? `<div class="confirm-sub">${sub}</div>` : ''}
          </div>
        `,
        buttons: [
          {
            label: cancelText,
            class: 'btn-secondary',
            action: (c) => { resolved = true; resolve(false); c(); },
          },
          {
            label: confirmText,
            class: type === 'danger' ? 'btn-danger' : 'btn-warning',
            action: (c) => { resolved = true; resolve(true); c(); },
          },
        ],
        onClose: () => { if (!resolved) resolve(false); },
      });
    });
  }

  /**
   * Dialog nhập liệu đơn giản
   * @param {Object} opts
   * @returns {Promise<string|null>}
   */
  function prompt({ title, label, placeholder = '', value = '', required = false }) {
    return new Promise((resolve) => {
      let resolved = false;
      const inputId = 'modal-prompt-input';
      const { close } = open({
        title,
        size: 'sm',
        content: `
          <div class="form-group">
            <label class="form-label ${required ? 'required' : ''}" for="${inputId}">${label}</label>
            <input type="text" id="${inputId}" class="form-control" placeholder="${placeholder}" value="${value}" />
          </div>
        `,
        buttons: [
          {
            label: 'Hủy',
            class: 'btn-secondary',
            action: (c) => { resolved = true; resolve(null); c(); },
          },
          {
            label: 'Xác nhận',
            class: 'btn-primary',
            action: (c) => {
              const val = document.getElementById(inputId).value.trim();
              if (required && !val) {
                document.getElementById(inputId).classList.add('error');
                return;
              }
              resolved = true; resolve(val); c();
            },
          },
        ],
        onClose: () => { if (!resolved) resolve(null); },
      });

      setTimeout(() => {
        const inp = document.getElementById(inputId);
        if (inp) { inp.focus(); inp.select(); }
      }, 50);
    });
  }

  /**
   * Alert dialog
   * @param {Object} opts
   * @returns {Promise<void>}
   */
  function alert({ title, message, type = 'info', okText = 'Đóng' }) {
    return new Promise((resolve) => {
      open({
        title,
        size: 'sm',
        content: `<div class="alert alert-${type}">${message}</div>`,
        buttons: [
          {
            label: okText,
            class: 'btn-primary',
            action: (c) => { resolve(); c(); },
          },
        ],
        onClose: resolve,
      });
    });
  }

  return { open, confirm, prompt, alert };
})();

window.modal = modal;
