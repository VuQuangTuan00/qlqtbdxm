/* ============================================================
   Auth - Login, logout, session guard
   ============================================================ */
'use strict';

const auth = (() => {
  const loginScreen  = document.getElementById('login-screen');
  const appShell     = document.getElementById('app');
  const loginForm    = document.getElementById('login-form');
  const loginError   = document.getElementById('login-error');
  const loginBtn     = document.getElementById('login-btn');
  const btnLogout    = document.getElementById('btn-logout');
  const sidebarAvatar   = document.getElementById('sidebar-avatar');
  const sidebarUsername = document.getElementById('sidebar-username');
  const sidebarRole     = document.getElementById('sidebar-role');

  function showApp(session) {
    store.setSession(session);
    loginScreen.style.display = 'none';
    appShell.style.display = 'flex';
    _updateUserUI(session);
    sidebar.init();
    router.navigate('equipment-list');
  }

  function showLogin() {
    appShell.style.display = 'none';
    loginScreen.style.display = 'flex';
    store.setSession(null);
  }

  function _updateUserUI(session) {
    if (!session) return;
    sidebarAvatar.textContent = session.fullName ? session.fullName.charAt(0).toUpperCase() : '?';
    sidebarUsername.textContent = session.fullName || session.username;
    sidebarRole.textContent = session.roleName || '';
  }

  async function init() {
    const res = await api.getSession();
    if (res.success && res.data) {
      showApp(res.data);
    } else {
      showLogin();
    }
  }

  // Login form submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('input-username').value.trim();
    const password = document.getElementById('input-password').value;

    if (!username || !password) {
      _showError('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Đang đăng nhập...';
    loginError.classList.add('hidden');

    const res = await api.login(username, password);

    loginBtn.disabled = false;
    loginBtn.textContent = 'Đăng nhập';

    if (res.success) {
      showApp(res.data);
    } else {
      _showError(res.error || 'Đăng nhập thất bại');
    }
  });

  // Logout
  btnLogout.addEventListener('click', async () => {
    const confirmed = await modal.confirm({
      title: 'Đăng xuất',
      message: 'Bạn có chắc chắn muốn đăng xuất?',
      confirmText: 'Đăng xuất',
      type: 'warning',
    });
    if (!confirmed) return;

    await api.logout();
    showLogin();
    toast.show({ type: 'info', title: 'Đã đăng xuất', message: 'Hẹn gặp lại!' });
  });

  function _showError(msg) {
    loginError.textContent = msg;
    loginError.classList.remove('hidden');
  }

  return { init, showLogin, showApp };
})();

window.auth = auth;

// Khởi động khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  auth.init();
});
