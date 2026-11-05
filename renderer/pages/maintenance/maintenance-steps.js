/* ============================================================
   Danh Sách Trang Bị — vehicle + engine_maintenance (kiến trúc mới)
   ============================================================ */
'use strict';

/* ── Helpers ── */
function _isAdmin() { return store.hasRole('admin'); }


function _imgSrc(imgPath) {
  if (!imgPath) return null;
  return 'file:///' + imgPath.replace(/\\/g, '/');
}

function _wireImgFallbacks(container) {
  container.querySelectorAll('img[data-has-fallback]').forEach((img) => {
    img.addEventListener('error', () => {
      img.style.display = 'none';
      const fb = img.nextElementSibling;
      if (fb) fb.style.display = 'flex';
    });
  });
}

/* ════════════════════════════════════════════════════════════
   ROUTE: maintenance-steps — Grid danh sách xe
   ════════════════════════════════════════════════════════════ */
async function renderMaintenanceSteps(container) {
  const resTypes = await window.electronAPI.invoke('vehicleType:list');
  const typeList = (resTypes.success ? resTypes.data : []);

  const typeOptions = typeList.map(
    (t) => `<option value="${t.vehicle_type_id}">${t.vehicle_type_name}</option>`
  ).join('');

  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 8 8-4 8 4-8 4-8-4Z"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4"/></svg><span>Danh Sách Trang Bị</span></h2>
        <p class="page-subtitle">Quản lý loại xe và hạng mục bảo dưỡng động cơ</p>
      </div>
    </div>

    <div class="filter-bar vehicle-filter-bar">
      <div class="search-control">
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
        <input type="text" class="form-control search-input" id="v-search"
          placeholder="Tìm theo tên xe..." />
      </div>

      <select class="form-control vehicle-filter-select" id="v-type">
        <option value="">Tất cả loại hình</option>
        <option value="none">— Chưa phân loại</option>
        ${typeOptions}
      </select>

      <select class="form-control vehicle-filter-select" id="v-sort">
        <option value="newest">Mới thêm gần đây</option>
        <option value="files">Dữ liệu đã có file</option>
        <option value="name">Sắp xếp A → Z</option>
      </select>

      ${_isAdmin() ? `
        <button class="btn btn-outline btn-sm" id="btn-manage-types">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h7l9 9-6 6-9-9V5Z"/><circle cx="8.5" cy="8.5" r="1.2"/></svg>
          Loại hình
        </button>
        <button class="btn btn-primary" id="btn-add-vehicle">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          Thêm xe
        </button>
      ` : ''}
    </div>

    <div id="vehicle-grid" class="vehicle-grid">
      <div class="vehicle-grid-state">
        <div class="spinner"></div>
      </div>
    </div>
  `;

  await _loadVehicleGrid();

  let timer;
  document.getElementById('v-search').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(_loadVehicleGrid, 400);
  });

  document.getElementById('v-type').addEventListener('change', _loadVehicleGrid);
  document.getElementById('v-sort').addEventListener('change', _loadVehicleGrid);

  if (_isAdmin()) {
    document.getElementById('btn-manage-types').addEventListener('click', () => openVehicleTypeManager());
    document.getElementById('btn-add-vehicle').addEventListener('click', () => openVehicleForm(null));
  }
}

async function _loadVehicleGrid() {
  const grid = document.getElementById('vehicle-grid');
  if (!grid) return;

  const search  = document.getElementById('v-search')?.value || '';
  const typeRaw = document.getElementById('v-type')?.value   || '';
  const sort    = document.getElementById('v-sort')?.value   || 'newest';

  grid.innerHTML = `<div class="vehicle-grid-state"><div class="spinner"></div></div>`;

  const opts = { search, isActive: true, sort };
  if (typeRaw === 'none')  opts.typeId = 'none';
  else if (typeRaw)        opts.typeId = parseInt(typeRaw);

  const res = await window.electronAPI.invoke('vehicle:list', opts);
  if (!res.success) {
    grid.innerHTML = `<div class="vehicle-grid-state alert alert-danger">${res.error}</div>`;
    return;
  }

  const list = res.data;
  if (!list.length) {
    grid.innerHTML = `
      <div class="vehicle-grid-state table-empty">
        <div class="table-empty-icon"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 15h16l-1.4-5.1A2 2 0 0 0 16.7 8H7.3a2 2 0 0 0-1.9 1.4L4 15Z"/><path d="M3 15v3h2m14 0h2v-3"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/></svg></div>
        <div class="table-empty-text">Chưa có xe nào</div>
      </div>`;
    return;
  }

  grid.innerHTML = list.map(_renderVehicleCard).join('');

  _wireImgFallbacks(grid);

  grid.querySelectorAll('.vehicle-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.vc-actions')) return;
      router.navigate('vehicle-detail', { id: parseInt(card.dataset.id) });
    });
    card.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.vc-actions, button, a, input, select, textarea')) {
        e.preventDefault();
        router.navigate('vehicle-detail', { id: parseInt(card.dataset.id) });
      }
    });
  });

  if (_isAdmin()) {
    grid.querySelectorAll('.btn-vc-edit').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const res = await window.electronAPI.invoke('vehicle:get', { id: parseInt(btn.dataset.id) });
        if (res.success) openVehicleForm(res.data);
        else toast.error('Lỗi', res.error);
      });
    });
    grid.querySelectorAll('.btn-vc-delete').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await modal.confirm({
          title: 'Xóa loại xe', type: 'danger', confirmText: 'Xóa',
          message: `Xóa loại xe "${btn.dataset.name}"?`,
          sub: 'Toàn bộ hạng mục bảo dưỡng và file PDF của loại xe này sẽ bị xóa.',
        });
        if (!confirmed) return;
        const res = await window.electronAPI.invoke('vehicle:delete', { id: parseInt(btn.dataset.id) });
        if (res.success) { toast.success('Đã xóa loại xe'); _loadVehicleGrid(); }
        else toast.error('Lỗi', res.error);
      });
    });
  }
}

function _renderVehicleCard(v) {
  const src = _imgSrc(v.img_path);
  const img = src
    ? `<img src="${src}" alt="${v.vehicle_name}" data-has-fallback
           class="vehicle-card-image" />
       <div class="vehicle-card-fallback">
         <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 15h18l-1.5-5.1A2 2 0 0 0 17.6 8H7a2 2 0 0 0-1.9 1.4L3 15Z"/><path d="M4 15v3h2m12 0h2v-3"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>
       </div>`
    : `<div class="vehicle-card-fallback is-visible">
         <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 15h18l-1.5-5.1A2 2 0 0 0 17.6 8H7a2 2 0 0 0-1.9 1.4L3 15Z"/><path d="M4 15v3h2m12 0h2v-3"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>
       </div>`;

  const adminBtns = _isAdmin() ? `
    <div class="vc-actions vehicle-card-actions">
      <button class="btn btn-sm btn-secondary btn-vc-edit line-btn" data-id="${v.vehicle_id}">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 20 4.2-1 10.6-10.6a2 2 0 0 0-2.8-2.8L5.4 16.2 4 20Z"/><path d="m14.5 7.1 2.8 2.8"/></svg>
      </button>
      <button class="btn btn-sm btn-danger btn-vc-delete" data-id="${v.vehicle_id}" data-name="${v.vehicle_name}">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
      </button>
    </div>` : '';

  return `
    <div class="vehicle-card" role="button" tabindex="0" data-inactive="${!v.is_active}"
         data-id="${v.vehicle_id}" aria-label="Xem chi tiết ${v.vehicle_name}">
      ${!v.is_active ? `<div class="vehicle-card-status"><span class="badge badge-danger">Ngừng SD</span></div>` : ''}

      <div class="vehicle-card-media">
        ${img}
        </div>
        <div class="vehicle-card-title-strip" title="${v.vehicle_name}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 15h18l-1.5-5.1A2 2 0 0 0 17.6 8H7a2 2 0 0 0-1.9 1.4L3 15Z"/><path d="M4 15v3h2m12 0h2v-3"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>
          <span>${v.vehicle_name}</span>
        </div>
      <div class="vehicle-card-stats">
        <div class="vehicle-card-stat">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 8 8-4 8 4-8 4-8-4Z"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4"/></svg>
          <div>
            <div class="vehicle-card-stat-value">${v.equipment_count || 0}</div>
            <div class="text-xs text-muted">Trang bị</div>
          </div>
        </div>
        <div class="vehicle-card-stat">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z"/></svg>
          <div>
            <div class="vehicle-card-stat-value">${v.maintenance_count || 0}</div>
            <div class="text-xs text-muted">Hạng mục</div>
          </div>
        </div>
      </div>

      <div class="vehicle-card-detail-link">Nhấn để xem chi tiết <span aria-hidden="true">→</span></div>
      ${adminBtns}
    </div>`;
}

/* ════════════════════════════════════════════════════════════
   ROUTE: vehicle-detail — Chi tiết loại xe + 2 tab PDF
   ════════════════════════════════════════════════════════════ */
async function renderVehicleDetail(container, params) {
  const { id } = params;
  container.innerHTML = `<div style="display:flex;justify-content:center;padding:48px;"><div class="spinner"></div></div>`;

  const [resV, resM, resT] = await Promise.all([
    window.electronAPI.invoke('vehicle:get', { id }),
    window.electronAPI.invoke('engineMaintenance:list', { vehicleId: id }),
    window.electronAPI.invoke('vehicleType:list'),
  ]);

  if (!resV.success) {
    container.innerHTML = `<div class="alert alert-danger">${resV.error}</div>`;
    return;
  }

  const vehicle   = resV.data;
  const items     = resM.success ? resM.data : [];
  const typeItems = resT.success ? resT.data : [];
  let activeTab = 'tech_process';
  let editMode  = false;

  function rebuild() {
    _renderDetailPage(container, vehicle, items, typeItems, activeTab, editMode,
      (newTab) => { activeTab = newTab; rebuild(); },
      (newEdit) => { editMode = newEdit; rebuild(); },
      () => renderVehicleDetail(container, params)
    );
  }
  rebuild();
}

function _renderDetailPage(container, v, items, typeItems, activeTab, editMode, onTabChange, onEditToggle, onRefresh) {
  const src = _imgSrc(v.img_path);
  const img = src
    ? `<img src="${src}" alt="${v.vehicle_name}" data-has-fallback
           class="vehicle-detail-image" />
       <div class="vehicle-detail-image-fallback">
         <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 15h18l-1.5-5.1A2 2 0 0 0 17.6 8H7a2 2 0 0 0-1.9 1.4L3 15Z"/><path d="M4 15v3h2m12 0h2v-3"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>
       </div>`
    : `<div class="vehicle-detail-image-fallback is-visible">
         <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 15h18l-1.5-5.1A2 2 0 0 0 17.6 8H7a2 2 0 0 0-1.9 1.4L3 15Z"/><path d="M4 15v3h2m12 0h2v-3"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>
       </div>`;

  const techCount = items.filter((i) => i.tech_process_file_path).length;
  const normCount = items.filter((i) => i.norm_ktkt_file_path).length;

  container.innerHTML = `
    <div class="breadcrumb" style="margin-bottom:var(--space-4);">
      <span class="breadcrumb-item" id="bc-back" style="cursor:pointer;color:var(--color-primary);">← Danh Sách Trang Bị</span>
      <span class="breadcrumb-sep" style="margin:0 var(--space-2);color:var(--text-muted);">›</span>
      <span class="breadcrumb-item" style="color:var(--text-secondary);">${v.vehicle_name}</span>
    </div>

    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 15h16l-1.4-5.1A2 2 0 0 0 16.7 8H7.3a2 2 0 0 0-1.9 1.4L4 15Z"/><path d="M3 15v3h2m14 0h2v-3"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/></svg><span>${v.vehicle_name}</span></h2>
        ${!v.is_active ? '<div style="margin-top:4px;"><span class="badge badge-danger">Ngừng sử dụng</span></div>' : ''}
      </div>
      <div class="page-header-actions">
        ${_isAdmin() ? `
          <button class="btn btn-secondary btn-sm" id="btn-edit-vehicle"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 20 4.2-1 10.6-10.6a2 2 0 0 0-2.8-2.8L5.4 16.2 4 20Z"/><path d="m14.5 7.1 2.8 2.8"/></svg>Sửa thông tin xe</button>
          <button class="btn btn-sm ${editMode ? 'btn-warning' : 'btn-outline'}" id="btn-toggle-edit">
            ${editMode
              ? '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>Xong chỉnh sửa'
              : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 20 4.2-1 10.6-10.6a2 2 0 0 0-2.8-2.8L5.4 16.2 4 20Z"/><path d="m14.5 7.1 2.8 2.8"/></svg>Chế độ chỉnh sửa'}
          </button>
          <button class="btn btn-primary btn-sm" id="btn-add-item"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Thêm hạng mục</button>
        ` : ''}
      </div>
    </div>

    <div class="vehicle-detail-layout">

      <!-- Cột trái -->
      <div style="display:flex;flex-direction:column;gap:var(--space-4);">
        <div class="card">
          <div class="card-body" style="padding:var(--space-4);">
            ${img}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-top:var(--space-4);">
              <div style="text-align:center;padding:var(--space-2);background:var(--bg-table-header);border-radius:var(--border-radius-sm);">
                <div class="fw-bold" style="font-size:18px;color:var(--color-success-text);">${techCount}/${items.length}</div>
                <div class="text-xs text-muted detail-stat-label"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z"/></svg>Có file QT</div>
              </div>
              <div style="text-align:center;padding:var(--space-2);background:var(--bg-table-header);border-radius:var(--border-radius-sm);">
                <div class="fw-bold" style="font-size:18px;color:var(--color-info-text);">${normCount}/${items.length}</div>
                <div class="text-xs text-muted detail-stat-label"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16v12H4zM8 6v4m4-4v3m4-3v4"/></svg>Có file ĐM</div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header" style="padding:var(--space-3) var(--space-4);">
            <h5 class="card-title" style="font-size:var(--font-size-sm);">Loại hình</h5>
          </div>
          <div class="card-body" style="padding:var(--space-3);">
            <div style="margin-bottom:var(--space-3);">
              <span class="text-xs text-muted">Loại hiện tại: </span>
              <span class="badge ${v.vehicle_type_name ? 'badge-info' : 'badge-neutral'}" style="font-size:11px;">
                ${v.vehicle_type_name || 'Chưa phân loại'}
              </span>
            </div>
            ${_isAdmin() ? `
            <div style="display:flex;gap:var(--space-2);">
              <select class="form-control" id="type-combo" style="flex:1;font-size:var(--font-size-sm);">
                <option value="">-- Chưa phân loại --</option>
                ${typeItems.map((t) => `<option value="${t.vehicle_type_id}" ${t.vehicle_type_id == v.vehicle_type_id ? 'selected' : ''}>${t.vehicle_type_name}</option>`).join('')}
              </select>
              <button class="btn btn-primary btn-sm" id="btn-save-type" style="white-space:nowrap;">Lưu</button>
            </div>
            ` : ''}
          </div>
        </div>

        <div class="card">
          <div class="card-header" style="padding:var(--space-3) var(--space-4);">
            <h5 class="card-title" style="font-size:var(--font-size-sm);">Trang bị sử dụng (${(v.equipments || []).length})</h5>
          </div>
          <div class="card-body" style="padding:var(--space-3);max-height:200px;overflow-y:auto;">
            ${(v.equipments || []).length === 0
              ? `<p class="text-sm text-muted">Chưa có trang bị nào</p>`
              : (v.equipments || []).map((e) => `
                  <div style="display:flex;justify-content:space-between;align-items:center;
                              padding:6px 0;border-bottom:1px solid var(--border-color);">
                    <div>
                      <div class="text-sm fw-medium">${e.equipment_code}</div>
                      <div class="text-xs text-muted">${e.unit_name || '—'}</div>
                    </div>
                    <span class="badge ${e.status === 'active' || e.status === 'san_sang' ? 'badge-success' : 'badge-neutral'}" style="font-size:10px;">
                      ${e.status}
                    </span>
                  </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- Cột phải: 2 tab cố định -->
      <div class="card">
        <div class="card-header" style="padding:0 var(--space-5);border-bottom:none;">
          <div class="tabs" style="margin-bottom:0;border-bottom:1px solid var(--border-color);">
            <button class="tab-btn ${activeTab === 'tech_process' ? 'active' : ''}" id="tab-tech">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z"/></svg>Quy trình công nghệ
              <span class="badge ${activeTab === 'tech_process' ? 'badge-success' : 'badge-neutral'}"
                    style="font-size:9px;padding:1px 5px;margin-left:4px;">${techCount}</span>
            </button>
            <button class="tab-btn ${activeTab === 'norm_ktkt' ? 'active' : ''}" id="tab-norm">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16v12H4zM8 6v4m4-4v3m4-3v4"/></svg>Định mức KT-KT
              <span class="badge ${activeTab === 'norm_ktkt' ? 'badge-info' : 'badge-neutral'}"
                    style="font-size:9px;padding:1px 5px;margin-left:4px;">${normCount}</span>
            </button>
          </div>
        </div>
        <div class="card-body" style="padding:var(--space-4);">
          <div id="maint-list"></div>
        </div>
      </div>
    </div>
  `;

  _wireImgFallbacks(container);

  /* Wire breadcrumb */
  document.getElementById('bc-back').addEventListener('click', () => router.navigate('maintenance-steps'));

  /* Wire tabs */
  document.getElementById('tab-tech').addEventListener('click', () => onTabChange('tech_process'));
  document.getElementById('tab-norm').addEventListener('click', () => onTabChange('norm_ktkt'));

  /* Wire admin buttons */
  if (_isAdmin()) {
    document.getElementById('btn-edit-vehicle').addEventListener('click', () => {
      openVehicleForm(v, onRefresh);
    });
    document.getElementById('btn-toggle-edit').addEventListener('click', () => {
      onEditToggle(!editMode);
    });
    document.getElementById('btn-add-item').addEventListener('click', () => {
      openMaintenanceForm(null, v.vehicle_id, onRefresh);
    });
  }

  /* Wire vehicle type select */
  if (_isAdmin()) {
    document.getElementById('btn-save-type')?.addEventListener('click', async () => {
      const combo = document.getElementById('type-combo');
      const vehicle_type_id = combo?.value ? parseInt(combo.value) : null;
      const res = await window.electronAPI.invoke('vehicle:update', {
        id: v.vehicle_id, data: { vehicle_type_id },
      });
      if (res.success) { toast.success('Đã cập nhật loại hình'); onRefresh(); }
      else toast.error('Lỗi', res.error);
    });
  }

  /* Render maintenance list */
  _renderMaintList(items, activeTab, v.vehicle_id, editMode, onRefresh);
}

function _renderMaintList(items, activeTab, vehicleId, editMode, onRefresh) {
  const el = document.getElementById('maint-list');
  if (!el) return;

  if (!items.length) {
    el.innerHTML = `
      <div class="table-empty" style="padding:var(--space-8);">
        <div class="table-empty-icon"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8 9h8M8 13h8M8 17h5"/></svg></div>
        <div class="table-empty-text">Chưa có hạng mục nào</div>
        <div class="table-empty-sub">${_isAdmin() ? 'Nhấn "+ Thêm hạng mục" để bắt đầu' : 'Liên hệ admin để thêm'}</div>
      </div>`;
    return;
  }

  el.innerHTML = items.map((item, idx) => _buildItemBar(item, idx, items.length, activeTab, editMode)).join('');

  el.querySelectorAll('.maint-bar').forEach((bar) => {
    bar.addEventListener('mouseover', () => {
      bar.style.borderColor = 'var(--color-primary-border)';
      bar.style.background  = 'var(--color-bg-raised)';
    });
    bar.addEventListener('mouseout', () => {
      bar.style.borderColor = 'var(--border-color)';
      bar.style.background  = 'var(--bg-card)';
    });
  });

  /* Wire click trên thanh bar */
  el.querySelectorAll('.maint-bar[data-id]').forEach((bar) => {
    bar.addEventListener('click', async (e) => {
      if (e.target.closest('.bar-actions')) return;
      const id  = parseInt(bar.dataset.id);
      const row = items.find((i) => i.engine_maintenance_id === id);
      await _handleBarClick(row, activeTab, vehicleId, onRefresh);
    });
  });

  if (editMode && _isAdmin()) {
    el.querySelectorAll('.btn-item-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id  = parseInt(btn.dataset.id);
        const row = items.find((i) => i.engine_maintenance_id === id);
        openMaintenanceForm(row, vehicleId, onRefresh);
      });
    });

    el.querySelectorAll('.btn-item-delete').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id  = parseInt(btn.dataset.id);
        const row = items.find((i) => i.engine_maintenance_id === id);
        const confirmed = await modal.confirm({
          title: 'Xóa hạng mục', type: 'danger', confirmText: 'Xóa',
          message: `Xóa hạng mục "${row.maintenance_name}"?`,
          sub: 'File PDF đính kèm (nếu có) cũng sẽ bị xóa.',
        });
        if (!confirmed) return;
        const res = await window.electronAPI.invoke('engineMaintenance:delete', { id });
        if (res.success) { toast.success('Đã xóa hạng mục'); onRefresh(); }
        else toast.error('Lỗi', res.error);
      });
    });

    el.querySelectorAll('.btn-item-up').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        if (idx === 0) return;
        const newOrder = [...items];
        [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
        const res = await window.electronAPI.invoke('engineMaintenance:reorder', {
          vehicleId, orderedIds: newOrder.map((i) => i.engine_maintenance_id),
        });
        if (res.success) onRefresh(); else toast.error('Lỗi', res.error);
      });
    });

    el.querySelectorAll('.btn-item-down').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        if (idx >= items.length - 1) return;
        const newOrder = [...items];
        [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
        const res = await window.electronAPI.invoke('engineMaintenance:reorder', {
          vehicleId, orderedIds: newOrder.map((i) => i.engine_maintenance_id),
        });
        if (res.success) onRefresh(); else toast.error('Lỗi', res.error);
      });
    });
  }
}

function _buildItemBar(item, idx, total, activeTab, editMode) {
  const hasFile = activeTab === 'tech_process'
    ? !!item.tech_process_file_path
    : !!item.norm_ktkt_file_path;

  const fileBadge = hasFile
    ? `<span class="badge badge-success badge-with-icon" style="font-size:10px;"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h4M9 13h6M9 17h6"/></svg>Có file</span>`
    : `<span class="badge badge-warning badge-with-icon" style="font-size:10px;"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg>Chưa có file</span>`;

  const editBtns = (editMode && _isAdmin()) ? `
    <div class="bar-actions" style="display:flex;flex-direction:column;gap:3px;margin-left:var(--space-2);">
      <button class="btn btn-sm btn-secondary btn-item-up" data-idx="${idx}"
        style="padding:2px 6px;font-size:11px;" aria-label="Di chuyển lên" title="Di chuyển lên" ${idx === 0 ? 'disabled' : ''}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 14 6-6 6 6"/></svg></button>
      <button class="btn btn-sm btn-secondary btn-item-down" data-idx="${idx}"
        style="padding:2px 6px;font-size:11px;" aria-label="Di chuyển xuống" title="Di chuyển xuống" ${idx >= total - 1 ? 'disabled' : ''}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 10 6 6 6-6"/></svg></button>
    </div>
    <div class="bar-actions" style="display:flex;flex-direction:column;gap:3px;margin-left:2px;">
      <button class="btn btn-sm btn-secondary btn-item-edit" data-id="${item.engine_maintenance_id}"
        style="padding:2px 8px;font-size:11px;" aria-label="Sửa hạng mục" title="Sửa"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 20 4.2-1 10.6-10.6a2 2 0 0 0-2.8-2.8L5.4 16.2 4 20Z"/><path d="m14.5 7.1 2.8 2.8"/></svg></button>
      <button class="btn btn-sm btn-danger btn-item-delete" data-id="${item.engine_maintenance_id}"
        style="padding:2px 8px;font-size:11px;" aria-label="Xóa hạng mục" title="Xóa"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button>
    </div>` : '';

  return `
    <div class="maint-bar" data-id="${item.engine_maintenance_id}" style="
      display:flex;align-items:center;gap:var(--space-3);
      padding:var(--space-3) var(--space-4);
      background:var(--bg-card);
      border:1px solid var(--border-color);
      border-radius:var(--border-radius-sm);
      cursor:pointer;
      transition:all var(--transition-fast);
      margin-bottom:var(--space-2);">

      <div style="width:28px;height:28px;border-radius:50%;flex-shrink:0;
                  background:var(--color-primary-ring);border:1px solid var(--color-primary-border);
                  display:flex;align-items:center;justify-content:center;
                  font-size:var(--font-size-xs);font-weight:var(--font-weight-bold);
                  color:var(--color-primary);">${item.display_order}</div>

      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap;">
          <span class="fw-medium" style="color:var(--text-heading); text-transform: uppercase;">${item.maintenance_name}</span>
          ${fileBadge}
        </div>
      </div>

      ${editBtns}
    </div>`;
}

async function _handleBarClick(item, activeTab, vehicleId, onRefresh) {
  const hasFile = activeTab === 'tech_process'
    ? !!item.tech_process_file_path
    : !!item.norm_ktkt_file_path;

  const fileName = activeTab === 'tech_process'
    ? item.tech_process_file_name
    : item.norm_ktkt_file_name;

  const tabLabel = activeTab === 'tech_process' ? 'Quy trình công nghệ' : 'Định mức KT-KT';

  if (hasFile) {
    const openExternal = () => window.electronAPI.invoke('engineMaintenance:openFile', {
      id: item.engine_maintenance_id, tab: activeTab,
    });

    if (/\.(docx?|doc)$/i.test(fileName || '')) {
      const openRes = await openExternal();
      if (!openRes.success) toast.error('Lỗi mở file', openRes.error);
      return;
    }

    const res = await window.electronAPI.invoke('engineMaintenance:readFile', {
      id: item.engine_maintenance_id, tab: activeTab,
    });
    if (!res.success) { toast.error('Lỗi đọc file', res.error); return; }

    const onDelete = _isAdmin() ? async () => {
      const confirmed = await modal.confirm({
        title: 'Xóa file PDF', type: 'danger', confirmText: 'Xóa',
        message: `Xóa file "${fileName}" khỏi hạng mục này?`,
      });
      if (!confirmed) return false;

      try {
        const delRes = await window.electronAPI.invoke('engineMaintenance:deleteFile', {
          id: item.engine_maintenance_id, tab: activeTab,
        });
        if (delRes.success) {
          toast.success('Đã xóa file');
          onRefresh();
          return true;
        }
        toast.error('Lỗi', delRes.error);
        return false;
      } catch (error) {
        toast.error('Lỗi', error.message || 'Không thể xóa file');
        return false;
      }
    } : null;

    window.pdfPreview.open({
      title:    item.maintenance_name,
      subtitle: tabLabel,
      base64:   res.data.base64,
      fileName: res.data.file_name,
      onDelete,
      onOpenExternal: openExternal,
    });
  } else {
    if (!_isAdmin()) {
      toast.warning('Không có file', 'Hãy truy cập sau');
      return;
    }
    openUploadForm(item, activeTab, onRefresh);
  }
}

/* ════════════════════════════════════════════════════════════
   FORM: Upload PDF
   ════════════════════════════════════════════════════════════ */
function openUploadForm(item, activeTab, onRefresh) {
  const tabLabel = activeTab === 'tech_process' ? 'Quy trình công nghệ' : 'Định mức KT-KT';

  const content = document.createElement('div');
  content.innerHTML = `
    <p class="text-sm text-muted" style="margin-bottom:var(--space-4);">
      Hạng mục: <strong>${item.maintenance_name}</strong><br/>
      Tab: <strong>${tabLabel}</strong>
    </p>

    <div id="drop-zone" style="
      border:2px dashed var(--border-color-dark);border-radius:var(--border-radius);
      padding:var(--space-8);text-align:center;cursor:pointer;
      transition:all var(--transition-base);background:var(--bg-table-header);">
      <div class="upload-file-icon"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h4M12 17V10m0 0-3 3m3-3 3 3"/></svg></div>
      <div class="text-sm fw-medium" style="color:var(--text-secondary);">Kéo-thả file PDF vào đây</div>
      <div class="text-xs text-muted" style="margin-top:var(--space-1);">hoặc nhấn để chọn file (tối đa 25MB)</div>
      <input type="file" id="pdf-file-input" accept="application/pdf" style="display:none;" />
    </div>
    <div id="file-info" style="display:none;margin-top:var(--space-3);padding:var(--space-3);
      background:var(--color-success-bg);border:1px solid rgba(60,184,106,0.3);
      border-radius:var(--border-radius-sm);">
      <div class="text-sm fw-medium" style="color:var(--color-success-text);" id="file-name-display"></div>
      <div class="text-xs text-muted" id="file-size-display"></div>
    </div>
    <div id="upload-error" class="alert alert-danger" style="display:none;margin-top:var(--space-3);"></div>
  `;

  let selectedFile = null;

  const dropZone  = content.querySelector('#drop-zone');
  const fileInput = content.querySelector('#pdf-file-input');
  const fileInfo  = content.querySelector('#file-info');
  const errEl     = content.querySelector('#upload-error');

  function _setFile(file) {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      errEl.textContent = 'Chỉ chấp nhận file PDF';
      errEl.style.display = '';
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      errEl.textContent = 'File vượt quá 25MB';
      errEl.style.display = '';
      return;
    }
    errEl.style.display = 'none';
    selectedFile = file;
    content.querySelector('#file-name-display').textContent = file.name;
    content.querySelector('#file-size-display').textContent = (file.size / 1024).toFixed(1) + ' KB';
    fileInfo.style.display = '';
    dropZone.style.borderColor = 'var(--color-success)';
    dropZone.style.background  = 'var(--color-success-bg)';
  }

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => _setFile(e.target.files[0]));
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--color-primary)'; });
  dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--border-color-dark)'; });
  dropZone.addEventListener('drop', (e) => { e.preventDefault(); _setFile(e.dataTransfer.files[0]); });

  modal.open({
    title:   `Upload PDF — ${item.maintenance_name}`,
    content,
    size:    'lg',
    buttons: [
      { label: 'Hủy', class: 'btn-secondary', action: (c) => c() },
      {
        label: 'Upload', class: 'btn-primary',
        loadingText: 'Đang tải lên…',
        action: async (close) => {
          if (!selectedFile) {
            errEl.textContent = 'Vui lòng chọn file PDF';
            errEl.style.display = '';
            return;
          }

          errEl.style.display = 'none';
          try {
            const arrayBuffer = await selectedFile.arrayBuffer();
            const res = await window.electronAPI.invoke('engineMaintenance:uploadFile', {
              id:       item.engine_maintenance_id,
              tab:      activeTab,
              fileData: { file_name: selectedFile.name, file_buffer: Array.from(new Uint8Array(arrayBuffer)) },
            });
            if (res.success) {
              toast.success('Upload thành công');
              close();
              onRefresh();
              return;
            }
            errEl.textContent = res.error || 'Upload không thành công';
            errEl.style.display = '';
          } catch (error) {
            errEl.textContent = error.message || 'Không thể upload file';
            errEl.style.display = '';
          }
        },
      },
    ],
  });
}

/* ════════════════════════════════════════════════════════════
   FORM: Thêm/Sửa loại xe
   ════════════════════════════════════════════════════════════ */
function openVehicleForm(v, onSave) {
  const isEdit = !!v;
  let selectedImgFile = null;
  let removeImg = false;

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label required">Tên loại xe</label>
        <input type="text" class="form-control" id="vf-name"
          value="${v?.vehicle_name || ''}" placeholder="VD: Xe ô tô ZIL-131" />
      </div>
      ${isEdit ? `
      <div class="form-group">
        <label class="form-label">Trạng thái</label>
        <select class="form-control" id="vf-active">
          <option value="true"  ${v.is_active  ? 'selected' : ''}>Đang sử dụng</option>
          <option value="false" ${!v.is_active ? 'selected' : ''}>Ngừng sử dụng</option>
        </select>
      </div>` : '<div></div>'}
    </div>
    <div class="form-group">
      <label class="form-label">Hình ảnh xe</label>
      <div style="display:flex;gap:var(--space-3);align-items:flex-start;">
        <div id="img-preview" style="
          width:140px;height:100px;flex-shrink:0;
          border:2px dashed var(--border-color-dark);border-radius:var(--border-radius-sm);
          display:flex;align-items:center;justify-content:center;
          background:var(--bg-table-header);overflow:hidden;cursor:pointer;">
          ${v?.img_path
            ? `<img src="${_imgSrc(v.img_path)}" data-image-preview style="width:100%;height:100%;object-fit:cover;" />`
            : `<span class="image-placeholder"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m4 17 5-4 3 3 3-2 5 4"/></svg></span>`}
        </div>
        <div style="flex:1;">
          <input type="file" id="vf-img-file" accept="image/*" style="display:none;" />
          <button class="btn btn-secondary btn-sm" id="btn-pick-img" style="margin-bottom:6px;"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v11H3z"/></svg>Chọn ảnh</button>
          ${v?.img_path ? `<button class="btn btn-sm btn-danger" id="btn-clear-img" style="margin-left:6px;">✕ Xóa ảnh</button>` : ''}
          <p class="text-xs text-muted" style="margin-top:4px;" id="img-hint">Chọn ảnh từ máy (JPG/PNG)</p>
        </div>
      </div>
    </div>
  `;

  const fileInput = content.querySelector('#vf-img-file');
  const preview   = content.querySelector('#img-preview');

  function _updatePreview(src) {
    preview.innerHTML = src
      ? `<img src="${src}" style="width:100%;height:100%;object-fit:cover;" />`
      : `<span class="image-placeholder"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m4 17 5-4 3 3 3-2 5 4"/></svg></span>`;
  }

  content.querySelector('[data-image-preview]')?.addEventListener('error', () => _updatePreview(null), { once: true });

  content.querySelector('#btn-pick-img').addEventListener('click', () => fileInput.click());
  preview.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    selectedImgFile = file;
    removeImg = false;
    const reader = new FileReader();
    reader.onload = (ev) => {
      _updatePreview(ev.target.result);
      content.querySelector('#img-hint').textContent = file.name;
    };
    reader.readAsDataURL(file);
  });
  content.querySelector('#btn-clear-img')?.addEventListener('click', () => {
    selectedImgFile = null;
    removeImg = true;
    _updatePreview(null);
    content.querySelector('#img-hint').textContent = 'Ảnh hiện tại sẽ bị xóa khi lưu';
  });

  modal.open({
    title: isEdit ? `Sửa: ${v.vehicle_name}` : 'Thêm xe mới',
    content,
    size: 'lg',
    buttons: [
      { label: 'Hủy', class: 'btn-secondary', action: (c) => c() },
      {
        label: isEdit ? 'Cập nhật' : 'Tạo mới',
        class: 'btn-primary',
        action: async (close) => {
          const data = {
            vehicle_name: content.querySelector('#vf-name').value.trim(),
          };
          if (!data.vehicle_name) { toast.warning('Thiếu thông tin', 'Vui lòng nhập tên xe'); return; }
          if (isEdit) data.is_active = content.querySelector('#vf-active').value === 'true';
          if (removeImg) data.remove_img = true;
          if (selectedImgFile) {
            const ab = await selectedImgFile.arrayBuffer();
            data.img_name   = selectedImgFile.name;
            data.img_buffer = Array.from(new Uint8Array(ab));
          }

          let res;
          if (isEdit) {
            res = await window.electronAPI.invoke('vehicle:update', { id: v.vehicle_id, data });
          } else {
            res = await window.electronAPI.invoke('vehicle:create', data);
          }

          if (res.success) {
            toast.success(isEdit ? 'Cập nhật thành công' : 'Tạo loại xe thành công');
            close();
            if (onSave) onSave(); else {
              if (!isEdit) {
                const sortSelect = document.getElementById('v-sort');
                if (sortSelect) sortSelect.value = 'newest';
              }
              _loadVehicleGrid();
            }
          } else {
            toast.error('Lỗi', res.error);
          }
        },
      },
    ],
  });
}

/* ════════════════════════════════════════════════════════════
   FORM: Thêm/Sửa hạng mục bảo dưỡng
   ════════════════════════════════════════════════════════════ */
function openMaintenanceForm(item, vehicleId, onSave) {
  const isEdit = !!item;

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label required">Tên hạng mục</label>
      <input type="text" class="form-control" id="mf-name"
        value="${item?.maintenance_name || ''}" placeholder="VD: Bảo dưỡng động cơ" />
    </div>
  `;

  modal.open({
    title: isEdit ? `Sửa: ${item.maintenance_name}` : 'Thêm hạng mục bảo dưỡng',
    content,
    size: 'sm',
    buttons: [
      { label: 'Hủy', class: 'btn-secondary', action: (c) => c() },
      {
        label: isEdit ? 'Cập nhật' : 'Thêm',
        class: 'btn-primary',
        action: async (close) => {
          const name = content.querySelector('#mf-name').value.trim();
          if (!name) { toast.warning('Thiếu thông tin', 'Vui lòng nhập tên hạng mục'); return; }

          let res;
          if (isEdit) {
            res = await window.electronAPI.invoke('engineMaintenance:update', {
              id: item.engine_maintenance_id, data: { maintenance_name: name },
            });
          } else {
            res = await window.electronAPI.invoke('engineMaintenance:create', {
              vehicle_id: vehicleId, maintenance_name: name,
            });
          }

          if (res.success) {
            toast.success(isEdit ? 'Cập nhật thành công' : 'Thêm hạng mục thành công');
            close();
            if (onSave) onSave();
          } else {
            toast.error('Lỗi', res.error);
          }
        },
      },
    ],
  });
}

/* ════════════════════════════════════════════════════════════
   MODAL: Quản lý danh sách loại hình (mở từ filter-bar ngoài grid)
   ════════════════════════════════════════════════════════════ */
async function openVehicleTypeManager() {
  const wrap = document.createElement('div');

  async function _refresh() {
    const res = await window.electronAPI.invoke('vehicleType:list');
    const types = res.success ? res.data : [];
    _renderList(types);
  }

  function _renderList(types) {
    wrap.innerHTML = `
      <div style="max-height:300px;overflow-y:auto;margin-bottom:var(--space-4);">
        ${types.length === 0
          ? `<p class="text-sm text-muted" style="padding:var(--space-3) 0;">Chưa có loại hình nào</p>`
          : types.map((t) => `
            <div style="display:flex;justify-content:space-between;align-items:center;
                        padding:8px 0;border-bottom:1px solid var(--border-color);">
              <span class="text-sm">${t.vehicle_type_name}</span>
              <div style="display:flex;gap:4px;">
                <button class="btn btn-sm btn-secondary btn-tm-edit"
                  data-id="${t.vehicle_type_id}" data-name="${t.vehicle_type_name}"
                  style="padding:2px 8px;font-size:11px;"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 20 4.2-1 10.6-10.6a2 2 0 0 0-2.8-2.8L5.4 16.2 4 20Z"/><path d="m14.5 7.1 2.8 2.8"/></svg>Sửa</button>
                <button class="btn btn-sm btn-danger btn-tm-delete"
                  data-id="${t.vehicle_type_id}" data-name="${t.vehicle_type_name}"
                  style="padding:2px 8px;font-size:11px;"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>Xóa</button>
              </div>
            </div>`).join('')}
      </div>
      <div style="border-top:1px solid var(--border-color);padding-top:var(--space-3);">
        <div class="text-xs text-muted" style="margin-bottom:var(--space-2);">Thêm loại hình mới:</div>
        <div style="display:flex;gap:var(--space-2);">
          <input type="text" class="form-control" id="tm-new-name"
            placeholder="VD: Xe tải hạng nặng" style="flex:1;" />
          <button class="btn btn-primary btn-sm" id="tm-btn-add" style="white-space:nowrap;">+ Thêm</button>
        </div>
      </div>
    `;

    wrap.querySelectorAll('.btn-tm-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        openVehicleTypeForm(
          { vehicle_type_id: parseInt(btn.dataset.id), vehicle_type_name: btn.dataset.name },
          _refresh
        );
      });
    });

    wrap.querySelectorAll('.btn-tm-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const confirmed = await modal.confirm({
          title: 'Xóa loại hình', type: 'danger', confirmText: 'Xóa',
          message: `Xóa loại hình "${btn.dataset.name}"?`,
          sub: 'Các xe đang dùng loại hình này sẽ được đặt về "Chưa phân loại".',
        });
        if (!confirmed) return;
        const res = await window.electronAPI.invoke('vehicleType:delete', { id: parseInt(btn.dataset.id) });
        if (res.success) { toast.success('Đã xóa loại hình'); _refresh(); }
        else toast.error('Lỗi', res.error);
      });
    });

    wrap.querySelector('#tm-btn-add').addEventListener('click', async () => {
      const input = wrap.querySelector('#tm-new-name');
      const name  = input.value.trim();
      if (!name) { toast.warning('Thiếu thông tin', 'Nhập tên loại hình'); return; }
      const res = await window.electronAPI.invoke('vehicleType:create', { vehicle_type_name: name });
      if (res.success) { toast.success('Thêm thành công'); input.value = ''; _refresh(); }
      else toast.error('Lỗi', res.error);
    });
  }

  await _refresh();

  modal.open({
    title: 'Quản lý loại hình trang bị',
    content: wrap,
    size: 'md',
    buttons: [{ label: 'Đóng', class: 'btn-secondary', action: (c) => c() }],
  });
}

/* ════════════════════════════════════════════════════════════
   FORM: Thêm/Sửa loại hình trang bị
   ════════════════════════════════════════════════════════════ */
function openVehicleTypeForm(item, onSave) {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label required">Tên loại hình</label>
      <input type="text" class="form-control" id="vtf-name"
        value="${item?.vehicle_type_name || ''}" placeholder="VD: Xe tải hạng nặng" />
    </div>
  `;

  modal.open({
    title: `Sửa: ${item.vehicle_type_name}`,
    content,
    size: 'sm',
    buttons: [
      { label: 'Hủy', class: 'btn-secondary', action: (c) => c() },
      {
        label: 'Cập nhật',
        class: 'btn-primary',
        action: async (close) => {
          const name = content.querySelector('#vtf-name').value.trim();
          if (!name) { toast.warning('Thiếu thông tin', 'Vui lòng nhập tên loại hình'); return; }
          const res = await window.electronAPI.invoke('vehicleType:update', {
            id: item.vehicle_type_id, data: { vehicle_type_name: name },
          });
          if (res.success) {
            toast.success('Cập nhật thành công');
            close();
            if (onSave) onSave();
          } else {
            toast.error('Lỗi', res.error);
          }
        },
      },
    ],
  });
}

/* ── Đăng ký route (chỉ 1 lần, không đăng ký trùng) ── */
router.register('maintenance-steps', {
  title:  'DANH SÁCH TRANG BỊ',
  render: (container) => renderMaintenanceSteps(container),
});

router.register('vehicle-detail', {
  title:  'Chi Tiết Loại Xe',
  render: (container, params) => renderVehicleDetail(container, params),
});
