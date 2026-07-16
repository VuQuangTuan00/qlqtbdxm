'use strict';

window.electronAPI.on('app:first-run', () => {
  const overlay = document.createElement('div');
  overlay.id = 'first-run-overlay';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:9999',
    'background:var(--bg-secondary,#f4f6f8)',
    'display:flex;flex-direction:column;align-items:center;justify-content:center',
    'padding:24px;overflow-y:auto',
  ].join(';');

  overlay.innerHTML = `
    <div style="max-width:520px;width:100%;">

      <!-- Header -->
      <div style="text-align:center;margin-bottom:28px;">
        <img src="assets/images/logo.png" alt="Logo"
             style="height:56px;margin-bottom:14px;object-fit:contain;"
             onerror="this.style.display='none'" />
        <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;
                   color:var(--text-primary,#1a1a2e);">
          Chào mừng đến với QLQT Bảo Dưỡng Xe Máy
        </h2>
        <p style="margin:0;color:var(--text-secondary,#666);font-size:14px;">
          Nhập thông tin kết nối SQL Server để bắt đầu
        </p>
      </div>

      <!-- Form kết nối -->
      <div style="background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:24px;">
        <div style="font-weight:700;font-size:15px;margin-bottom:16px;
                    color:var(--text-primary,#1a1a2e);">Thông tin kết nối SQL Server</div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:12px;">
          <div>
            <label style="display:block;font-size:12px;font-weight:600;
                          margin-bottom:4px;color:var(--text-secondary,#555);">
              Địa chỉ máy chủ (Server) *
            </label>
            <input type="text" id="fr-server" placeholder="192.168.1.100 hoặc SERVER\INSTANCE"
                   style="width:100%;padding:8px 10px;border:1px solid #ccc;
                          border-radius:6px;font-size:13px;box-sizing:border-box;" />
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;
                          margin-bottom:4px;color:var(--text-secondary,#555);">Cổng (Port)</label>
            <input type="number" id="fr-port" value="1433"
                   style="width:100%;padding:8px 10px;border:1px solid #ccc;
                          border-radius:6px;font-size:13px;box-sizing:border-box;" />
          </div>
        </div>

        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:12px;font-weight:600;
                        margin-bottom:4px;color:var(--text-secondary,#555);">Tên database *</label>
          <input type="text" id="fr-db" placeholder="QTCN"
                 style="width:100%;padding:8px 10px;border:1px solid #ccc;
                        border-radius:6px;font-size:13px;box-sizing:border-box;" />
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div>
            <label style="display:block;font-size:12px;font-weight:600;
                          margin-bottom:4px;color:var(--text-secondary,#555);">
              Tên đăng nhập (SQL Auth) *
            </label>
            <input type="text" id="fr-user" placeholder="sa hoặc qlqt_user"
                   style="width:100%;padding:8px 10px;border:1px solid #ccc;
                          border-radius:6px;font-size:13px;box-sizing:border-box;" />
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;
                          margin-bottom:4px;color:var(--text-secondary,#555);">Mật khẩu</label>
            <input type="password" id="fr-pass"
                   style="width:100%;padding:8px 10px;border:1px solid #ccc;
                          border-radius:6px;font-size:13px;box-sizing:border-box;" />
          </div>
        </div>

        <div id="fr-test-result"
             style="display:none;padding:8px 12px;border-radius:6px;
                    margin-bottom:12px;font-size:13px;"></div>

        <div style="display:flex;gap:10px;align-items:center;">
          <button id="fr-btn-test"
                  style="padding:8px 16px;border:1px solid #bbb;border-radius:6px;
                         background:#f5f5f5;cursor:pointer;font-size:13px;">
            Kiểm tra kết nối
          </button>
          <button id="fr-btn-save"
                  style="padding:8px 24px;border:none;border-radius:6px;
                         background:var(--color-gold,#b8860b);color:#fff;
                         font-size:14px;font-weight:700;cursor:pointer;">
            Kết nối &amp; Khởi động
          </button>
        </div>
      </div>

    </div>
  `;

  document.body.appendChild(overlay);

  function _getConfig() {
    return {
      server:   document.getElementById('fr-server').value.trim(),
      port:     parseInt(document.getElementById('fr-port').value) || 1433,
      database: document.getElementById('fr-db').value.trim(),
      user:     document.getElementById('fr-user').value.trim(),
      password: document.getElementById('fr-pass').value,
    };
  }

  function _showResult(success, msg) {
    const el = document.getElementById('fr-test-result');
    el.style.display    = 'block';
    el.style.background = success ? '#e8f5e9' : '#ffebee';
    el.style.color      = success ? '#2e7d32' : '#c62828';
    el.textContent      = msg;
  }

  document.getElementById('fr-btn-test').addEventListener('click', async () => {
    const btn = document.getElementById('fr-btn-test');
    btn.disabled = true;
    btn.textContent = 'Đang kiểm tra...';
    const res = await window.electronAPI.invoke('dbconfig:test', _getConfig());
    btn.disabled = false;
    btn.textContent = 'Kiểm tra kết nối';
    const msg = res.success
      ? `${res.data.message}${res.data.latency ? ' (' + res.data.latency + 'ms)' : ''}`
      : res.error;
    _showResult(res.success, msg);
  });

  document.getElementById('fr-btn-save').addEventListener('click', async () => {
    const cfg = _getConfig();
    if (!cfg.server || !cfg.database || !cfg.user) {
      _showResult(false, 'Vui lòng điền đầy đủ Server, Database và Tên đăng nhập');
      return;
    }
    const btn = document.getElementById('fr-btn-save');
    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
    await window.electronAPI.invoke('dbconfig:set', { mode: 'sqlserver', ...cfg });
  });
});
