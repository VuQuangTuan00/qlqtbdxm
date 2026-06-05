/* ============================================================
   Equipment Detail Page
   ============================================================ */
'use strict';

const EQUIP_STATUS_LABELS = {
  active: 'Đang hoạt động',
  maintenance: 'Đang bảo dưỡng',
  inactive: 'Không hoạt động',
  decommissioned: 'Đã loại biên',
};
const EQUIP_STATUS_BADGES = {
  active: 'badge-success',
  maintenance: 'badge-warning',
  inactive: 'badge-neutral',
  decommissioned: 'badge-danger',
};
const PLAN_STATUS_LABELS = {
  pending:     'Chờ phê duyệt',
  approved:    'Đã phê duyệt',
  in_progress: 'Đang thực hiện',
  completed:   'Hoàn thành',
  cancelled:   'Đã hủy',
};
const PLAN_STATUS_BADGES = {
  pending:     'badge-neutral',
  approved:    'badge-info',
  in_progress: 'badge-warning',
  completed:   'badge-success',
  cancelled:   'badge-danger',
};

async function renderEquipmentDetail(container, params) {
  const { id } = params;
  if (!id) { container.innerHTML = '<div class="alert alert-danger">Không có ID trang bị</div>'; return; }

  container.innerHTML = `<div class="loading-overlay" style="position:relative;min-height:200px;"><div class="spinner"></div></div>`;

  const res = await api.getEquipment(id);
  if (!res.success) {
    container.innerHTML = `<div class="alert alert-danger">${res.error}</div>`;
    return;
  }

  const eq = res.data;
  const statusBadge = `<span class="badge ${EQUIP_STATUS_BADGES[eq.status] || 'badge-neutral'}">${EQUIP_STATUS_LABELS[eq.status] || eq.status}</span>`;

  container.innerHTML = `
    <div class="breadcrumb">
      <span class="breadcrumb-item" id="bc-back">Hồ Sơ Trang Bị</span>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-item active">${eq.equipment_code}</span>
    </div>

    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">${eq.equipment_name}</h2>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
          ${statusBadge}
          <span class="text-muted text-sm">${eq.equipment_code}</span>
        </div>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-create-plan">+ Tạo kế hoạch BD</button>
        <button class="btn btn-secondary" id="btn-edit-equipment">Chỉnh sửa</button>
      </div>
    </div>

    <!-- Detail cards -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-5);margin-bottom:var(--space-6);">
      <div class="card">
        <div class="card-header"><h5 class="card-title">Thông tin cơ bản</h5></div>
        <div class="card-body">
          <div class="detail-grid">
            <div class="detail-item">
              <div class="detail-label">Mã trang bị</div>
              <div class="detail-value">${eq.equipment_code}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Model</div>
              <div class="detail-value">${eq.model || '—'}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Số serial</div>
              <div class="detail-value">${eq.serial_number || '—'}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Năm sản xuất</div>
              <div class="detail-value">${eq.year_of_manufacture || '—'}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Đơn vị</div>
              <div class="detail-value">${eq.unit_name || '—'}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Ngày nhập</div>
              <div class="detail-value">${_formatDate(eq.created_at)}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h5 class="card-title">Mã QR</h5></div>
        <div class="card-body" style="text-align:center;">
          <div style="font-family:monospace;font-size:18px;font-weight:bold;color:var(--color-military-medium);
               background:var(--bg-table-header);padding:16px;border-radius:8px;margin-bottom:12px;">
            ${eq.qr_value || 'Chưa có mã QR'}
          </div>
          <p class="text-muted text-sm">Mã QR dùng để tra cứu nhanh trang bị</p>
        </div>
      </div>
    </div>

    <!-- Lịch sử bảo dưỡng -->
    <div class="card">
      <div class="card-header">
        <h5 class="card-title">Lịch sử bảo dưỡng</h5>
        <button class="btn btn-secondary btn-sm" id="btn-view-all-plans">Xem tất cả</button>
      </div>
      <div class="card-body" style="padding:0;">
        ${_renderRecentPlans(eq.recentPlans || [])}
      </div>
    </div>
  `;

  // Breadcrumb back
  document.getElementById('bc-back').addEventListener('click', () => router.navigate('equipment-list'));

  // Create plan
  document.getElementById('btn-create-plan').addEventListener('click', () => {
    router.navigate('plan-list', { createForEquipment: eq });
  });

  // Edit
  document.getElementById('btn-edit-equipment').addEventListener('click', () => {
    // Navigate back to list and open form
    router.navigate('equipment-list');
  });

  // View all plans
  document.getElementById('btn-view-all-plans').addEventListener('click', () => {
    router.navigate('plan-list', { equipmentId: eq.id });
  });
}

function _renderRecentPlans(plans) {
  if (!plans.length) {
    return `<div class="table-empty">
      <div class="table-empty-icon">📋</div>
      <div class="table-empty-text">Chưa có kế hoạch bảo dưỡng</div>
    </div>`;
  }
  const rows = plans.map((p) => `
    <tr>
      <td><span class="fw-medium">${p.plan_code}</span></td>
      <td>${_maintenanceTypeLabel(p.maintenance_type)}</td>
      <td>${_formatDate(p.planned_date)}</td>
      <td>${p.created_by_name || '—'}</td>
      <td><span class="badge ${PLAN_STATUS_BADGES[p.status] || 'badge-neutral'}">${PLAN_STATUS_LABELS[p.status] || p.status}</span></td>
    </tr>
  `).join('');
  return `<table><thead><tr>
    <th>Mã kế hoạch</th><th>Loại BD</th><th>Ngày kế hoạch</th><th>Người lập</th><th>Trạng thái</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function _maintenanceTypeLabel(t) {
  const map = { dinh_ky: 'Định kỳ', dot_xuat: 'Đột xuất', sua_chua: 'Sửa chữa', kiem_tra: 'Kiểm tra' };
  return map[t] || t;
}

function _formatDate(d) {
  if (typeof d !== "string") {
    console.error("Date is not string:", d);
    return "";
  }

  const parts = d.split("-");
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

router.register('equipment-detail', {
  title: 'Chi tiết trang bị',
  render: (container, params) => renderEquipmentDetail(container, params),
});
