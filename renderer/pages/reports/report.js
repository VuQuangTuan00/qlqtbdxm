/* ============================================================
   Reports Page
   ============================================================ */
'use strict';

async function renderReports(container) {
  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">Báo Cáo Tổng Hợp</h2>
        <p class="page-subtitle">Thống kê và phân tích trạng thái bảo dưỡng trang bị</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-secondary" id="btn-refresh-report">↻ Làm mới</button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab-btn active" data-tab="overview">Tổng quan</button>
      <button class="tab-btn" data-tab="equipment">Trang bị</button>
      <button class="tab-btn" data-tab="period">Theo kỳ</button>
      <button class="tab-btn" data-tab="overdue">Quá hạn</button>
    </div>

    <div id="tab-overview"  class="tab-content active"></div>
    <div id="tab-equipment" class="tab-content"></div>
    <div id="tab-period"    class="tab-content"></div>
    <div id="tab-overdue"   class="tab-content"></div>
  `;

  // Wire tabs
  container.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      container.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      document.getElementById(`tab-${tab}`).classList.add('active');
    });
  });

  document.getElementById('btn-refresh-report').addEventListener('click', () => {
    _loadOverview();
    _loadEquipmentReport();
    _loadOverdueReport();
  });

  _loadOverview();
  _loadEquipmentReport();
  _loadPeriodReport();
  _loadOverdueReport();
}

async function _loadOverview() {
  const el = document.getElementById('tab-overview');
  if (!el) return;
  el.innerHTML = `<div style="text-align:center;padding:32px;"><div class="spinner"></div></div>`;

  const res = await api.reportSummary();
  if (!res.success) { el.innerHTML = `<div class="alert alert-danger">${res.error}</div>`; return; }
  const d = res.data;

  el.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:var(--space-6);">
      <div class="stat-card">
        <div class="stat-card-label">Tổng trang bị</div>
        <div class="stat-card-value">${d.totalEquipments}</div>
        <div class="stat-card-sub">${d.activeEquipments} đang hoạt động</div>
      </div>
      <div class="stat-card info">
        <div class="stat-card-label">Đang bảo dưỡng</div>
        <div class="stat-card-value">${d.maintenanceEquipments}</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-card-label">Kế hoạch đang thực hiện</div>
        <div class="stat-card-value">${d.inProgressPlans}</div>
        <div class="stat-card-sub">/ ${d.totalPlans} tổng</div>
      </div>
      <div class="stat-card danger">
        <div class="stat-card-label">Quá hạn</div>
        <div class="stat-card-value">${d.overduePlans}</div>
        <div class="stat-card-sub">kế hoạch chưa hoàn thành</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-5);">
      <div class="card">
        <div class="card-header"><h5 class="card-title">Kế hoạch bảo dưỡng</h5></div>
        <div class="card-body">
          ${_barItem('Chờ phê duyệt', d.pendingPlans,   d.totalPlans, 'var(--color-neutral)')}
          ${_barItem('Đang thực hiện', d.inProgressPlans, d.totalPlans, 'var(--color-warning)')}
          ${_barItem('Hoàn thành',    d.completedPlans, d.totalPlans, 'var(--color-success)')}
          ${_barItem('Quá hạn',       d.overduePlans,   d.totalPlans, 'var(--color-danger)')}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h5 class="card-title">Thông tin hệ thống</h5></div>
        <div class="card-body">
          <div class="detail-grid">
            <div class="detail-item">
              <div class="detail-label">Đơn vị</div>
              <div class="detail-value" style="font-size:24px;font-weight:bold;">${d.totalUnits}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Người dùng</div>
              <div class="detail-value" style="font-size:24px;font-weight:bold;">${d.totalUsers}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Tổng kế hoạch</div>
              <div class="detail-value" style="font-size:24px;font-weight:bold;">${d.totalPlans}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Tỷ lệ hoàn thành</div>
              <div class="detail-value" style="font-size:24px;font-weight:bold;color:var(--color-success);">
                ${d.totalPlans > 0 ? Math.round((d.completedPlans / d.totalPlans) * 100) : 0}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function _loadEquipmentReport() {
  const el = document.getElementById('tab-equipment');
  if (!el) return;
  const res = await api.reportEquipmentStatus();
  if (!res.success) return;
  const { byStatus, byUnit } = res.data;

  const STATUS_LABELS = {
    active: 'Đang hoạt động', maintenance: 'Bảo dưỡng',
    inactive: 'Không HĐ', decommissioned: 'Loại biên',
  };
  const STATUS_COLORS = {
    active: 'var(--color-success)', maintenance: 'var(--color-warning)',
    inactive: 'var(--color-neutral)', decommissioned: 'var(--color-danger)',
  };
  const total = byStatus.reduce((s, r) => s + r.count, 0);

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:var(--space-5);">
      <div class="card">
        <div class="card-header"><h5 class="card-title">Theo trạng thái</h5></div>
        <div class="card-body">
          ${byStatus.map((r) => _barItem(
            STATUS_LABELS[r.status] || r.status, r.count, total,
            STATUS_COLORS[r.status] || 'var(--color-neutral)'
          )).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h5 class="card-title">Phân bố theo đơn vị</h5></div>
        <div class="card-body" style="padding:0;">
          <table>
            <thead><tr>
              <th>Đơn vị</th><th>Tổng</th><th>Hoạt động</th><th>Bảo dưỡng</th><th>Tỷ lệ</th>
            </tr></thead>
            <tbody>
              ${byUnit.map((u) => `<tr>
                <td><span class="fw-medium">${u.unit_name || '(Không có đơn vị)'}</span></td>
                <td>${u.total}</td>
                <td><span class="badge badge-success">${u.active}</span></td>
                <td><span class="badge badge-warning">${u.maintenance}</span></td>
                <td>${u.total > 0 ? Math.round((u.active / u.total) * 100) : 0}%</td>
              </tr>`).join('')}
              ${byUnit.length === 0 ? `<tr><td colspan="5" class="text-center text-muted">Không có dữ liệu</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

async function _loadPeriodReport() {
  const el = document.getElementById('tab-period');
  if (!el) return;

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  el.innerHTML = `
    <div class="filter-bar" style="margin-bottom:var(--space-4);">
      <label class="form-label" style="margin:0;">Từ ngày:</label>
      <input type="date" class="form-control" id="rp-from" value="${firstDay}" style="max-width:180px;" />
      <label class="form-label" style="margin:0;">Đến ngày:</label>
      <input type="date" class="form-control" id="rp-to" value="${lastDay}" style="max-width:180px;" />
      <button class="btn btn-primary" id="btn-rp-load">Xem báo cáo</button>
    </div>
    <div id="period-content"></div>
  `;

  async function loadPeriod() {
    const from = document.getElementById('rp-from').value;
    const to   = document.getElementById('rp-to').value;
    const res = await api.reportByPeriod({ fromDate: from, toDate: to });
    if (!res.success) { document.getElementById('period-content').innerHTML = `<div class="alert alert-danger">${res.error}</div>`; return; }
    const { plans, completedPlans } = res.data;

    const TYPE_LABELS = { dinh_ky: 'Định kỳ', dot_xuat: 'Đột xuất', sua_chua: 'Sửa chữa', kiem_tra: 'Kiểm tra' };
    const CONCL_LABELS = { dat: 'Đạt', khong_dat: 'Không đạt', can_kiem_tra_them: 'Cần KT' };
    const CONCL_BADGES = { dat: 'badge-success', khong_dat: 'badge-danger', can_kiem_tra_them: 'badge-warning' };

    document.getElementById('period-content').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr;gap:var(--space-5);">
        <div class="card">
          <div class="card-header"><h5 class="card-title">Tổng hợp kế hoạch trong kỳ</h5></div>
          <div class="card-body" style="padding:0;">
            <table>
              <thead><tr><th>Loại bảo dưỡng</th><th>Trạng thái</th><th>Số lượng</th></tr></thead>
              <tbody>
                ${plans.map((p) => `<tr>
                  <td>${TYPE_LABELS[p.maintenance_type] || p.maintenance_type}</td>
                  <td>${p.status}</td>
                  <td><strong>${p.count}</strong></td>
                </tr>`).join('')}
                ${plans.length === 0 ? `<tr><td colspan="3" class="text-center text-muted">Không có dữ liệu</td></tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h5 class="card-title">Kế hoạch đã hoàn thành (${completedPlans.length})</h5></div>
          <div class="card-body" style="padding:0;">
            <table>
              <thead><tr>
                <th>Mã KH</th><th>Trang bị</th><th>Loại BD</th><th>Ngày</th><th>Nghiệm thu</th><th>Người NT</th>
              </tr></thead>
              <tbody>
                ${completedPlans.map((p) => `<tr>
                  <td class="fw-medium">${p.plan_code}</td>
                  <td>
                    <div class="cell-primary">${p.equipment_name}</div>
                    <div class="cell-sub">${p.equipment_code}</div>
                  </td>
                  <td>${TYPE_LABELS[p.maintenance_type] || p.maintenance_type}</td>
                  <td>${_fmtDate(p.planned_date)}</td>
                  <td>${p.conclusion ? `<span class="badge ${CONCL_BADGES[p.conclusion] || 'badge-neutral'}">${CONCL_LABELS[p.conclusion] || p.conclusion}</span>` : '—'}</td>
                  <td>${p.accepted_by_name || '—'}</td>
                </tr>`).join('')}
                ${completedPlans.length === 0 ? `<tr><td colspan="6" class="text-center text-muted">Không có kế hoạch hoàn thành trong kỳ</td></tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  document.getElementById('btn-rp-load').addEventListener('click', loadPeriod);
  loadPeriod();
}

async function _loadOverdueReport() {
  const el = document.getElementById('tab-overdue');
  if (!el) return;
  const res = await api.reportOverdue();
  if (!res.success) return;
  const items = res.data;

  const MAINT_LABELS = { dinh_ky: 'Định kỳ', dot_xuat: 'Đột xuất', sua_chua: 'Sửa chữa', kiem_tra: 'Kiểm tra' };
  const STATUS_LABELS = { pending: 'Chờ PD', approved: 'Đã PD', in_progress: 'Đang TH' };

  if (items.length > 0) sidebar.setBadge('reports', items.length);

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h5 class="card-title">Kế hoạch quá hạn (${items.length})</h5>
        ${items.length > 0 ? `<span class="badge badge-danger">Cần xử lý: ${items.length}</span>` : ''}
      </div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr>
            <th>Mã kế hoạch</th><th>Trang bị</th><th>Đơn vị</th><th>Loại BD</th><th>Ngày kế hoạch</th><th>Trạng thái</th><th>Số ngày trễ</th>
          </tr></thead>
          <tbody>
            ${items.map((p) => {
              const planned = new Date(p.planned_date);
              const today = new Date();
              const daysLate = Math.floor((today - planned) / (1000 * 60 * 60 * 24));
              return `<tr>
                <td class="fw-semibold" style="color:var(--color-danger)">${p.plan_code}</td>
                <td>
                  <div class="cell-primary">${p.equipment_name}</div>
                  <div class="cell-sub">${p.equipment_code}</div>
                </td>
                <td>${p.unit_name || '—'}</td>
                <td>${MAINT_LABELS[p.maintenance_type] || p.maintenance_type}</td>
                <td style="color:var(--color-danger);font-weight:600;">${_fmtDate(p.planned_date)}</td>
                <td><span class="badge badge-warning">${STATUS_LABELS[p.status] || p.status}</span></td>
                <td><span class="badge badge-danger">${daysLate} ngày</span></td>
              </tr>`;
            }).join('')}
            ${items.length === 0 ? `<tr><td colspan="7">
              <div class="table-empty">
                <div class="table-empty-icon">✅</div>
                <div class="table-empty-text">Không có kế hoạch quá hạn</div>
              </div>
            </td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function _barItem(label, value, total, color) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return `
    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span class="text-sm">${label}</span>
        <span class="fw-semibold text-sm">${value} (${pct}%)</span>
      </div>
      <div style="background:var(--bg-table-header);border-radius:4px;height:8px;overflow:hidden;">
        <div style="background:${color};height:100%;width:${pct}%;border-radius:4px;transition:width 0.5s;"></div>
      </div>
    </div>
  `;
}

function _fmtDate(d) { return d ? d.split('T')[0] : '—'; }

router.register('reports', {
  title: 'Báo Cáo Tổng Hợp',
  render: (container) => renderReports(container),
});
