/* ============================================================
   Toast - Notification system
   ============================================================ */
'use strict';

const toast = (() => {
  const container = document.getElementById('toast-container');

  const ICONS = {
    success: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
    error:   '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    warning: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg>',
    info:    '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>',
  };

  const TITLES = {
    success: 'Thành công',
    error:   'Lỗi',
    warning: 'Cảnh báo',
    info:    'Thông tin',
  };

  /**
   * Hiển thị toast
   * @param {Object} opts
   * @param {string} opts.type - success|error|warning|info
   * @param {string} opts.title
   * @param {string} [opts.message]
   * @param {number} [opts.duration] - ms, 0 = không tự đóng
   */
  function show({ type = 'info', title, message, duration = 4000 }) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `
      <div class="toast-icon">${ICONS[type] || ICONS.info}</div>
      <div class="toast-body">
        <div class="toast-title">${title || TITLES[type]}</div>
        ${message ? `<div class="toast-message">${message}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Đóng">&times;</button>
    `;

    el.querySelector('.toast-close').addEventListener('click', () => dismiss(el));
    container.appendChild(el);

    if (duration > 0) {
      setTimeout(() => dismiss(el), duration);
    }

    return el;
  }

  function dismiss(el) {
    if (!el || !el.parentNode) return;
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  }

  function success(title, message) { return show({ type: 'success', title, message }); }
  function error(title, message)   { return show({ type: 'error',   title, message }); }
  function warning(title, message) { return show({ type: 'warning', title, message }); }
  function info(title, message)    { return show({ type: 'info',    title, message }); }

  return { show, dismiss, success, error, warning, info };
})();

window.toast = toast;
