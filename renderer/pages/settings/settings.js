/* ============================================================
   Settings Page
   ============================================================ */
'use strict';

async function renderSettings(container) {
  const session = store.getSession();

  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">Cài Đặt Hệ Thống</h2>
        <p class="page-subtitle">Quản lý người dùng, đơn vị và cấu hình hệ thống</p>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn active" data-tab="profile">Hồ sơ cá nhân</button>
      <button class="tab-btn" data-tab="units">Quản lý đơn vị</button>
      ${store.hasRole('admin') ? `<button class="tab-btn" data-tab="users">Quản lý người dùng</button>` : ''}
      ${store.hasRole('admin') ? `<button class="tab-btn" data-tab="dbconfig">Kết nối Database</button>` : ''}
      <button class="tab-btn" data-tab="about">Về hệ thống</button>
    </div>

    <div id="tab-profile" class="tab-content active"></div>
    <div id="tab-units"   class="tab-content"></div>
    <div id="tab-users"   class="tab-content"></div>
    <div id="tab-dbconfig" class="tab-content"></div>
    <div id="tab-about"   class="tab-content"></div>
  `;

  container.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      container.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      document.getElementById(`tab-${tab}`).classList.add('active');
      if (tab === 'units') _loadUnitsTab();
      if (tab === 'users') _loadUsersTab();
      if (tab === 'dbconfig') _loadDbConfigTab();
    });
  });

  _renderProfileTab(session);
  _renderAboutTab();
}

function _renderProfileTab(session) {
  const el = document.getElementById('tab-profile');
  if (!el) return;
  el.innerHTML = `
    <div style="max-width:600px;">
      <div class="card" style="margin-bottom:var(--space-5);">
        <div class="card-header"><h5 class="card-title">Thông tin cá nhân</h5></div>
        <div class="card-body">
          <div style="display:flex;align-items:center;gap:var(--space-5);margin-bottom:var(--space-5);">
            <div style="width:72px;height:72px;border-radius:50%;background:var(--color-military-medium);
                 display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:bold;color:white;">
              ${session?.fullName?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <div class="fw-bold" style="font-size:var(--font-size-xl);">${session?.fullName || ''}</div>
              <div class="text-muted">${session?.username || ''}</div>
              <div style="margin-top:4px;"><span class="badge badge-info">${session?.roleName || ''}</span></div>
            </div>
          </div>
          <div class="detail-grid">
            <div class="detail-item">
              <div class="detail-label">Tên đăng nhập</div>
              <div class="detail-value">${session?.username || '—'}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Họ tên đầy đủ</div>
              <div class="detail-value">${session?.fullName || '—'}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Vai trò</div>
              <div class="detail-value">${session?.roleName || '—'}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Đơn vị</div>
              <div class="detail-value">${session?.unitName || '—'}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h5 class="card-title">Đổi mật khẩu</h5></div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label required">Mật khẩu hiện tại</label>
            <input type="password" class="form-control" id="old-password" />
          </div>
          <div class="form-group">
            <label class="form-label required">Mật khẩu mới</label>
            <input type="password" class="form-control" id="new-password" />
          </div>
          <div class="form-group">
            <label class="form-label required">Xác nhận mật khẩu mới</label>
            <input type="password" class="form-control" id="confirm-password" />
          </div>
          <button class="btn btn-primary" id="btn-change-pwd">Đổi mật khẩu</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-change-pwd').addEventListener('click', async () => {
    const oldPwd  = document.getElementById('old-password').value;
    const newPwd  = document.getElementById('new-password').value;
    const confPwd = document.getElementById('confirm-password').value;

    if (!oldPwd || !newPwd || !confPwd) { toast.warning('Thiếu thông tin', 'Vui lòng điền đầy đủ'); return; }
    if (newPwd !== confPwd) { toast.warning('Không khớp', 'Mật khẩu mới không khớp'); return; }
    if (newPwd.length < 6) { toast.warning('Quá ngắn', 'Mật khẩu cần ít nhất 6 ký tự'); return; }

    const res = await api.changePassword(oldPwd, newPwd);
    if (res.success) {
      toast.success('Đổi mật khẩu thành công');
      ['old-password', 'new-password', 'confirm-password'].forEach((id) => { document.getElementById(id).value = ''; });
    } else {
      toast.error('Lỗi', res.error);
    }
  });
}

async function _loadUnitsTab() {
  const el = document.getElementById('tab-units');
  if (!el || el.dataset.loaded) return;
  el.innerHTML = `<div style="text-align:center;padding:32px;"><div class="spinner"></div></div>`;

  const res = await api.listUnits();
  if (!res.success) { el.innerHTML = `<div class="alert alert-danger">${res.error}</div>`; return; }

  el.dataset.loaded = '1';
  el.innerHTML = `
    <div class="page-header" style="margin-bottom:var(--space-4);">
      <h5 class="card-title">Danh sách đơn vị (${res.data.length})</h5>
      ${store.hasRole('admin') ? `<button class="btn btn-primary btn-sm" id="btn-add-unit">+ Thêm đơn vị</button>` : ''}
    </div>
    <div class="table-container">
      <div class="table-wrapper">
        <table id="units-table">
          <thead><tr><th>Mã đơn vị</th><th>Tên đơn vị</th><th>Đơn vị cha</th><th>Ngày tạo</th>
          ${store.hasRole('admin') ? '<th>Thao tác</th>' : ''}</tr></thead>
          <tbody>
            ${res.data.map((u) => `<tr>
              <td class="fw-semibold">${u.unit_code}</td>
              <td>${u.unit_name}</td>
              <td>${u.parent_name || '<span class="text-muted">—</span>'}</td>
              <td>${u.created_at ? u.created_at.split('T')[0] : '—'}</td>
              ${store.hasRole('admin') ? `<td class="table-actions">
                <button class="btn btn-sm btn-secondary" onclick="editUnit(${u.id})">Sửa</button>
                <button class="btn btn-sm btn-danger" onclick="deleteUnit(${u.id},'${u.unit_name}')">Xóa</button>
              </td>` : ''}
            </tr>`).join('')}
            ${res.data.length === 0 ? '<tr><td colspan="5" class="text-center text-muted">Chưa có đơn vị nào</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (store.hasRole('admin')) {
    document.getElementById('btn-add-unit').addEventListener('click', () => openUnitForm(null));
  }
}

async function _loadUsersTab() {
  const el = document.getElementById('tab-users');
  if (!el || !store.hasRole('admin')) return;
  el.innerHTML = `<div style="text-align:center;padding:32px;"><div class="spinner"></div></div>`;

  const [usersRes, rolesRes] = await Promise.all([api.listUsers({ pageSize: 100 }), api.listRoles()]);
  if (!usersRes.success) { el.innerHTML = `<div class="alert alert-danger">${usersRes.error}</div>`; return; }

  const roles = rolesRes.success ? rolesRes.data : [];
  const users = usersRes.data.items || [];

  el.innerHTML = `
    <div class="page-header" style="margin-bottom:var(--space-4);">
      <h5 class="card-title">Người dùng hệ thống (${users.length})</h5>
      <button class="btn btn-primary btn-sm" id="btn-add-user">+ Thêm người dùng</button>
    </div>
    <div class="table-container">
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Vai trò</th><th>Đơn vị</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>
            ${users.map((u) => `<tr>
              <td class="fw-medium">${u.username}</td>
              <td>${u.full_name}</td>
              <td><span class="badge badge-info">${u.role_name || ''}</span></td>
              <td>${u.unit_name || '<span class="text-muted">—</span>'}</td>
              <td><span class="badge ${u.is_active ? 'badge-success' : 'badge-neutral'}">${u.is_active ? 'Hoạt động' : 'Vô hiệu'}</span></td>
              <td class="table-actions">
                <button class="btn btn-sm btn-${u.is_active ? 'warning' : 'success'}"
                  onclick="toggleUserActive(${u.id}, ${u.is_active})">${u.is_active ? 'Vô hiệu' : 'Kích hoạt'}</button>
              </td>
            </tr>`).join('')}
            ${users.length === 0 ? '<tr><td colspan="6" class="text-center text-muted">Chưa có người dùng</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btn-add-user').addEventListener('click', () => openUserForm(roles));
}

function _renderAboutTab() {
  const el = document.getElementById('tab-about');
  if (!el) return;
  el.innerHTML = `
    <div style="max-width:500px;">
      <div class="card">
        <div class="card-body" style="text-align:center;padding:var(--space-8);">
          <div style="font-size:64px;margin-bottom:var(--space-4);">🪖</div>
          <h3 style="margin-bottom:var(--space-2);">QLQT Bảo Dưỡng Xe Máy</h3>
          <p class="text-muted">Hệ Thống Quản Lý Bảo Dưỡng Xe Máy Quân Đội</p>
          <div class="divider"></div>
          <div class="detail-grid">
            <div class="detail-item">
              <div class="detail-label">Phiên bản</div>
              <div class="detail-value">1.0.0</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Nền tảng</div>
              <div class="detail-value">Electron.js</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Cơ sở dữ liệu</div>
              <div class="detail-value">SQLite (better-sqlite3)</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Nền tảng OS</div>
              <div class="detail-value">${window.electronAPI?.env?.platform || 'N/A'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function openUnitForm(unit) {
  const isEdit = !!unit;
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label required">Mã đơn vị</label>
      <input type="text" class="form-control" id="unit-code" value="${unit?.unit_code || ''}" ${isEdit ? 'readonly' : ''} />
    </div>
    <div class="form-group">
      <label class="form-label required">Tên đơn vị</label>
      <input type="text" class="form-control" id="unit-name" value="${unit?.unit_name || ''}" />
    </div>
    <div class="form-group">
      <label class="form-label">Đơn vị cha</label>
      <select class="form-control" id="unit-parent">
        <option value="">-- Không có (đơn vị gốc) --</option>
      </select>
    </div>
  `;

  // Load units for parent
  api.listUnits().then((res) => {
    if (!res.success) return;
    const sel = content.querySelector('#unit-parent');
    for (const u of res.data) {
      if (isEdit && u.id === unit.id) continue;
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.unit_code} - ${u.unit_name}`;
      sel.appendChild(opt);
    }
    if (unit?.parent_unit_id) sel.value = unit.parent_unit_id;
  });

  modal.open({
    title: isEdit ? 'Chỉnh sửa đơn vị' : 'Thêm đơn vị mới',
    content,
    buttons: [
      { label: 'Hủy', class: 'btn-secondary', action: (c) => c() },
      {
        label: isEdit ? 'Cập nhật' : 'Tạo mới',
        class: 'btn-primary',
        action: async (c) => {
          const data = {
            unit_code:      content.querySelector('#unit-code').value.trim(),
            unit_name:      content.querySelector('#unit-name').value.trim(),
            parent_unit_id: parseInt(content.querySelector('#unit-parent').value) || null,
          };
          if (!data.unit_name) { toast.warning('Thiếu thông tin', 'Vui lòng nhập tên đơn vị'); return; }

          let res;
          if (isEdit) res = await api.updateUnit(unit.id, data);
          else {
            if (!data.unit_code) { toast.warning('Thiếu thông tin', 'Vui lòng nhập mã đơn vị'); return; }
            res = await api.createUnit(data);
          }

          if (res.success) {
            toast.success(isEdit ? 'Cập nhật thành công' : 'Tạo đơn vị thành công');
            delete document.getElementById('tab-units').dataset.loaded;
            c();
            _loadUnitsTab();
          } else {
            toast.error('Lỗi', res.error);
          }
        },
      },
    ],
  });
}

async function editUnit(id) {
  const res = await api.getUnit(id);
  if (!res.success) { toast.error('Lỗi', res.error); return; }
  openUnitForm(res.data);
}

async function deleteUnit(id, name) {
  const ok = await modal.confirm({
    title: 'Xóa đơn vị', message: `Xóa đơn vị "${name}"?`,
    type: 'danger', confirmText: 'Xóa',
  });
  if (!ok) return;
  const res = await api.deleteUnit(id);
  if (res.success) {
    toast.success('Đã xóa đơn vị');
    delete document.getElementById('tab-units').dataset.loaded;
    _loadUnitsTab();
  } else {
    toast.error('Lỗi', res.error);
  }
}

function openUserForm(roles) {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label required">Tên đăng nhập</label>
        <input type="text" class="form-control" id="uf-username" />
      </div>
      <div class="form-group">
        <label class="form-label required">Mật khẩu</label>
        <input type="password" class="form-control" id="uf-password" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label required">Họ tên đầy đủ</label>
      <input type="text" class="form-control" id="uf-fullname" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label required">Vai trò</label>
        <select class="form-control" id="uf-role">
          <option value="">-- Chọn vai trò --</option>
          ${roles.map((r) => `<option value="${r.id}">${r.role_name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Đơn vị</label>
        <select class="form-control" id="uf-unit">
          <option value="">-- Không xác định --</option>
        </select>
      </div>
    </div>
  `;

  api.listUnits().then((res) => {
    if (!res.success) return;
    const sel = content.querySelector('#uf-unit');
    for (const u of res.data) {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.unit_code} - ${u.unit_name}`;
      sel.appendChild(opt);
    }
  });

  modal.open({
    title: 'Tạo người dùng mới',
    content,
    buttons: [
      { label: 'Hủy', class: 'btn-secondary', action: (c) => c() },
      {
        label: 'Tạo người dùng',
        class: 'btn-primary',
        action: async (c) => {
          const data = {
            username:  content.querySelector('#uf-username').value.trim(),
            password:  content.querySelector('#uf-password').value,
            full_name: content.querySelector('#uf-fullname').value.trim(),
            role_id:   parseInt(content.querySelector('#uf-role').value) || null,
            unit_id:   parseInt(content.querySelector('#uf-unit').value) || null,
          };
          if (!data.username || !data.password || !data.full_name || !data.role_id) {
            toast.warning('Thiếu thông tin', 'Vui lòng điền đầy đủ thông tin bắt buộc'); return;
          }
          const res = await api.createUser(data);
          if (res.success) {
            toast.success('Tạo người dùng thành công');
            delete document.getElementById('tab-users').dataset?.loaded;
            c();
            _loadUsersTab();
          } else {
            toast.error('Lỗi', res.error);
          }
        },
      },
    ],
  });
}

async function toggleUserActive(id, currentActive) {
  const ok = await modal.confirm({
    title: currentActive ? 'Vô hiệu hóa' : 'Kích hoạt',
    message: currentActive ? 'Vô hiệu hóa tài khoản này?' : 'Kích hoạt tài khoản này?',
    confirmText: currentActive ? 'Vô hiệu hóa' : 'Kích hoạt',
    type: currentActive ? 'danger' : 'warning',
  });
  if (!ok) return;
  const res = await api.toggleActive(id);
  if (res.success) {
    toast.success(res.message || 'Cập nhật thành công');
    _loadUsersTab();
  } else {
    toast.error('Lỗi', res.error);
  }
}

async function _loadDbConfigTab() {
  const el = document.getElementById('tab-dbconfig');
  if (!el) return;

  el.innerHTML = `
    <div style="max-width:560px;">
      <div class="card">
        <div class="card-header"><h5 class="card-title">Cấu hình kết nối Database</h5></div>
        <div class="card-body">
          <p style="color:var(--color-text-secondary);margin-bottom:var(--space-4);">
            Cấu hình kết nối tới máy chủ PostgreSQL dùng chung trong mạng LAN.
            Sau khi lưu, ứng dụng sẽ tự khởi động lại.
          </p>
          <div class="form-row">
            <div class="form-group" style="flex:2;">
              <label class="form-label required">Địa chỉ máy chủ (Host)</label>
              <input type="text" class="form-control" id="db-host" placeholder="192.168.1.100" />
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label required">Cổng (Port)</label>
              <input type="number" class="form-control" id="db-port" value="5432" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label required">Tên database</label>
            <input type="text" class="form-control" id="db-name" placeholder="qlqtbdxm" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label required">Tên đăng nhập</label>
              <input type="text" class="form-control" id="db-user" placeholder="qlqt_user" />
            </div>
            <div class="form-group">
              <label class="form-label">Mật khẩu</label>
              <input type="password" class="form-control" id="db-password" placeholder="Để trống = không đổi" />
            </div>
          </div>
          <div id="db-test-result" style="display:none;margin-bottom:var(--space-4);"></div>
          <div class="form-actions" style="display:flex;gap:var(--space-3);">
            <button class="btn btn-secondary" id="btn-test-db">Kiểm tra kết nối</button>
            <button class="btn btn-primary" id="btn-save-db">Lưu &amp; khởi động lại</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Load config hiện tại
  const cfgRes = await api.invoke('dbconfig:get');
  if (cfgRes.success) {
    const c = cfgRes.data;
    document.getElementById('db-host').value = c.host || '';
    document.getElementById('db-port').value = c.port || 5432;
    document.getElementById('db-name').value = c.database || '';
    document.getElementById('db-user').value = c.user || '';
  }

  function _getFormConfig() {
    return {
      host:     document.getElementById('db-host').value.trim(),
      port:     parseInt(document.getElementById('db-port').value) || 5432,
      database: document.getElementById('db-name').value.trim(),
      user:     document.getElementById('db-user').value.trim(),
      password: document.getElementById('db-password').value,
    };
  }

  function _showResult(success, message, latency) {
    const el = document.getElementById('db-test-result');
    el.style.display = 'block';
    el.className = success ? 'alert alert-success' : 'alert alert-danger';
    el.textContent = message + (latency ? ` (${latency}ms)` : '');
  }

  document.getElementById('btn-test-db').addEventListener('click', async () => {
    const btn = document.getElementById('btn-test-db');
    btn.disabled = true;
    btn.textContent = 'Đang kiểm tra...';
    const res = await api.invoke('dbconfig:test', _getFormConfig());
    btn.disabled = false;
    btn.textContent = 'Kiểm tra kết nối';
    _showResult(res.success, res.success ? res.data.message : res.error, res.data?.latency);
  });

  document.getElementById('btn-save-db').addEventListener('click', async () => {
    const config = _getFormConfig();
    if (!config.host || !config.database || !config.user) {
      toast.warning('Thiếu thông tin', 'Vui lòng điền đầy đủ Host, Database và Tên đăng nhập');
      return;
    }
    const ok = await modal.confirm({
      title: 'Lưu cấu hình',
      message: `Lưu kết nối tới ${config.host}:${config.port}/${config.database} và khởi động lại?`,
      confirmText: 'Lưu & khởi động lại',
      type: 'warning',
    });
    if (!ok) return;
    if (!config.password) delete config.password;
    await api.invoke('dbconfig:set', config);
  });
}

// Globals for inline onclick
window.editUnit = editUnit;
window.deleteUnit = deleteUnit;
window.toggleUserActive = toggleUserActive;

router.register('settings', {
  title: 'Cài Đặt Hệ Thống',
  render: (container) => renderSettings(container),
});

// router.register('maintenance-steps', {
//   title: 'Quy Trình Công Nghệ',
//   render: (container) => {
//     container.innerHTML = `
//       <div class="page-header">
//         <div class="page-header-left">
//           <h2 class="page-title">Quy Trình Công Nghệ</h2>
//           <p class="page-subtitle">Các bước quy trình bảo dưỡng theo loại</p>
//         </div>
//       </div>
//       <div class="card">
//         <div class="card-body">
//           <div class="alert alert-info">
//             Chọn loại bảo dưỡng để xem quy trình các bước tương ứng.
//           </div>
//           <div class="filter-bar" style="margin-bottom:var(--space-4);">
//             <select class="form-control" id="step-type-filter" style="max-width:200px;">
//               <option value="dinh_ky">Bảo dưỡng định kỳ</option>
//               <option value="dot_xuat">Bảo dưỡng đột xuất</option>
//               <option value="sua_chua">Sửa chữa</option>
//               <option value="kiem_tra">Kiểm tra</option>
//             </select>
//             <button class="btn btn-primary" id="btn-load-steps">Xem quy trình</button>
//           </div>
//           <div id="steps-display"></div>
//         </div>
//       </div>
//     `;

//     async function loadSteps() {
//       const type = document.getElementById('step-type-filter').value;
//       const res = await api.getPlanSteps(type);
//       const el = document.getElementById('steps-display');
//       if (!res.success) { el.innerHTML = `<div class="alert alert-danger">${res.error}</div>`; return; }
//       const steps = res.data;
//       if (!steps.length) { el.innerHTML = `<div class="alert alert-warning">Chưa có quy trình cho loại này</div>`; return; }
//       el.innerHTML = `<div class="steps-list">
//         ${steps.map((s) => `
//           <div class="step-item">
//             <div class="step-number">${s.step_order}</div>
//             <div class="step-info">
//               <div class="step-name">${s.step_name}</div>
//               <div class="step-req">${s.technical_requirement || ''}</div>
//               ${s.estimated_time ? `<div class="step-req">Thời gian dự kiến: ${s.estimated_time} phút</div>` : ''}
//             </div>
//           </div>
//         `).join('')}
//       </div>`;
//     }

//     document.getElementById('btn-load-steps').addEventListener('click', loadSteps);
//     loadSteps();
//   },
// });
