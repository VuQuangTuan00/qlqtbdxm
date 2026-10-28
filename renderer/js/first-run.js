'use strict';

window.electronAPI.on('app:first-run', () => {
  if (document.getElementById('first-run-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'first-run-overlay';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:9999',
    'background:var(--bg-secondary,#f4f6f8)',
    'display:flex;align-items:center;justify-content:center',
    'padding:24px;overflow-y:auto',
  ].join(';');
  overlay.innerHTML = `
    <div style="max-width:520px;width:100%;">
      <div style="text-align:center;margin-bottom:28px;">
        <img src="assets/images/logo.png" alt="Logo" style="height:56px;margin-bottom:14px;object-fit:contain;" />
        <h2 style="margin:0 0 8px;font-size:22px;">Khởi tạo QLQT Bảo Dưỡng Xe Máy</h2>
        <p style="margin:0;color:#666;font-size:14px;">SQLite đã được tạo trên máy này. Hãy tạo tài khoản quản trị đầu tiên.</p>
      </div>
      <form id="bootstrap-form" style="background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:24px;">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Tên đăng nhập *</label>
        <input id="bootstrap-username" autocomplete="username" maxlength="100" style="width:100%;padding:9px;box-sizing:border-box;margin-bottom:12px;" />
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Họ tên *</label>
        <input id="bootstrap-fullname" maxlength="200" style="width:100%;padding:9px;box-sizing:border-box;margin-bottom:12px;" />
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Mật khẩu (ít nhất 8 ký tự) *</label>
        <input id="bootstrap-password" type="password" autocomplete="new-password" style="width:100%;padding:9px;box-sizing:border-box;margin-bottom:12px;" />
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Nhập lại mật khẩu *</label>
        <input id="bootstrap-confirm" type="password" autocomplete="new-password" style="width:100%;padding:9px;box-sizing:border-box;margin-bottom:12px;" />
        <div id="bootstrap-result" role="alert" style="display:none;padding:9px 12px;border-radius:6px;margin-bottom:12px;font-size:13px;"></div>
        <button id="bootstrap-submit" type="submit" style="width:100%;padding:10px;border:0;border-radius:6px;background:#1a1a1a;color:#fff;font-weight:700;cursor:pointer;">Tạo quản trị viên</button>
      </form>
    </div>`;
  document.body.appendChild(overlay);

  const result = overlay.querySelector('#bootstrap-result');
  const showError = (message) => {
    result.style.display = 'block';
    result.style.background = '#ffebee';
    result.style.color = '#c62828';
    result.textContent = message;
  };

  overlay.querySelector('#bootstrap-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = overlay.querySelector('#bootstrap-password').value;
    if (password !== overlay.querySelector('#bootstrap-confirm').value) {
      showError('Mật khẩu nhập lại không khớp');
      return;
    }
    const button = overlay.querySelector('#bootstrap-submit');
    button.disabled = true;
    button.textContent = 'Đang khởi tạo...';
    const response = await window.electronAPI.invoke('bootstrap:createAdmin', {
      username: overlay.querySelector('#bootstrap-username').value.trim(),
      full_name: overlay.querySelector('#bootstrap-fullname').value.trim(),
      password,
    });
    button.disabled = false;
    button.textContent = 'Tạo quản trị viên';
    if (!response.success) {
      showError(response.error || 'Không thể tạo tài khoản');
      return;
    }
    overlay.remove();
    document.getElementById('input-username').value = response.data.username;
    document.getElementById('input-password').focus();
  });
});
