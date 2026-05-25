/* ============================================================
   Equipment List Page
   ============================================================ */
'use strict';

// Trạng thái trang bị
const EQUIPMENT_STATUS = {
  active:         { label: 'Đang hoạt động',  badge: 'badge-success' },
  maintenance:    { label: 'Đang bảo dưỡng',  badge: 'badge-warning' },
  inactive:       { label: 'Không hoạt động', badge: 'badge-neutral' },
  decommissioned: { label: 'Đã loại biên',    badge: 'badge-danger'  },
};

function badgeStatus(status) {
  const s = EQUIPMENT_STATUS[status] || { label: status, badge: 'badge-neutral' };
  return `<span class="badge ${s.badge}">${s.label}</span>`;
}

function renderEquipmentList(container) {
  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">Hồ Sơ Trang Bị</h2>
        <p class="page-subtitle">Quản lý danh sách trang bị / xe máy quân đội</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-add-equipment">+ Thêm trang bị</button>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid" id="equipment-stats"></div>

    <!-- Filter bar -->
    <div class="filter-bar">
      <input type="text" class="form-control search-input" id="eq-search" placeholder="🔍 Tìm theo mã, tên, số serial..." />
      <select class="form-control" id="eq-filter-status">
        <option value="">-- Trạng thái --</option>
        <option value="active">Đang hoạt động</option>
        <option value="maintenance">Đang bảo dưỡng</option>
        <option value="inactive">Không hoạt động</option>
        <option value="decommissioned">Đã loại biên</option>
      </select>
      <select class="form-control" id="eq-filter-unit">
        <option value="">-- Đơn vị --</option>
      </select>
      <button class="btn btn-secondary" id="btn-eq-reset">Xóa lọc</button>
    </div>

    <!-- Table -->
    <div class="table-container" id="equipment-table-container"></div>
  `;

  // Load stats
  _loadEquipmentStats();

  // Load units for filter
  _loadUnits(document.getElementById('eq-filter-unit'));

  // Build table
  const tableContainer = document.getElementById('equipment-table-container');
  const dt = new DataTable({
    container: tableContainer,
    columns: [
      { key: 'equipment_code', label: 'Mã trang bị', sortable: true, width: '130px',
        render: (v) => `<span class="fw-semibold" style="color:var(--color-military-medium)">${v}</span>` },
      { key: 'equipment_name', label: 'Tên trang bị', sortable: true,
        render: (v, row) => `
          <div class="cell-primary">${v}</div>
          <div class="cell-sub">${row.model || ''}</div>
        ` },
      { key: 'serial_number', label: 'Số serial',
        render: (v) => v || '<span class="text-muted">—</span>' },
      { key: 'year_of_manufacture', label: 'Năm SX', width: '80px',
        render: (v) => v || '—' },
      { key: 'unit_name', label: 'Đơn vị',
        render: (v) => v || '<span class="text-muted">—</span>' },
      { key: 'status', label: 'Trạng thái', width: '150px',
        render: (v) => badgeStatus(v) },
    ],
    actions: [
      {
        label: 'Chi tiết',
        class: 'btn-secondary',
        action: (row) => router.navigate('equipment-detail', { id: row.id }),
      },
      {
        label: 'Sửa',
        class: 'btn-secondary',
        action: (row) => openEquipmentForm(row, dt),
      },
      {
        label: 'Xóa',
        class: 'btn-danger',
        show: () => store.hasRole('admin'),
        action: async (row) => {
          const ok = await modal.confirm({
            title: 'Xóa trang bị',
            message: `Xóa trang bị "${row.equipment_name}"?`,
            sub: 'Hành động này không thể hoàn tác.',
            type: 'danger',
            confirmText: 'Xóa',
          });
          if (!ok) return;
          const res = await api.deleteEquipment(row.id);
          if (res.success) {
            toast.success('Đã xóa', `Trang bị ${row.equipment_code} đã được xóa`);
            dt.reload();
            _loadEquipmentStats();
          } else {
            toast.error('Lỗi xóa', res.error);
          }
        },
      },
    ],
    fetchData: (opts) => api.listEquipment({
      keyword: opts.search,
      status: opts.status || '',
      unitId: opts.unitId || null,
      page: opts.page,
      pageSize: opts.pageSize,
    }),
    pageSize: 20,
  });
  dt.onRowClick = (row) => router.navigate('equipment-detail', { id: row.id });
  dt.load();

  // Search
  let searchTimer = null;
  document.getElementById('eq-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => dt.setSearch(e.target.value), 400);
  });

  // Status filter
  document.getElementById('eq-filter-status').addEventListener('change', (e) => {
    dt.setFilters({ status: e.target.value });
  });

  // Unit filter
  document.getElementById('eq-filter-unit').addEventListener('change', (e) => {
    dt.setFilters({ unitId: e.target.value || null });
  });

  // Reset
  document.getElementById('btn-eq-reset').addEventListener('click', () => {
    document.getElementById('eq-search').value = '';
    document.getElementById('eq-filter-status').value = '';
    document.getElementById('eq-filter-unit').value = '';
    dt.search = '';
    dt.filters = {};
    dt.page = 1;
    dt.load();
  });

  // Add equipment
  document.getElementById('btn-add-equipment').addEventListener('click', () => {
    openEquipmentForm(null, dt);
  });
}

async function _loadEquipmentStats() {
  const statsEl = document.getElementById('equipment-stats');
  if (!statsEl) return;

  const res = await api.reportEquipmentStatus();
  if (!res.success) return;

  const { byStatus } = res.data;
  const total = byStatus.reduce((s, r) => s + r.count, 0);
  const active = byStatus.find((r) => r.status === 'active')?.count || 0;
  const maint  = byStatus.find((r) => r.status === 'maintenance')?.count || 0;
  const decomm = byStatus.find((r) => r.status === 'decommissioned')?.count || 0;

  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-card-label">Tổng trang bị</div>
      <div class="stat-card-value">${total}</div>
    </div>
    <div class="stat-card success">
      <div class="stat-card-label">Hoạt động</div>
      <div class="stat-card-value">${active}</div>
    </div>
    <div class="stat-card warning">
      <div class="stat-card-label">Bảo dưỡng</div>
      <div class="stat-card-value">${maint}</div>
    </div>
    <div class="stat-card danger">
      <div class="stat-card-label">Loại biên</div>
      <div class="stat-card-value">${decomm}</div>
    </div>
  `;
}

async function _loadUnits(selectEl) {
  if (!selectEl) return;
  const res = await api.listUnits();
  if (!res.success) return;
  for (const u of res.data) {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.unit_name;
    selectEl.appendChild(opt);
  }
}

function openEquipmentForm(equipment, dt) {
  const isEdit = !!equipment;
  const unitSelectId = 'form-eq-unit';

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label required">Mã trang bị</label>
        <input type="text" class="form-control" id="form-eq-code"
          value="${equipment?.equipment_code || ''}" ${isEdit ? 'readonly' : ''} placeholder="VD: XM-001" />
      </div>
      <div class="form-group">
        <label class="form-label required">Tên trang bị</label>
        <input type="text" class="form-control" id="form-eq-name"
          value="${equipment?.equipment_name || ''}" placeholder="VD: Xe ô tô ZIL-131" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Model</label>
        <input type="text" class="form-control" id="form-eq-model"
          value="${equipment?.model || ''}" placeholder="VD: ZIL-131" />
      </div>
      <div class="form-group">
        <label class="form-label">Số serial</label>
        <input type="text" class="form-control" id="form-eq-serial"
          value="${equipment?.serial_number || ''}" placeholder="VD: SN-20240001" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Năm sản xuất</label>
        <input type="number" class="form-control" id="form-eq-year"
          value="${equipment?.year_of_manufacture || ''}" min="1950" max="2099" placeholder="VD: 2020" />
      </div>
      <div class="form-group">
        <label class="form-label">Trạng thái</label>
        <select class="form-control" id="form-eq-status">
          ${Object.entries(EQUIPMENT_STATUS).map(([v, s]) =>
            `<option value="${v}" ${equipment?.status === v ? 'selected' : ''}>${s.label}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Đơn vị quản lý</label>
      <select class="form-control" id="${unitSelectId}">
        <option value="">-- Chọn đơn vị --</option>
      </select>
    </div>
  `;

  // Load units
  _loadUnits(content.querySelector(`#${unitSelectId}`)).then(() => {
    if (equipment?.unit_id) {
      content.querySelector(`#${unitSelectId}`).value = equipment.unit_id;
    }
  });

  const { close } = modal.open({
    title: isEdit ? `Chỉnh sửa: ${equipment.equipment_code}` : 'Thêm trang bị mới',
    content,
    size: 'lg',
    buttons: [
      { label: 'Hủy', class: 'btn-secondary', action: (c) => c() },
      {
        label: isEdit ? 'Cập nhật' : 'Tạo mới',
        class: 'btn-primary',
        action: async (c) => {
          const data = {
            equipment_code:      content.querySelector('#form-eq-code').value.trim(),
            equipment_name:      content.querySelector('#form-eq-name').value.trim(),
            model:               content.querySelector('#form-eq-model').value.trim(),
            serial_number:       content.querySelector('#form-eq-serial').value.trim(),
            year_of_manufacture: parseInt(content.querySelector('#form-eq-year').value) || null,
            unit_id:             parseInt(content.querySelector(`#${unitSelectId}`).value) || null,
            status:              content.querySelector('#form-eq-status').value,
          };

          if (!data.equipment_name) {
            toast.warning('Thiếu thông tin', 'Vui lòng nhập tên trang bị');
            return;
          }

          let res;
          if (isEdit) {
            res = await api.updateEquipment(equipment.id, data);
          } else {
            if (!data.equipment_code) { toast.warning('Thiếu thông tin', 'Vui lòng nhập mã trang bị'); return; }
            res = await api.createEquipment(data);
          }

          if (res.success) {
            toast.success(isEdit ? 'Cập nhật thành công' : 'Tạo mới thành công');
            dt.reload();
            _loadEquipmentStats();
            c();
          } else {
            toast.error('Lỗi', res.error);
          }
        },
      },
    ],
  });
}

// Register route
router.register('equipment-list', {
  title: 'Hồ Sơ Trang Bị',
  render: (container) => renderEquipmentList(container),
});
