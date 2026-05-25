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
  function navigate(name, params = {}) {
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
        route.render(pageView, params);
      } catch (err) {
        console.error(`[Router] Lỗi render ${name}:`, err);
        pageView.innerHTML = `
          <div class="alert alert-danger">
            <strong>Lỗi tải trang:</strong> ${err.message}
          </div>`;
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
    if (_currentRoute) navigate(_currentRoute, params);
  }

  return { register, navigate, current, refresh };
})();

window.router = router;
