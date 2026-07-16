'use strict';

window.electronAPI.on('app:db-setup', ({ error, config }) => {
  const overlay = document.createElement('div');
  overlay.id = 'db-setup-overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999',
    'background:#f0f4ec',
    'display:flex', 'align-items:center', 'justify-content:center',
  ].join(';');

  overlay.innerHTML = `
    <div style="
      background:#fff; border-radius:16px; padding:36px 32px;
      width:500px; max-width:92vw;
      box-shadow:0 8px 32px rgba(0,0,0,0.13);
    ">
      <!-- Header -->
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:44px;margin-bottom:10px;">🔌</div>
        <h2 style="margin:0 0 6px;font-size:18px;color:#1a1a1a;">Không kết nối được cơ sở dữ liệu</h2>
        <p style="margin:0;font-size:13px;color:#6b7280;">
          Nhập thông tin kết nối SQL Server để tiếp tục
        </p>
      </div>

      <!-- Error detail -->
      <div style="
        background:#fee2e2;border-radius:8px;padding:10px 14px;
        margin-bottom:20px;font-size:12px;color:#b91c1c;word-break:break-all;
      ">${error}</div>

      <!-- Server + Port -->
      <div style="display:flex;gap:12px;margin-bottom:14px;">
        <div style="flex:2;">
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">
            Địa chỉ máy chủ (Server) *
          </label>
          <input id="dbs-server" type="text" value="${config.server || config.host || '127.0.0.1'}"
            placeholder="192.168.1.100 hoặc SERVER\\INSTANCE"
            style="width:100%;box-sizing:border-box;padding:9px 12px;
                   border:1px solid rgba(0,0,0,0.15);border-radius:8px;font-size:14px;" />
        </div>
        <div style="flex:1;">
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">Cổng</label>
          <input id="dbs-port" type="number" value="${config.port || 1433}"
            style="width:100%;box-sizing:border-box;padding:9px 12px;
                   border:1px solid rgba(0,0,0,0.15);border-radius:8px;font-size:14px;" />
        </div>
      </div>

      <!-- Database -->
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">
          Tên database *
        </label>
        <input id="dbs-db" type="text" value="${config.database || ''}"
          style="width:100%;box-sizing:border-box;padding:9px 12px;
                 border:1px solid rgba(0,0,0,0.15);border-radius:8px;font-size:14px;" />
      </div>

      <!-- User + Password -->
      <div style="display:flex;gap:12px;margin-bottom:20px;">
        <div style="flex:1;">
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">
            Tên đăng nhập (SQL Auth) *
          </label>
          <input id="dbs-user" type="text" value="${config.user || ''}"
            style="width:100%;box-sizing:border-box;padding:9px 12px;
                   border:1px solid rgba(0,0,0,0.15);border-radius:8px;font-size:14px;" />
        </div>
        <div style="flex:1;">
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">
            Mật khẩu
          </label>
          <input id="dbs-password" type="password" placeholder="Nhập mật khẩu"
            style="width:100%;box-sizing:border-box;padding:9px 12px;
                   border:1px solid rgba(0,0,0,0.15);border-radius:8px;font-size:14px;" />
        </div>
      </div>

      <!-- Result -->
      <div id="dbs-result" style="display:none;margin-bottom:16px;
        border-radius:8px;padding:10px 14px;font-size:13px;"></div>

      <!-- Buttons -->
      <div style="display:flex;gap:10px;">
        <button id="dbs-test" style="
          flex:1;padding:10px;border:1px solid rgba(0,0,0,0.15);
          border-radius:8px;background:#f3f4f6;color:#374151;
          cursor:pointer;font-size:13px;font-weight:500;
        ">Kiểm tra kết nối</button>
        <button id="dbs-save" style="
          flex:2;padding:10px;border:none;
          border-radius:8px;background:#1a1a1a;color:#fff;
          cursor:pointer;font-size:13px;font-weight:600;
        ">Kết nối &amp; Khởi động lại</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  function _cfg() {
    return {
      server:   document.getElementById('dbs-server').value.trim(),
      port:     parseInt(document.getElementById('dbs-port').value) || 1433,
      database: document.getElementById('dbs-db').value.trim(),
      user:     document.getElementById('dbs-user').value.trim(),
      password: document.getElementById('dbs-password').value,
    };
  }

  function _result(ok, msg) {
    const el = document.getElementById('dbs-result');
    el.style.display = 'block';
    el.style.background = ok ? '#dcfce7' : '#fee2e2';
    el.style.color      = ok ? '#15803d' : '#b91c1c';
    el.textContent = msg;
  }

  document.getElementById('dbs-test').addEventListener('click', async () => {
    const btn = document.getElementById('dbs-test');
    btn.disabled = true; btn.textContent = 'Đang kiểm tra…';
    const res = await window.electronAPI.invoke('dbconfig:test', _cfg());
    btn.disabled = false; btn.textContent = 'Kiểm tra kết nối';
    _result(res.success, res.success ? (res.data?.message || 'Kết nối thành công!') : res.error);
  });

  document.getElementById('dbs-save').addEventListener('click', async () => {
    const cfg = _cfg();
    if (!cfg.server || !cfg.database || !cfg.user) {
      _result(false, 'Vui lòng điền đầy đủ Server, Database và Tên đăng nhập');
      return;
    }
    const btn = document.getElementById('dbs-save');
    btn.disabled = true; btn.textContent = 'Đang lưu…';
    if (!cfg.password) delete cfg.password;
    await window.electronAPI.invoke('dbconfig:set', { mode: 'sqlserver', ...cfg });
  });
});
