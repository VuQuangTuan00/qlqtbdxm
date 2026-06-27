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
            Dùng <strong>SQLite</strong> nội bộ, không cần PostgreSQL.<br>
            Dữ liệu mẫu có sẵn — phù hợp để trình diễn và khám phá phần mềm.
          </div>
        </div>

        <div id="fr-card-postgres"
             style="background:#fff;border:2px solid #e0e0e0;border-radius:12px;
                    padding:28px 20px;cursor:pointer;transition:border-color 0.2s,box-shadow 0.2s;
                    text-align:center;">
          <div style="font-size:44px;margin-bottom:10px;">🐘</div>
          <div style="font-size:16px;font-weight:700;margin-bottom:8px;
                      color:var(--text-primary,#1a1a2e);">Chế độ Production</div>
          <div style="font-size:13px;color:var(--text-secondary,#666);line-height:1.6;">
            Kết nối <strong>PostgreSQL</strong> qua mạng LAN.<br>
            Dữ liệu thực, nhiều máy sử dụng chung — cần máy chủ PostgreSQL đang hoạt động.
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

      <!-- Form PostgreSQL (hiện khi chọn Production) -->
      <div id="fr-pg-form"
           style="display:none;background:#fff;border:1px solid #e0e0e0;
                  border-radius:12px;padding:24px;margin-bottom:16px;">
        <div style="font-weight:700;font-size:15px;margin-bottom:16px;
                    color:var(--text-primary,#1a1a2e);">Thông tin kết nối PostgreSQL</div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:12px;">
          <div>
            <label style="display:block;font-size:12px;font-weight:600;
                          margin-bottom:4px;color:var(--text-secondary,#555);">
              Địa chỉ máy chủ (Host) *
            </label>
            <input type="text" id="fr-host" placeholder="192.168.1.100"
                   style="width:100%;padding:8px 10px;border:1px solid #ccc;
                          border-radius:6px;font-size:13px;box-sizing:border-box;" />
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;
                          margin-bottom:4px;color:var(--text-secondary,#555);">
              Cổng (Port) *
            </label>
            <input type="number" id="fr-port" value="5432"
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
              Tên đăng nhập *
            </label>
            <input type="text" id="fr-user" placeholder="qlqt_user"
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
          <button id="fr-btn-save-pg"
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
    document.getElementById('fr-card-sqlite').style.borderColor   = mode === 'sqlite'   ? active : inactive;
    document.getElementById('fr-card-postgres').style.borderColor = mode === 'postgres' ? active : inactive;
    document.getElementById('fr-card-sqlite').style.boxShadow   = mode === 'sqlite'   ? '0 0 0 3px rgba(184,134,11,.15)' : '';
    document.getElementById('fr-card-postgres').style.boxShadow = mode === 'postgres' ? '0 0 0 3px rgba(184,134,11,.15)' : '';

    document.getElementById('fr-sqlite-action').style.display = mode === 'sqlite'   ? 'block' : 'none';
    document.getElementById('fr-pg-form').style.display       = mode === 'postgres' ? 'block' : 'none';
  }

  document.getElementById('fr-card-sqlite').addEventListener('click',   () => _selectMode('sqlite'));
  document.getElementById('fr-card-postgres').addEventListener('click', () => _selectMode('postgres'));

  /* ── Demo: 1 click → lưu + relaunch ──────────────────────── */
  document.getElementById('fr-btn-sqlite').addEventListener('click', async () => {
    const btn = document.getElementById('fr-btn-sqlite');
    btn.disabled = true;
    btn.textContent = 'Đang khởi động...';
    await window.electronAPI.invoke('dbconfig:set', { mode: 'sqlite' });
  });

  /* ── PostgreSQL: test + save ──────────────────────────────── */
  function _getPgConfig() {
    return {
      host:     document.getElementById('fr-host').value.trim(),
      port:     parseInt(document.getElementById('fr-port').value) || 5432,
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
    const res = await window.electronAPI.invoke('dbconfig:test', _getPgConfig());
    btn.disabled = false;
    btn.textContent = 'Kiểm tra kết nối';
    const msg = res.success
      ? `${res.data.message}${res.data.latency ? ' (' + res.data.latency + 'ms)' : ''}`
      : res.error;
    _showTestResult(res.success, msg);
  });

  document.getElementById('fr-btn-save-pg').addEventListener('click', async () => {
    const cfg = _getPgConfig();
    if (!cfg.host || !cfg.database || !cfg.user) {
      _showTestResult(false, 'Vui lòng điền đầy đủ Host, Database và Tên đăng nhập');
      return;
    }
    const btn = document.getElementById('fr-btn-save-pg');
    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
    await window.electronAPI.invoke('dbconfig:set', { mode: 'postgres', ...cfg });
  });
});
