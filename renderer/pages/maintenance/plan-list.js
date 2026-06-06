/* ============================================================
   Maintenance Plan List Page
   ============================================================ */
'use strict';

const PLAN_STATUS = {
  pending:     { label: 'Chờ phê duyệt',  badge: 'badge-neutral'  },
  approved:    { label: 'Đã phê duyệt',   badge: 'badge-info'     },
  in_progress: { label: 'Đang thực hiện', badge: 'badge-warning'  },
  completed:   { label: 'Hoàn thành',     badge: 'badge-success'  },
  cancelled:   { label: 'Đã hủy',         badge: 'badge-danger'   },
};

const MAINT_TYPES = {
  dinh_ky:  'Định kỳ',
  dot_xuat: 'Đột xuất',
  sua_chua: 'Sửa chữa',
  kiem_tra: 'Kiểm tra',
};

function planBadge(status) {
  const s = PLAN_STATUS[status] || { label: status, badge: 'badge-neutral' };
  return `<span class="badge ${s.badge}">${s.label}</span>`;
}

async function renderPlanList(container, params = {}) {
  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">Kế Hoạch Bảo Dưỡng</h2>
        <p class="page-subtitle">Lập và theo dõi kế hoạch bảo dưỡng trang bị</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-add-plan">+ Tạo kế hoạch</button>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid" id="plan-stats"></div>

    <!-- Filter bar -->
    <div class="filter-bar">
      <input type="text" class="form-control search-input" id="plan-search"
        placeholder="🔍 Tìm theo mã kế hoạch, tên trang bị..." />
      <select class="form-control" id="plan-filter-status">
        <option value="">-- Trạng thái --</option>
        ${Object.entries(PLAN_STATUS).map(([v, s]) => `<option value="${v}">${s.label}</option>`).join('')}
      </select>
      <select class="form-control" id="plan-filter-type">
        <option value="">-- Loại bảo dưỡng --</option>
        ${Object.entries(MAINT_TYPES).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
      <input type="date" class="form-control" id="plan-filter-from" placeholder="Từ ngày" />
      <input type="date" class="form-control" id="plan-filter-to"   placeholder="Đến ngày" />
      <button class="btn btn-secondary" id="btn-plan-reset">Xóa lọc</button>
    </div>

    <!-- Table -->
    <div class="table-container" id="plan-table-container"></div>
  `;

  _loadPlanStats();

  const tableContainer = document.getElementById('plan-table-container');
  const dt = new DataTable({
    container: tableContainer,
    columns: [
      { key: 'plan_code', label: 'Mã kế hoạch', width: '140px', sortable: true,
        render: (v) => `<span class="fw-semibold" style="color:var(--color-military-medium)">${v}</span>` },
      { key: 'equipment_name', label: 'Trang bị',
        render: (v, row) => `
          <div class="cell-primary">${v}</div>
          <div class="cell-sub">${row.equipment_code} · ${row.unit_name || ''}</div>
        ` },
      { key: 'maintenance_type', label: 'Loại BD', width: '110px',
        render: (v) => `<span class="badge badge-neutral">${MAINT_TYPES[v] || v}</span>` },
      { key: 'planned_date', label: 'Ngày kế hoạch', width: '130px', sortable: true,
        render: (v, row) => {
          const overdue = row.status !== 'completed' && row.status !== 'cancelled' && v < new Date().toISOString().split('T')[0];
          return `<span style="${overdue ? 'color:var(--color-danger);font-weight:600;' : ''}">${_fmtDate(v)}</span>`;
        }},
      { key: 'created_by_name', label: 'Người lập', render: (v) => v || '—' },
      { key: 'status', label: 'Trạng thái', width: '150px', sortable: true,
        render: (v) => planBadge(v) },
    ],
    actions: [
      {
        label: 'Chi tiết',
        class: 'btn-secondary',
        action: (row) => router.navigate('plan-detail', { id: row.id }),
      },
      {
        label: 'Phê duyệt',
        class: 'btn-success btn-sm',
        show: (row) => row.status === 'pending' && store.hasRole('admin', 'commander'),
        action: async (row) => {
          const ok = await modal.confirm({
            title: 'Phê duyệt kế hoạch',
            message: `Phê duyệt kế hoạch "${row.plan_code}"?`,
            confirmText: 'Phê duyệt',
          });
          if (!ok) return;
          const res = await api.approvePlan(row.id);
          if (res.success) { toast.success('Đã phê duyệt'); dt.reload(); _loadPlanStats(); }
          else toast.error('Lỗi', res.error);
        },
      },
      {
        label: 'Hủy',
        class: 'btn-danger btn-sm',
        show: (row) => !['completed', 'cancelled'].includes(row.status),
        action: async (row) => {
          const ok = await modal.confirm({
            title: 'Hủy kế hoạch', message: `Hủy kế hoạch "${row.plan_code}"?`,
            type: 'danger', confirmText: 'Hủy kế hoạch',
          });
          if (!ok) return;
          const res = await api.cancelPlan(row.id);
          if (res.success) { toast.success('Đã hủy kế hoạch'); dt.reload(); _loadPlanStats(); }
          else toast.error('Lỗi', res.error);
        },
      },
    ],
    fetchData: (opts) => api.listPlans({
      keyword:         opts.search,
      status:          opts.status || '',
      maintenanceType: opts.maintenanceType || '',
      fromDate:        opts.fromDate || '',
      toDate:          opts.toDate || '',
      page:            opts.page,
      pageSize:        opts.pageSize,
    }),
    pageSize: 20,
  });
  dt.onRowClick = (row) => router.navigate('plan-detail', { id: row.id });
  dt.load();

  // Search
  let timer = null;
  document.getElementById('plan-search').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => dt.setSearch(e.target.value), 400);
  });

  document.getElementById('plan-filter-status').addEventListener('change', (e) => {
    dt.setFilters({ status: e.target.value });
  });
  document.getElementById('plan-filter-type').addEventListener('change', (e) => {
    dt.setFilters({ maintenanceType: e.target.value });
  });
  document.getElementById('plan-filter-from').addEventListener('change', (e) => {
    dt.setFilters({ fromDate: e.target.value });
  });
  document.getElementById('plan-filter-to').addEventListener('change', (e) => {
    dt.setFilters({ toDate: e.target.value });
  });
  document.getElementById('btn-plan-reset').addEventListener('click', () => {
    ['plan-search','plan-filter-status','plan-filter-type','plan-filter-from','plan-filter-to']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
    dt.search = '';
    dt.filters = {};
    dt.page = 1;
    dt.load();
  });

  // Add plan
  document.getElementById('btn-add-plan').addEventListener('click', () => {
    openPlanForm(params.createForEquipment || null, dt);
  });

  // Pre-filter if came from equipment detail
  if (params.equipmentId) {
    dt.setFilters({ equipmentId: params.equipmentId });
  }
}

async function _loadPlanStats() {
  const el = document.getElementById('plan-stats');
  if (!el) return;
  const res = await api.reportSummary();
  if (!res.success) return;
  const d = res.data;
  el.innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Tổng kế hoạch</div><div class="stat-card-value">${d.totalPlans}</div></div>
    <div class="stat-card warning"><div class="stat-card-label">Đang thực hiện</div><div class="stat-card-value">${d.inProgressPlans}</div></div>
    <div class="stat-card success"><div class="stat-card-label">Hoàn thành</div><div class="stat-card-value">${d.completedPlans}</div></div>
    <div class="stat-card danger"><div class="stat-card-label">Quá hạn</div><div class="stat-card-value">${d.overduePlans}</div></div>
  `;
  if (d.overduePlans > 0) sidebar.setBadge('plan-list', d.overduePlans);
}

async function openPlanForm(preEquipment, dt) {
  const equipmentSelectId = 'form-plan-eq';
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label required">Trang bị</label>
      <select class="form-control" id="${equipmentSelectId}">
        <option value="">-- Đang tải... --</option>
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label required">Loại bảo dưỡng</label>
        <select class="form-control" id="form-plan-type">
          ${Object.entries(MAINT_TYPES).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label required">Ngày kế hoạch</label>
        <input type="date" class="form-control" id="form-plan-date"
          value="${new Date().toISOString().split('T')[0]}" />
      </div>
    </div>
  `;

  // Load equipments
  const eqSel = content.querySelector(`#${equipmentSelectId}`);
  const eqRes = await api.listEquipment({ pageSize: 200 });
  eqSel.innerHTML = '<option value="">-- Chọn trang bị --</option>';
  if (eqRes.success) {
    for (const eq of eqRes.data.items || []) {
      const opt = document.createElement('option');
      opt.value = eq.id;
      opt.textContent = `${eq.equipment_code} - ${eq.equipment_name}`;
      eqSel.appendChild(opt);
    }
    if (preEquipment) eqSel.value = preEquipment.id;
  }

  modal.open({
    title: 'Tạo kế hoạch bảo dưỡng',
    content,
    size: 'lg',
    buttons: [
      { label: 'Hủy', class: 'btn-secondary', action: (c) => c() },
      {
        label: 'Tạo kế hoạch',
        class: 'btn-primary',
        action: async (c) => {
          const data = {
            equipment_id:     parseInt(content.querySelector(`#${equipmentSelectId}`).value),
            maintenance_type: content.querySelector('#form-plan-type').value,
            planned_date:     content.querySelector('#form-plan-date').value,
          };
          if (!data.equipment_id) { toast.warning('Thiếu thông tin', 'Vui lòng chọn trang bị'); return; }
          if (!data.planned_date) { toast.warning('Thiếu thông tin', 'Vui lòng chọn ngày kế hoạch'); return; }

          const res = await api.createPlan(data);
          if (res.success) {
            toast.success('Tạo thành công', `Kế hoạch ${res.data.plan_code} đã được tạo`);
            dt.reload();
            _loadPlanStats();
            c();
            router.navigate('plan-detail', { id: res.data.id });
          } else {
            toast.error('Lỗi', res.error);
          }
        },
      },
    ],
  });
}

// function _fmtDate(d) {
//   if (!d) return '—';
//   return d.split('T')[0];
// }
function _fmtDate(d) {
  if (typeof d !== "string") {
    console.error("Date is not string:", d);
    return "";
  }

  const parts = d.split("-");
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

router.register('plan-list', {
  title: 'Kế Hoạch Bảo Dưỡng',
  render: (container, params) => renderPlanList(container, params),
});
