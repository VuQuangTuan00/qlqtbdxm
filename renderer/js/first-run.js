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
    <div style="max-width:680px;width:100%;">

      <!-- Header -->
      <div style="text-align:center;margin-bottom:32px;">
        <img src="assets/images/logo.png" alt="Logo"
             style="height:56px;margin-bottom:14px;object-fit:contain;"
             onerror="this.style.display='none'" />
        <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;
                   color:var(--text-primary,#1a1a2e);">
          Chào mừng đến với QLQT Bảo Dưỡng Xe Máy
        </h2>
        <p style="margin:0;color:var(--text-secondary,#666);font-size:14px;">
          Chọn chế độ sử dụng phù hợp để bắt đầu
        </p>
      </div>

      <!-- 2 cards chọn chế độ -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">

        <div id="fr-card-sqlite"
             style="background:#fff;border:2px solid #e0e0e0;border-radius:12px;
                    padding:28px 20px;cursor:pointer;transition:border-color 0.2s,box-shadow 0.2s;
                    text-align:center;">
          <div style="font-size:44px;margin-bottom:10px;">🗃️</div>
          <div style="font-size:16px;font-weight:700;margin-bottom:8px;
                      color:var(--text-primary,#1a1a2e);">Chế độ Demo</div>
          <div style="font-size:13px;color:var(--text-secondary,#666);line-height:1.6;">
            Dùng <strong>SQLite</strong> nội bộ, không cần kết nối mạng.<br>
            Dữ liệu mẫu có sẵn — phù hợp để trình diễn và khám phá phần mềm.
          </div>
        </div>

        <div id="fr-card-sqlserver"
             style="background:#fff;border:2px solid #e0e0e0;border-radius:12px;
                    padding:28px 20px;cursor:pointer;transition:border-color 0.2s,box-shadow 0.2s;
                    text-align:center;">
          <div style="font-size:44px;margin-bottom:10px;">🗄️</div>
          <div style="font-size:16px;font-weight:700;margin-bottom:8px;
                      color:var(--text-primary,#1a1a2e);">Chế độ Production</div>
          <div style="font-size:13px;color:var(--text-secondary,#666);line-height:1.6;">
            Kết nối <strong>SQL Server</strong> qua mạng LAN.<br>
            Dữ liệu thực, nhiều máy dùng chung — cần máy chủ SQL Server đang hoạt động.
          </div>
        </div>

      </div>

      <!-- Nút Demo (hiện khi chọn SQLite) -->
      <div id="fr-sqlite-action" style="display:none;text-align:center;margin-bottom:16px;">
        <button id="fr-btn-sqlite"
                style="padding:12px 44px;border:none;border-radius:8px;
                       background:var(--color-gold,#b8860b);color:#fff;
                       font-size:15px;font-weight:700;cursor:pointer;">
          Bắt đầu với chế độ Demo
        </button>
      </div>

      <!-- Form SQL Server (hiện khi chọn Production) -->
      <div id="fr-ss-form"
           style="display:none;background:#fff;border:1px solid #e0e0e0;
                  border-radius:12px;padding:24px;margin-bottom:16px;">
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
                          margin-bottom:4px;color:var(--text-secondary,#555);">
              Cổng (Port)
            </label>
            <input type="number" id="fr-port" value="1433"
                   style="width:100%;padding:8px 10px;border:1px solid #ccc;
                          border-radius:6px;font-size:13px;box-sizing:border-box;" />
          </div>
        </div>

        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:12px;font-weight:600;
                        margin-bottom:4px;color:var(--text-secondary,#555);">
            Tên database *
          </label>
          <input type="text" id="fr-db" placeholder="qlqtbdxm"
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
                          margin-bottom:4px;color:var(--text-secondary,#555);">
              Mật khẩu
            </label>
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
          <button id="fr-btn-save-ss"
                  style="padding:8px 24px;border:none;border-radius:6px;
                         background:var(--color-gold,#b8860b);color:#fff;
                         font-size:14px;font-weight:700;cursor:pointer;">
            Kết nối &amp; Khởi động
          </button>
        </div>
      </div>

      <p style="text-align:center;color:#aaa;font-size:12px;margin:0;">
        Bạn có thể đổi chế độ sau trong <strong>Cài đặt → Kết nối Database</strong>
      </p>

    </div>
  `;

  document.body.appendChild(overlay);

  /* ── Chọn card ────────────────────────────────────────────── */
  let selectedMode = null;

  function _selectMode(mode) {
    selectedMode = mode;
    const active   = 'var(--color-gold,#b8860b)';
    const inactive = '#e0e0e0';
    document.getElementById('fr-card-sqlite').style.borderColor    = mode === 'sqlite'    ? active : inactive;
    document.getElementById('fr-card-sqlserver').style.borderColor = mode === 'sqlserver' ? active : inactive;
    document.getElementById('fr-card-sqlite').style.boxShadow    = mode === 'sqlite'    ? '0 0 0 3px rgba(184,134,11,.15)' : '';
    document.getElementById('fr-card-sqlserver').style.boxShadow = mode === 'sqlserver' ? '0 0 0 3px rgba(184,134,11,.15)' : '';

    document.getElementById('fr-sqlite-action').style.display = mode === 'sqlite'    ? 'block' : 'none';
    document.getElementById('fr-ss-form').style.display       = mode === 'sqlserver' ? 'block' : 'none';
  }

  document.getElementById('fr-card-sqlite').addEventListener('click',    () => _selectMode('sqlite'));
  document.getElementById('fr-card-sqlserver').addEventListener('click', () => _selectMode('sqlserver'));

  /* ── Demo: 1 click → lưu + relaunch ──────────────────────── */
  document.getElementById('fr-btn-sqlite').addEventListener('click', async () => {
    const btn = document.getElementById('fr-btn-sqlite');
    btn.disabled = true;
    btn.textContent = 'Đang khởi động...';
    await window.electronAPI.invoke('dbconfig:set', { mode: 'sqlite' });
  });

  /* ── SQL Server: test + save ──────────────────────────────── */
  function _getSsConfig() {
    return {
      server:   document.getElementById('fr-server').value.trim(),
      port:     parseInt(document.getElementById('fr-port').value) || 1433,
      database: document.getElementById('fr-db').value.trim(),
      user:     document.getElementById('fr-user').value.trim(),
      password: document.getElementById('fr-pass').value,
    };
  }

  function _showTestResult(success, msg) {
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
    const res = await window.electronAPI.invoke('dbconfig:test', _getSsConfig());
    btn.disabled = false;
    btn.textContent = 'Kiểm tra kết nối';
    const msg = res.success
      ? `${res.data.message}${res.data.latency ? ' (' + res.data.latency + 'ms)' : ''}`
      : res.error;
    _showTestResult(res.success, msg);
  });

  document.getElementById('fr-btn-save-ss').addEventListener('click', async () => {
    const cfg = _getSsConfig();
    if (!cfg.server || !cfg.database || !cfg.user) {
      _showTestResult(false, 'Vui lòng điền đầy đủ Server, Database và Tên đăng nhập');
      return;
    }
    const btn = document.getElementById('fr-btn-save-ss');
    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
    await window.electronAPI.invoke('dbconfig:set', { mode: 'sqlserver', ...cfg });
  });
});
