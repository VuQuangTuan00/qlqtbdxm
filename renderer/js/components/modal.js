/* ============================================================
   Modal - Reusable modal/dialog component
   ============================================================ */
'use strict';

const modal = (() => {
  const container = document.getElementById('modal-container');

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
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const sizeClass = size ? `modal-${size}` : '';
    overlay.innerHTML = `
      <div class="modal ${sizeClass}" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h5 class="modal-title">${title}</h5>
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
        b.addEventListener('click', () => btn.action && btn.action(close));
        footerEl.appendChild(b);
      }
    }

    function close() {
      overlay.classList.add('leaving');
      overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
      setTimeout(() => overlay.remove(), 300);
      onClose && onClose();
    }

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // Escape key
    function onKeyDown(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKeyDown); }
    }
    document.addEventListener('keydown', onKeyDown);

    container.appendChild(overlay);
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
          <div style="text-align:center;padding: 8px 0;">
            <div class="confirm-icon ${type}">${type === 'danger' ? '🗑️' : '⚠️'}</div>
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
