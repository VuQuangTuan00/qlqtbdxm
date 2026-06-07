/* ============================================================
   Quy Trình Công Nghệ — Vehicle Types + Maintenance Steps
   ============================================================ */
'use strict';
console.log("maintenance-steps loaded");
/* ── Hằng số ── */
const MAINT_TYPES = {
  dinh_ky:  { label: 'Bảo dưỡng định kỳ',  icon: '🔧', badge: 'badge-info'    },
  dot_xuat: { label: 'Bảo dưỡng đột xuất', icon: '⚡', badge: 'badge-warning' },
  sua_chua: { label: 'Sửa chữa',            icon: '🔩', badge: 'badge-danger'  },
  kiem_tra: { label: 'Kiểm tra',            icon: '🔍', badge: 'badge-neutral' },
};

/* ════════════════════════════════════════════════════════════
   RENDER TRANG DANH SÁCH (Grid ảnh xe)
   ════════════════════════════════════════════════════════════ */
async function renderMaintenanceSteps(container) {
  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">Quy Trình Công Nghệ</h2>
        <p class="page-subtitle">Danh sách loại xe và quy trình bảo dưỡng từng chủng loại</p>
      </div>
      <div class="page-header-actions">
        ${_isAdmin() ? `<button class="btn btn-primary" id="btn-add-vehicle-type">+ Thêm loại xe</button>` : ''}
      </div>
    </div>

    <!-- Search bar -->
    <div class="filter-bar" style="margin-bottom:var(--space-5);">
      <input type="text" class="form-control search-input" id="vt-search"
        placeholder="🔍 Tìm theo tên, mã, hãng sản xuất..." />
      <label style="display:flex;align-items:center;gap:6px;font-size:var(--font-size-sm);color:var(--text-secondary);">
        <input type="checkbox" id="vt-show-inactive" />
        Hiện xe ngừng sử dụng
      </label>
    </div>

    <!-- Grid -->
    <div id="vehicle-grid" style="
      display:grid;
      grid-template-columns:repeat(auto-fill,minmax(260px,1fr));
      gap:var(--space-5);
    ">
      <div style="grid-column:1/-1;text-align:center;padding:48px;">
        <div class="spinner"></div>
      </div>
    </div>
  `;

  await _loadVehicleGrid();

  // Search
  let timer;
  document.getElementById('vt-search').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => _loadVehicleGrid(), 400);
  });
  document.getElementById('vt-show-inactive').addEventListener('change', () => _loadVehicleGrid());

  if (_isAdmin()) {
    document.getElementById('btn-add-vehicle-type').addEventListener('click', () => openVehicleTypeForm(null));
  }
}

async function _loadVehicleGrid() {
  const grid = document.getElementById('vehicle-grid');
  if (!grid) return;

  const search = document.getElementById('vt-search')?.value || '';
  const showInactive = document.getElementById('vt-show-inactive')?.checked;

  grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;"><div class="spinner"></div></div>`;

  const opts = { search };
  if (!showInactive) opts.isActive = true;

  const res = await window.electronAPI.invoke('vehicleType:list', opts);
  if (!res.success) {
    grid.innerHTML = `<div style="grid-column:1/-1;" class="alert alert-danger">${res.error}</div>`;
    return;
  }

  const list = res.data;
  if (!list.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;" class="table-empty">
        <div class="table-empty-icon">🚗</div>
        <div class="table-empty-text">Chưa có loại xe nào</div>
        <div class="table-empty-sub">${_isAdmin() ? 'Nhấn "+ Thêm loại xe" để bắt đầu' : 'Liên hệ admin để thêm dữ liệu'}</div>
      </div>`;
    return;
  }

  grid.innerHTML = list.map((vt) => _renderVehicleCard(vt)).join('');

  // Wire click
  grid.querySelectorAll('.vehicle-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      // Không kích hoạt khi click action buttons
      if (e.target.closest('.vc-actions')) return;
      const id = parseInt(card.dataset.id);
      renderVehicleDetail(document.getElementById('page-view'), { id });
    });
  });

  // Admin actions
  if (_isAdmin()) {
    grid.querySelectorAll('.btn-vc-edit').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        const res = await window.electronAPI.invoke('vehicleType:get', { id });
        if (res.success) openVehicleTypeForm(res.data);
        else toast.error('Lỗi', res.error);
      });
    });
    grid.querySelectorAll('.btn-vc-delete').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        const name = btn.dataset.name;
        const ok = await modal.confirm({
          title: 'Xóa loại xe',
          message: `Xóa loại xe "${name}"?`,
          sub: 'Toàn bộ quy trình bảo dưỡng của loại xe này sẽ bị xóa.',
          type: 'danger', confirmText: 'Xóa',
        });
        if (!ok) return;
        const res = await window.electronAPI.invoke('vehicleType:delete', { id });
        if (res.success) { toast.success('Đã xóa loại xe'); _loadVehicleGrid(); }
        else toast.error('Lỗi', res.error);
      });
    });
  }
}

function _renderVehicleCard(vt) {
  const img = vt.image_url
    ? `<img src="${vt.image_url}" alt="${vt.type_name}"
          style="width:100%;height:160px;object-fit:cover;border-radius:var(--border-radius-sm);" />`
    : `<div style="width:100%;height:160px;display:flex;align-items:center;justify-content:center;
            background:linear-gradient(135deg,var(--color-bg-elevated),var(--color-bg-highlight));
            border-radius:var(--border-radius-sm);font-size:64px;">🚗</div>`;

  const stepBadges = Object.entries(MAINT_TYPES).map(([k, v]) => `
    <span class="badge ${v.badge}" style="font-size:10px;">${v.icon} ${vt[`steps_${k}`] || ''}</span>
  `).join('');

  const inactive = !vt.is_active
    ? `<div style="position:absolute;top:8px;right:8px;">
         <span class="badge badge-danger">Ngừng SD</span>
       </div>` : '';

  const adminBtns = _isAdmin() ? `
    <div class="vc-actions" style="display:flex;gap:6px;margin-top:var(--space-3);">
      <button class="btn btn-sm btn-secondary btn-vc-edit" data-id="${vt.id}"
        style="flex:1;">✏️ Sửa</button>
      <button class="btn btn-sm btn-danger btn-vc-delete" data-id="${vt.id}" data-name="${vt.type_name}"
        style="flex:1;">🗑️ Xóa</button>
    </div>` : '';

  return `
    <div class="vehicle-card" data-id="${vt.id}" style="
      background:var(--bg-card);
      border:1px solid var(--border-color);
      border-radius:var(--border-radius-lg);
      padding:var(--space-4);
      cursor:pointer;
      transition:all var(--transition-base);
      box-shadow:var(--shadow-sm);
      position:relative;
      ${!vt.is_active ? 'opacity:0.65;' : ''}
    "
    onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='var(--shadow-md)';this.style.borderColor='var(--color-gold-border)'"
    onmouseout="this.style.transform='';this.style.boxShadow='var(--shadow-sm)';this.style.borderColor='var(--border-color)'">
      ${inactive}

      <!-- Ảnh -->
      <div style="margin-bottom:var(--space-3);">${img}</div>

      <!-- Tên + mã -->
      <div style="margin-bottom:var(--space-2);">
        <div class="fw-semibold" style="font-size:var(--font-size-md);color:var(--text-heading);
             line-height:1.3;margin-bottom:3px;">${vt.type_name}</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="badge badge-gold" style="font-size:10px;">${vt.type_code}</span>
          ${vt.manufacturer ? `<span class="text-xs text-muted">${vt.manufacturer} · ${vt.origin_country || ''}</span>` : ''}
        </div>
      </div>

      <!-- Thống kê -->
      <div style="display:flex;gap:var(--space-3);margin-bottom:var(--space-2);
                  padding:var(--space-2) 0;border-top:1px solid var(--border-color);
                  border-bottom:1px solid var(--border-color);">
        <div style="flex:1;text-align:center;">
          <div class="fw-bold" style="font-size:20px;color:var(--color-gold);">${vt.equipment_count || 0}</div>
          <div class="text-xs text-muted">Trang bị</div>
        </div>
        <div style="flex:1;text-align:center;">
          <div class="fw-bold" style="font-size:20px;color:var(--color-info-text);">${vt.step_count || 0}</div>
          <div class="text-xs text-muted">Bước QT</div>
        </div>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin:var(--space-2) 0;
                  font-size:var(--font-size-xs);color:var(--text-secondary);">
        Nhấn để xem quy trình chi tiết →
      </div>

      ${adminBtns}
    </div>`;
}

/* ════════════════════════════════════════════════════════════
   RENDER TRANG CHI TIẾT LOẠI XE
   ════════════════════════════════════════════════════════════ */
async function renderVehicleDetail(container, params) {
  const { id } = params;
  container.innerHTML = `<div style="display:flex;justify-content:center;padding:48px;">
    <div class="spinner"></div></div>`;

  const res = await window.electronAPI.invoke('vehicleType:get', { id });
  if (!res.success) {
    container.innerHTML = `<div class="alert alert-danger">${res.error}</div>`;
    return;
  }

  const vt = res.data;
  let activeMaintType = 'dinh_ky';

  function _rebuild() {
    _renderDetailPage(container, vt, activeMaintType, (newType) => {
      activeMaintType = newType;
      _rebuild();
    });
  }
  _rebuild();
}

async function _renderDetailPage(container, vt, activeMaintType, onTabChange) {
  // Tải steps cho loại đang xem
  const stepsRes = await window.electronAPI.invoke('vehicleStep:list', { vehicleTypeId: vt.id });
  const allSteps = stepsRes.success ? stepsRes.data : [];

  const img = vt.image_url
    ? `<img src="${vt.image_url}" alt="${vt.type_name}"
            style="width:100%;height:220px;object-fit:cover;border-radius:var(--border-radius);" />`
    : `<div style="width:100%;height:220px;display:flex;align-items:center;justify-content:center;
               background:linear-gradient(135deg,var(--color-bg-elevated),var(--color-bg-highlight));
               border-radius:var(--border-radius);font-size:80px;">🚗</div>`;

  const stepsByType = {};
  Object.keys(MAINT_TYPES).forEach((t) => {
    stepsByType[t] = allSteps.filter((s) => s.maintenance_type === t);
  });

  container.innerHTML = `
    <!-- Breadcrumb -->
    <div class="breadcrumb">
      <span class="breadcrumb-item" id="bc-vt-back">Quy Trình Công Nghệ</span>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-item active">${vt.type_name}</span>
    </div>

    <!-- Header -->
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">${vt.type_name}</h2>
        <div style="display:flex;gap:8px;align-items:center;margin-top:4px;">
          <span class="badge badge-gold">${vt.type_code}</span>
          ${vt.manufacturer ? `<span class="text-sm text-muted">${vt.manufacturer} · ${vt.origin_country || ''}</span>` : ''}
          ${!vt.is_active ? '<span class="badge badge-danger">Ngừng sử dụng</span>' : ''}
        </div>
      </div>
      <div class="page-header-actions">
        ${_isAdmin() ? `
          <button class="btn btn-secondary" id="btn-edit-vt">✏️ Sửa thông tin</button>
          <button class="btn btn-primary" id="btn-add-step">+ Thêm bước</button>
        ` : ''}
      </div>
    </div>

    <!-- Layout 2 cột -->
    <div style="display:grid;grid-template-columns:300px 1fr;gap:var(--space-5);align-items:start;">

      <!-- Cột trái: Thông tin xe + trang bị -->
      <div style="display:flex;flex-direction:column;gap:var(--space-4);">
        <div class="card">
          <div class="card-body" style="padding:var(--space-4);">
            ${img}
            <div style="margin-top:var(--space-4);">
              ${vt.description ? `<p class="text-sm" style="color:var(--text-secondary);margin-bottom:var(--space-3);">${vt.description}</p>` : ''}
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
                ${Object.entries(MAINT_TYPES).map(([k, v]) => `
                  <div style="text-align:center;padding:var(--space-2);background:var(--bg-table-header);border-radius:var(--border-radius-sm);">
                    <div class="fw-bold" style="font-size:20px;color:var(--color-gold);">${stepsByType[k].length}</div>
                    <div class="text-xs text-muted">${v.icon} ${v.label.replace('Bảo dưỡng ','')}</div>
                  </div>`).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- Trang bị đang dùng loại xe này -->
        <div class="card">
          <div class="card-header" style="padding:var(--space-3) var(--space-4);">
            <h5 class="card-title" style="font-size:var(--font-size-sm);">
              Trang bị sử dụng (${(vt.equipments || []).length})
            </h5>
          </div>
          <div class="card-body" style="padding:var(--space-3);max-height:220px;overflow-y:auto;">
            ${(vt.equipments || []).length === 0
              ? `<p class="text-sm text-muted">Chưa có trang bị nào</p>`
              : (vt.equipments || []).map((e) => `
                  <div style="display:flex;justify-content:space-between;align-items:center;
                              padding:6px 0;border-bottom:1px solid var(--border-color);">
                    <div>
                      <div class="text-sm fw-medium">${e.equipment_code}</div>
                      <div class="text-xs text-muted">${e.unit_name || '—'}</div>
                    </div>
                    <span class="badge ${e.status === 'active' ? 'badge-success' : 'badge-neutral'}" style="font-size:10px;">
                      ${e.status === 'active' ? 'HĐ' : e.status}
                    </span>
                  </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- Cột phải: Tabs quy trình -->
      <div class="card">
        <div class="card-header" style="padding:0 var(--space-5);border-bottom:none;">
          <div class="tabs" style="margin-bottom:0;border-bottom:1px solid var(--border-color);">
            ${Object.entries(MAINT_TYPES).map(([k, v]) => `
              <button class="tab-btn ${k === activeMaintType ? 'active' : ''}"
                data-mtype="${k}"
                style="display:flex;align-items:center;gap:5px;">
                ${v.icon}
                <span>${v.label}</span>
                <span class="badge ${v.badge}" style="font-size:9px;padding:1px 5px;">${stepsByType[k].length}</span>
              </button>`).join('')}
          </div>
        </div>
        <div class="card-body" style="padding:var(--space-4);">
          <div id="steps-content"></div>
        </div>
      </div>
    </div>
  `;

  // Breadcrumb back
  document.getElementById('bc-vt-back').addEventListener('click', () => {
    router.navigate('maintenance-steps');
  });

  // Tab switching
  container.querySelectorAll('.tab-btn[data-mtype]').forEach((btn) => {
    btn.addEventListener('click', () => onTabChange(btn.dataset.mtype));
  });

  // Render steps
  _renderStepsContent(stepsByType[activeMaintType], vt, activeMaintType, container);

  // Admin actions
  if (_isAdmin()) {
    document.getElementById('btn-edit-vt')?.addEventListener('click', async () => {
      openVehicleTypeForm(vt, async () => {
        const r = await window.electronAPI.invoke('vehicleType:get', { id: vt.id });
        if (r.success) renderVehicleDetail(container, { id: vt.id });
      });
    });
    document.getElementById('btn-add-step')?.addEventListener('click', () => {
      openStepForm(null, vt.id, activeMaintType, () => renderVehicleDetail(container, { id: vt.id }));
    });
  }
}

function _renderStepsContent(steps, vt, maintType, container) {
  const el = document.getElementById('steps-content');
  if (!el) return;

  if (!steps.length) {
    el.innerHTML = `
      <div class="table-empty" style="padding:var(--space-8);">
        <div class="table-empty-icon">📋</div>
        <div class="table-empty-text">Chưa có quy trình cho loại này</div>
        <div class="table-empty-sub">
          ${_isAdmin() ? 'Nhấn "+ Thêm bước" để xây dựng quy trình bảo dưỡng.' : 'Liên hệ admin để thêm quy trình.'}
        </div>
      </div>`;
    return;
  }

  const totalTime = steps.reduce((s, st) => s + (st.estimated_time || 0), 0);

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-4);">
      <div class="text-sm text-muted">
        ${steps.length} bước · ⏱ Tổng ~${_fmtTime(totalTime)}
      </div>
      ${_isAdmin() ? `
        <div style="display:flex;gap:var(--space-2);">
          <button class="btn btn-sm btn-secondary" id="btn-toggle-edit-mode">
            ✏️ Chế độ chỉnh sửa
          </button>
        </div>` : ''}
    </div>
    <div class="steps-list" id="steps-list-inner" style="display:flex;flex-direction:column;gap:var(--space-2);"></div>
  `;

  let editMode = false;
  const listEl = document.getElementById('steps-list-inner');

  function renderList() {
    listEl.innerHTML = steps.map((step, idx) => _buildStepItem(step, idx, steps.length, editMode)).join('');

    // Wire step actions
    listEl.querySelectorAll('.btn-step-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const step = steps.find((s) => s.id === id);
        openStepForm(step, vt.id, maintType, () => renderVehicleDetail(container, { id: vt.id }));
      });
    });
    listEl.querySelectorAll('.btn-step-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        const step = steps.find((s) => s.id === id);
        const ok = await modal.confirm({
          title: 'Xóa bước', type: 'danger', confirmText: 'Xóa',
          message: `Xóa bước "${step.step_name}"?`,
        });
        if (!ok) return;
        const res = await window.electronAPI.invoke('vehicleStep:delete', { id });
        if (res.success) { toast.success('Đã xóa bước'); renderVehicleDetail(container, { id: vt.id }); }
        else toast.error('Lỗi', res.error);
      });
    });
    listEl.querySelectorAll('.btn-step-up').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx);
        if (idx === 0) return;
        const newOrder = [...steps];
        [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
        const orderedIds = newOrder.map((s) => s.id);
        const res = await window.electronAPI.invoke('vehicleStep:reorder', { vehicleTypeId: vt.id, maintenanceType: maintType, orderedIds });
        if (res.success) renderVehicleDetail(container, { id: vt.id });
        else toast.error('Lỗi', res.error);
      });
    });
    listEl.querySelectorAll('.btn-step-down').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx);
        if (idx >= steps.length - 1) return;
        const newOrder = [...steps];
        [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
        const orderedIds = newOrder.map((s) => s.id);
        const res = await window.electronAPI.invoke('vehicleStep:reorder', { vehicleTypeId: vt.id, maintenanceType: maintType, orderedIds });
        if (res.success) renderVehicleDetail(container, { id: vt.id });
        else toast.error('Lỗi', res.error);
      });
    });
  }

  renderList();

  if (_isAdmin()) {
    document.getElementById('btn-toggle-edit-mode')?.addEventListener('click', function () {
      editMode = !editMode;
      this.textContent = editMode ? '✓ Xong chỉnh sửa' : '✏️ Chế độ chỉnh sửa';
      this.className = `btn btn-sm ${editMode ? 'btn-warning' : 'btn-secondary'}`;
      renderList();
    });
  }
}

function _buildStepItem(step, idx, total, editMode) {
  const editBtns = (editMode && _isAdmin()) ? `
    <div style="display:flex;flex-direction:column;gap:3px;margin-left:var(--space-2);">
      <button class="btn btn-sm btn-secondary btn-step-up" data-idx="${idx}"
        style="padding:2px 6px;font-size:11px;" ${idx === 0 ? 'disabled' : ''}>▲</button>
      <button class="btn btn-sm btn-secondary btn-step-down" data-idx="${idx}"
        style="padding:2px 6px;font-size:11px;" ${idx >= total - 1 ? 'disabled' : ''}>▼</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:3px;margin-left:2px;">
      <button class="btn btn-sm btn-secondary btn-step-edit" data-id="${step.id}"
        style="padding:2px 8px;font-size:11px;">✏️</button>
      <button class="btn btn-sm btn-danger btn-step-delete" data-id="${step.id}"
        style="padding:2px 8px;font-size:11px;">🗑️</button>
    </div>` : '';

  const extras = [];
  if (step.tools_required) extras.push(`🔧 ${step.tools_required}`);
  if (step.safety_notes)   extras.push(`⚠️ ${step.safety_notes}`);
  if (step.created_by_name && editMode) extras.push(`👤 ${step.created_by_name}`);

  return `
    <div style="display:flex;align-items:flex-start;gap:var(--space-3);
                padding:var(--space-3) var(--space-4);
                background:var(--bg-card);
                border:1px solid ${editMode ? 'var(--color-gold-border)' : 'var(--border-color)'};
                border-radius:var(--border-radius-sm);
                transition:border-color var(--transition-fast);"
         onmouseover="this.style.borderColor='var(--color-gold-border)'"
         onmouseout="this.style.borderColor='${editMode ? 'var(--color-gold-border)' : 'var(--border-color)'}'">

      <!-- Số thứ tự -->
      <div style="width:32px;height:32px;border-radius:50%;flex-shrink:0;
                  background:var(--color-gold-glow);border:2px solid var(--color-gold-border);
                  display:flex;align-items:center;justify-content:center;
                  font-size:var(--font-size-sm);font-weight:var(--font-weight-bold);
                  color:var(--color-gold);">${step.step_order}</div>

      <!-- Nội dung -->
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap;margin-bottom:4px;">
          <span class="fw-medium" style="color:var(--text-heading);">${step.step_name}</span>
          ${!step.is_mandatory ? '<span class="badge badge-neutral" style="font-size:10px;">Tùy chọn</span>' : ''}
          ${step.estimated_time ? `
            <span class="text-xs" style="color:var(--text-muted);">⏱ ${_fmtTime(step.estimated_time)}</span>
          ` : ''}
        </div>
        ${step.technical_requirement ? `
          <div class="text-sm" style="color:var(--text-secondary);margin-bottom:4px;">
            📌 ${step.technical_requirement}
          </div>` : ''}
        ${extras.length ? `
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-3);margin-top:4px;">
            ${extras.map((e) => `<span class="text-xs" style="color:var(--text-muted);">${e}</span>`).join('')}
          </div>` : ''}
      </div>

      ${editBtns}
    </div>`;
}

/* ════════════════════════════════════════════════════════════
   FORM: Thêm/Sửa Loại Xe
   ════════════════════════════════════════════════════════════ */
function openVehicleTypeForm(vt, onSave) {
  const isEdit = !!vt;
  let previewUrl = vt?.image_url || null;

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label required">Mã loại xe</label>
        <input type="text" class="form-control" id="vt-code"
          value="${vt?.type_code || ''}" ${isEdit ? 'readonly' : ''} placeholder="VD: ZIL-131" />
      </div>
      <div class="form-group">
        <label class="form-label required">Tên loại xe</label>
        <input type="text" class="form-control" id="vt-name"
          value="${vt?.type_name || ''}" placeholder="VD: Xe ô tô ZIL-131" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Hãng sản xuất</label>
        <input type="text" class="form-control" id="vt-manufacturer"
          value="${vt?.manufacturer || ''}" placeholder="VD: ZIL" />
      </div>
      <div class="form-group">
        <label class="form-label">Quốc gia sản xuất</label>
        <input type="text" class="form-control" id="vt-country"
          value="${vt?.origin_country || ''}" placeholder="VD: Liên Xô" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Mô tả</label>
      <textarea class="form-control" id="vt-desc" rows="2"
        placeholder="Thông tin kỹ thuật cơ bản...">${vt?.description || ''}</textarea>
    </div>

    <!-- Ảnh -->
    <div class="form-group">
      <label class="form-label">Hình ảnh xe</label>
      <div style="display:flex;gap:var(--space-3);align-items:flex-start;">
        <div id="img-preview" style="
          width:140px;height:100px;flex-shrink:0;
          border:2px dashed var(--border-color-dark);border-radius:var(--border-radius-sm);
          display:flex;align-items:center;justify-content:center;
          background:var(--bg-table-header);overflow:hidden;cursor:pointer;">
          ${previewUrl
            ? `<img src="${previewUrl}" style="width:100%;height:100%;object-fit:cover;" />`
            : `<span style="font-size:36px;opacity:.4;">📷</span>`}
        </div>
        <div style="flex:1;">
          <input type="file" id="vt-img-file" accept="image/*" style="display:none;" />
          <button class="btn btn-secondary btn-sm" id="btn-pick-img" style="margin-bottom:6px;">
            📁 Chọn ảnh từ máy
          </button>
          <p class="text-xs text-muted">Hoặc dán URL ảnh:</p>
          <input type="text" class="form-control" id="vt-img-url"
            value="${vt?.image_url || ''}" placeholder="https://... hoặc data:image/..." style="margin-top:4px;" />
          ${previewUrl ? `<button class="btn btn-sm btn-danger" id="btn-clear-img" style="margin-top:6px;">✕ Xóa ảnh</button>` : ''}
        </div>
      </div>
    </div>

    ${isEdit ? `
    <div class="form-group">
      <label class="form-label">Trạng thái</label>
      <select class="form-control" id="vt-active">
        <option value="true"  ${vt.is_active  ? 'selected' : ''}>Đang sử dụng</option>
        <option value="false" ${!vt.is_active ? 'selected' : ''}>Ngừng sử dụng</option>
      </select>
    </div>` : ''}
  `;

  // Wire image picker
  const fileInput = content.querySelector('#vt-img-file');
  const urlInput  = content.querySelector('#vt-img-url');
  const preview   = content.querySelector('#img-preview');

  function updatePreview(url) {
    previewUrl = url;
    preview.innerHTML = url
      ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" />`
      : `<span style="font-size:36px;opacity:.4;">📷</span>`;
  }

  content.querySelector('#btn-pick-img').addEventListener('click', () => fileInput.click());
  preview.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      urlInput.value = ev.target.result;
      updatePreview(ev.target.result);
    };
    reader.readAsDataURL(file);
  });

  urlInput.addEventListener('input', (e) => updatePreview(e.target.value.trim()));

  content.querySelector('#btn-clear-img')?.addEventListener('click', () => {
    urlInput.value = '';
    updatePreview('');
  });

  modal.open({
    title: isEdit ? `Sửa: ${vt.type_name}` : 'Thêm loại xe mới',
    content,
    size: 'lg',
    buttons: [
      { label: 'Hủy', class: 'btn-secondary', action: (c) => c() },
      {
        label: isEdit ? 'Cập nhật' : 'Tạo mới',
        class: 'btn-primary',
        action: async (c) => {
          const data = {
            type_code:      content.querySelector('#vt-code').value.trim(),
            type_name:      content.querySelector('#vt-name').value.trim(),
            manufacturer:   content.querySelector('#vt-manufacturer').value.trim(),
            origin_country: content.querySelector('#vt-country').value.trim(),
            description:    content.querySelector('#vt-desc').value.trim(),
            image_url:      content.querySelector('#vt-img-url').value.trim() || null,
          };
          if (isEdit) data.is_active = content.querySelector('#vt-active').value === 'true';

          if (!data.type_name) { toast.warning('Thiếu thông tin', 'Vui lòng nhập tên loại xe'); return; }

          let res;
          if (isEdit) {
            res = await window.electronAPI.invoke('vehicleType:update', { id: vt.id, data });
          } else {
            if (!data.type_code) { toast.warning('Thiếu thông tin', 'Vui lòng nhập mã loại xe'); return; }
            res = await window.electronAPI.invoke('vehicleType:create', data);
          }

          if (res.success) {
            toast.success(isEdit ? 'Cập nhật thành công' : 'Tạo loại xe thành công');
            c();
            if (onSave) onSave();
            else _loadVehicleGrid();
          } else {
            toast.error('Lỗi', res.error);
          }
        },
      },
    ],
  });
}

/* ════════════════════════════════════════════════════════════
   FORM: Thêm/Sửa Bước Quy Trình
   ════════════════════════════════════════════════════════════ */
function openStepForm(step, vehicleTypeId, defaultMaintType, onSave) {
  const isEdit = !!step;

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label required">Loại bảo dưỡng</label>
        <select class="form-control" id="sf-mtype" ${isEdit ? 'disabled' : ''}>
          ${Object.entries(MAINT_TYPES).map(([k, v]) =>
            `<option value="${k}" ${(step?.maintenance_type || defaultMaintType) === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Thứ tự bước</label>
        <input type="number" class="form-control" id="sf-order"
          value="${step?.step_order || ''}" min="1" placeholder="Tự động nếu để trống" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label required">Tên bước thực hiện</label>
      <input type="text" class="form-control" id="sf-name"
        value="${step?.step_name || ''}" placeholder="VD: Kiểm tra mức dầu động cơ" />
    </div>
    <div class="form-group">
      <label class="form-label">Yêu cầu kỹ thuật</label>
      <textarea class="form-control" id="sf-req" rows="2"
        placeholder="Tiêu chuẩn kỹ thuật cần đạt...">${step?.technical_requirement || ''}</textarea>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Dụng cụ cần thiết</label>
        <input type="text" class="form-control" id="sf-tools"
          value="${step?.tools_required || ''}" placeholder="VD: Cờ lê 27mm, khay dầu" />
      </div>
      <div class="form-group">
        <label class="form-label">Thời gian ước tính (phút)</label>
        <input type="number" class="form-control" id="sf-time"
          value="${step?.estimated_time || ''}" min="1" placeholder="VD: 30" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Lưu ý an toàn</label>
      <input type="text" class="form-control" id="sf-safety"
        value="${step?.safety_notes || ''}" placeholder="VD: Chú ý dầu nóng khi xả" />
    </div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="sf-mandatory" ${step?.is_mandatory !== false ? 'checked' : ''} />
        <span class="form-label" style="margin:0;">Bước bắt buộc</span>
      </label>
    </div>
  `;

  modal.open({
    title: isEdit ? `Sửa bước: ${step.step_name}` : 'Thêm bước quy trình',
    content,
    size: 'lg',
    buttons: [
      { label: 'Hủy', class: 'btn-secondary', action: (c) => c() },
      {
        label: isEdit ? 'Cập nhật' : 'Thêm bước',
        class: 'btn-primary',
        action: async (c) => {
          const data = {
            vehicle_type_id:       vehicleTypeId,
            maintenance_type:      content.querySelector('#sf-mtype').value,
            step_name:             content.querySelector('#sf-name').value.trim(),
            technical_requirement: content.querySelector('#sf-req').value.trim(),
            tools_required:        content.querySelector('#sf-tools').value.trim(),
            safety_notes:          content.querySelector('#sf-safety').value.trim(),
            estimated_time:        parseInt(content.querySelector('#sf-time').value) || null,
            is_mandatory:          content.querySelector('#sf-mandatory').checked,
          };
          const orderVal = content.querySelector('#sf-order').value;
          if (orderVal) data.step_order = parseInt(orderVal);

          if (!data.step_name) { toast.warning('Thiếu thông tin', 'Vui lòng nhập tên bước'); return; }

          let res;
          if (isEdit) {
            res = await window.electronAPI.invoke('vehicleStep:update', { id: step.id, data });
          } else {
            res = await window.electronAPI.invoke('vehicleStep:create', data);
          }

          if (res.success) {
            toast.success(isEdit ? 'Cập nhật bước thành công' : 'Thêm bước thành công');
            c();
            if (onSave) onSave();
          } else {
            toast.error('Lỗi', res.error);
          }
        },
      },
    ],
  });
}

/* ── Helpers ── */
function _isAdmin() { return store.hasRole('admin'); }

function _fmtTime(minutes) {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}g${m}p` : `${h} giờ`;
}

/* ── Register route ── */
console.log("register maintenance-steps");
router.register('maintenance-steps', {
  title: 'Quy Trình Công Nghệ',
  render: (container) => renderMaintenanceSteps(container),
});

router.register('vehicle-detail', {
  title: 'Chi Tiết Loại Xe',
  render: (container, params) => renderVehicleDetail(container, params),
});