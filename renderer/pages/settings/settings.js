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
      ${store.hasRole('admin') ? `<button class="tab-btn" data-tab="file-backup">File backup</button>` : ''}
      <button class="tab-btn" data-tab="about">Về hệ thống</button>
    </div>

    <div id="tab-profile" class="tab-content active"></div>
    <div id="tab-units"   class="tab-content"></div>
    <div id="tab-users"   class="tab-content"></div>
    <div id="tab-file-backup" class="tab-content"></div>
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
      if (tab === 'file-backup') _loadFileBackupTab();
    });
  });

  _renderProfileTab(session);
  _renderAboutTab();
}

function _loadFileBackupTab() {
  const el = document.getElementById('tab-file-backup');
  if (!el || !store.hasRole('admin')) return;

  el.innerHTML = `
    <div style="max-width:760px;">
      <div class="card">
        <div class="card-header"><h5 class="card-title">Sao lưu và khôi phục</h5></div>
        <div class="card-body">
          <p class="text-sm text-muted" style="margin-bottom:var(--space-4);">
            Gói ZIP gồm snapshot SQLite, ảnh, PDF, manifest và checksum SHA-256. Gói được kiểm tra toàn vẹn trước khi công bố hoặc khôi phục.
          </p>
          <div style="display:flex;gap:var(--space-3);flex-wrap:wrap;">
            <button class="btn btn-primary" id="btn-export-file-backup">Sao lưu toàn bộ</button>
            <button class="btn btn-secondary" id="btn-import-file-backup">Khôi phục từ backup</button>
          </div>
          <div id="file-backup-status" role="status" aria-live="polite" style="display:none;margin-top:var(--space-4);"></div>
        </div>
      </div>
    </div>
  `;

  const exportButton = el.querySelector('#btn-export-file-backup');
  const importButton = el.querySelector('#btn-import-file-backup');
  const status = el.querySelector('#file-backup-status');

  async function run(button, channel) {
    exportButton.disabled = true;
    importButton.disabled = true;
    const label = button.textContent;
    button.textContent = 'Đang xử lý...';
    status.style.display = 'none';
    try {
      const result = await window.electronAPI.invoke(channel);
      if (result.data?.canceled) return;
      status.className = result.success ? 'alert alert-success' : 'alert alert-danger';
      status.textContent = result.success
        ? `${result.message || 'Hoàn tất'}${result.data?.path ? `: ${result.data.path}` : ''}`
        : result.error;
      status.style.display = '';
    } catch (err) {
      status.className = 'alert alert-danger';
      status.textContent = err.message || 'Không thực hiện được thao tác backup.';
      status.style.display = '';
    } finally {
      button.textContent = label;
      exportButton.disabled = false;
      importButton.disabled = false;
    }
  }

  exportButton.addEventListener('click', () => run(exportButton, 'fileArchive:export'));
  importButton.addEventListener('click', async () => {
    const confirmed = await modal.confirm({
      title: 'Khôi phục dữ liệu',
      message: 'Ứng dụng sẽ kiểm tra gói backup, tạo safety backup của dữ liệu hiện tại rồi mới yêu cầu xác nhận cuối cùng.',
      confirmText: 'Chọn file backup',
      type: 'warning',
    });
    if (confirmed) run(importButton, 'fileArchive:import');
  });
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
            <div style="width:72px;height:72px;border-radius:50%;background:var(--color-gold-glow);
                 border:2px solid var(--color-gold-border);
                 display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:bold;color:var(--color-gold);">
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
                <button class="btn btn-sm btn-secondary" data-unit-edit="${u.id}">Sửa</button>
                <button class="btn btn-sm btn-danger" data-unit-delete="${u.id}">Xóa</button>
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
    const unitsById = new Map(res.data.map((unit) => [String(unit.id), unit]));
    el.querySelectorAll('[data-unit-edit]').forEach((button) => {
      button.addEventListener('click', () => editUnit(Number(button.dataset.unitEdit)));
    });
    el.querySelectorAll('[data-unit-delete]').forEach((button) => {
      button.addEventListener('click', () => {
        const unit = unitsById.get(button.dataset.unitDelete);
        if (unit) deleteUnit(unit.id, unit.unit_name);
      });
    });
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
                  data-user-toggle="${u.id}">${u.is_active ? 'Vô hiệu' : 'Kích hoạt'}</button>
              </td>
            </tr>`).join('')}
            ${users.length === 0 ? '<tr><td colspan="6" class="text-center text-muted">Chưa có người dùng</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btn-add-user').addEventListener('click', () => openUserForm(roles));
  const usersById = new Map(users.map((user) => [String(user.id), user]));
  el.querySelectorAll('[data-user-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const user = usersById.get(button.dataset.userToggle);
      if (user) toggleUserActive(user.id, Boolean(user.is_active));
    });
  });
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
              <div class="detail-value">SQLite (offline)</div>
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

router.register('settings', {
  title: 'Cài Đặt Hệ Thống',
  render: (container) => renderSettings(container),
});
