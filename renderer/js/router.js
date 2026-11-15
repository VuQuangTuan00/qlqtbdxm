/* ============================================================
   Router - Hash-based SPA router
   ============================================================ */
'use strict';

const router = (() => {
  const _routes = {};
  let _currentRoute = null;

  const pageView   = document.getElementById('page-view');
  const topbarTitle = document.getElementById('topbar-title');

  /**
   * Đăng ký route
   * @param {string} name
   * @param {Object} def - { title, render(params) }
   */
  function register(name, def) {
    _routes[name] = def;
  }

  /**
   * Điều hướng đến route
   * @param {string} name
   * @param {Object} [params]
   */
  async function navigate(name, params = {}) {
    const route = _routes[name];
    if (!route) {
      console.warn(`[Router] Route không tìm thấy: ${name}`);
      return;
    }

    // Guard: yêu cầu đăng nhập
    if (!store.getSession()) {
      auth.showLogin();
      return;
    }

    _currentRoute = name;
    store.set('currentRoute', name);
    sidebar.setActive(name);

    if (topbarTitle) topbarTitle.textContent = route.title || name;
    if (pageView) {
      pageView.innerHTML = '';
      try {
        await route.render(pageView, params);
      } catch (err) {
        console.error(`[Router] Lỗi render ${name}:`, err);
        pageView.innerHTML = '';
        const alert = document.createElement('div');
        alert.className = 'alert alert-danger';

        const label = document.createElement('strong');
        label.textContent = 'Lỗi tải trang: ';
        alert.append(label, document.createTextNode(err?.message || String(err)));
        pageView.appendChild(alert);
      }
    }
  }

  /**
   * Lấy route hiện tại
   */
  function current() { return _currentRoute; }

  /**
   * Refresh route hiện tại
   */
  function refresh(params = {}) {
    if (_currentRoute) return navigate(_currentRoute, params);
    return Promise.resolve();
  }

  return { register, navigate, current, refresh };
})();

window.router = router;
