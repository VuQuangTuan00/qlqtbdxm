/* ============================================================
   Maintenance Plan Detail Page
   ============================================================ */
'use strict';

const STEP_STATUS_MAP = {
  pending:     { label: 'Chưa thực hiện', badge: 'badge-neutral',  class: '' },
  in_progress: { label: 'Đang thực hiện', badge: 'badge-warning',  class: 'in_progress' },
  completed:   { label: 'Hoàn thành',     badge: 'badge-success',  class: 'completed' },
  failed:      { label: 'Thất bại',       badge: 'badge-danger',   class: 'failed' },
};

const MAINT_TYPE_MAP = {
  dinh_ky: 'Định kỳ', dot_xuat: 'Đột xuất', sua_chua: 'Sửa chữa', kiem_tra: 'Kiểm tra',
};
const PLAN_STATUS_MAP = {
  pending:     { label: 'Chờ phê duyệt',  badge: 'badge-neutral' },
  approved:    { label: 'Đã phê duyệt',   badge: 'badge-info' },
  in_progress: { label: 'Đang thực hiện', badge: 'badge-warning' },
  completed:   { label: 'Hoàn thành',     badge: 'badge-success' },
  cancelled:   { label: 'Đã hủy',         badge: 'badge-danger' },
};

async function renderPlanDetail(container, params) {
  const { id } = params;
  if (!id) { container.innerHTML = '<div class="alert alert-danger">Không có ID kế hoạch</div>'; return; }

  container.innerHTML = `<div style="display:flex;justify-content:center;padding:48px;"><div class="spinner"></div></div>`;

  const res = await api.getPlan(id);
  if (!res.success) {
    container.innerHTML = `<div class="alert alert-danger">${res.error}</div>`;
    return;
  }

  const plan = res.data;
  const ps = PLAN_STATUS_MAP[plan.status] || { label: plan.status, badge: 'badge-neutral' };
  const completedSteps = (plan.logs || []).filter((l) => l.status === 'completed').length;
  const totalSteps     = (plan.logs || []).length;
  const progress       = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  container.innerHTML = `
    <div class="breadcrumb">
      <span class="breadcrumb-item" id="bc-plans">Kế hoạch bảo dưỡng</span>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-item active">${plan.plan_code}</span>
    </div>

    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">${plan.plan_code}</h2>
        <div style="display:flex;gap:8px;align-items:center;margin-top:4px;">
          <span class="badge ${ps.badge}">${ps.label}</span>
          <span class="text-muted text-sm">${MAINT_TYPE_MAP[plan.maintenance_type] || plan.maintenance_type}</span>
        </div>
      </div>
      <div class="page-header-actions" id="plan-actions"></div>
    </div>

    <!-- Info grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-5);margin-bottom:var(--space-5);">
      <div class="card">
        <div class="card-header"><h5 class="card-title">Thông tin kế hoạch</h5></div>
        <div class="card-body">
          <div class="detail-grid">
            <div class="detail-item">
              <div class="detail-label">Trang bị</div>
              <div class="detail-value">${plan.equipment_name}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Mã trang bị</div>
              <div class="detail-value">${plan.equipment_code}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Đơn vị</div>
              <div class="detail-value">${plan.unit_name || '—'}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Ngày kế hoạch</div>
              <div class="detail-value">${_fmtDate(plan.planned_date)}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Người lập</div>
              <div class="detail-value">${plan.created_by_name || '—'}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Người phê duyệt</div>
              <div class="detail-value">${plan.approved_by_name || '—'}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h5 class="card-title">Tiến độ thực hiện</h5></div>
        <div class="card-body">
          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span class="text-sm">Hoàn thành</span>
              <span class="fw-semibold">${completedSteps}/${totalSteps} bước</span>
            </div>
            <div style="background:var(--bg-table-header);border-radius:8px;height:12px;overflow:hidden;">
              <div style="background:var(--color-military-medium);height:100%;width:${progress}%;
                          border-radius:8px;transition:width 0.5s;"></div>
            </div>
            <div class="text-sm text-muted" style="margin-top:4px;text-align:right;">${progress}%</div>
          </div>
          ${plan.acceptance ? `
            <div class="alert alert-success">
              <strong>Nghiệm thu: </strong>
              ${plan.acceptance.conclusion === 'dat' ? 'Đạt' : plan.acceptance.conclusion === 'khong_dat' ? 'Không đạt' : 'Cần kiểm tra thêm'}
              — ${_fmtDate(plan.acceptance.acceptance_date)}
              ${plan.acceptance.accepted_by_name ? `(${plan.acceptance.accepted_by_name})` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    </div>

    <!-- Steps -->
    <div class="card">
      <div class="card-header">
        <h5 class="card-title">Các bước thực hiện (${totalSteps} bước)</h5>
      </div>
      <div class="card-body" style="padding:var(--space-4);">
        <div class="steps-list" id="steps-list"></div>
      </div>
    </div>
  `;

  // Render action buttons based on status
  _renderPlanActions(plan);

  // Render steps
  _renderSteps(plan.logs || [], plan);

  document.getElementById('bc-plans').addEventListener('click', () => router.navigate('plan-list'));
}

function _renderPlanActions(plan) {
  const actionsEl = document.getElementById('plan-actions');
  if (!actionsEl) return;
  actionsEl.innerHTML = '';

  if (plan.status === 'pending' && store.hasRole('admin', 'commander')) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-success';
    btn.textContent = '✓ Phê duyệt';
    btn.addEventListener('click', async () => {
      const ok = await modal.confirm({ title: 'Phê duyệt', message: 'Phê duyệt kế hoạch này?', confirmText: 'Phê duyệt' });
      if (!ok) return;
      const res = await api.approvePlan(plan.id);
      if (res.success) { toast.success('Đã phê duyệt'); router.navigate('plan-detail', { id: plan.id }); }
      else toast.error('Lỗi', res.error);
    });
    actionsEl.appendChild(btn);
  }

  if (plan.status === 'completed' && !plan.acceptance && store.hasRole('admin', 'commander', 'inspector')) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = '📋 Nghiệm thu';
    btn.addEventListener('click', () => openAcceptanceForm(plan));
    actionsEl.appendChild(btn);
  }

  if (!['completed', 'cancelled'].includes(plan.status)) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.textContent = '✕ Hủy kế hoạch';
    btn.addEventListener('click', async () => {
      const ok = await modal.confirm({
        title: 'Hủy kế hoạch', message: 'Hủy kế hoạch bảo dưỡng này?',
        type: 'danger', confirmText: 'Hủy',
      });
      if (!ok) return;
      const res = await api.cancelPlan(plan.id);
      if (res.success) { toast.success('Đã hủy'); router.navigate('plan-list'); }
      else toast.error('Lỗi', res.error);
    });
    actionsEl.appendChild(btn);
  }
}

function _renderSteps(logs, plan) {
  const stepsList = document.getElementById('steps-list');
  if (!stepsList) return;
  stepsList.innerHTML = '';

  if (!logs.length) {
    stepsList.innerHTML = `<div class="table-empty">
      <div class="table-empty-text">Không có bước thực hiện</div>
      <div class="table-empty-sub">Loại bảo dưỡng "${MAINT_TYPE_MAP[plan.maintenance_type]}" chưa có quy trình</div>
    </div>`;
    return;
  }

  for (const log of logs) {
    const ss = STEP_STATUS_MAP[log.status] || STEP_STATUS_MAP.pending;
    const item = document.createElement('div');
    item.className = `step-item ${ss.class}`;
    item.innerHTML = `
      <div class="step-number">${log.step_order}</div>
      <div class="step-info">
        <div class="step-name">${log.step_name}</div>
        <div class="step-req">${log.technical_requirement || ''}</div>
        ${log.performed_by_name && log.status !== 'pending' ? `<div class="step-req">Người thực hiện: ${log.performed_by_name}</div>` : ''}
        ${log.end_time ? `<div class="step-req">Hoàn thành: ${_fmtDateTime(log.end_time)}</div>` : ''}
        ${log.note ? `<div class="step-req">Ghi chú: ${log.note}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <span class="badge ${ss.badge}">${ss.label}</span>
        ${_stepActionBtn(log, plan)}
      </div>
    `;
    item.querySelector('[data-complete-step]')?.addEventListener('click', () => completeStep(log.id, plan.id));
    stepsList.appendChild(item);
  }
}

function _stepActionBtn(log, plan) {
  if (!['approved', 'in_progress'].includes(plan.status)) return '';
  if (!store.hasRole('admin', 'technician', 'commander')) return '';

  if (log.status === 'pending' || log.status === 'in_progress') {
    return '<button class="btn btn-sm btn-success" data-complete-step>✓ Hoàn thành</button>';
  }
  return '';
}

async function completeStep(logId, planId) {
  const note = await modal.prompt({
    title: 'Hoàn thành bước',
    label: 'Ghi chú (tùy chọn)',
    placeholder: 'Nhập ghi chú nếu có...',
  });
  if (note === null) return; // cancelled

  const res = await api.updateLogStatus(logId, 'completed', { note: note || '', end_time: new Date().toISOString() });
  if (res.success) {
    toast.success('Đã hoàn thành bước');
    router.navigate('plan-detail', { id: planId });
  } else {
    toast.error('Lỗi', res.error);
  }
}

function openAcceptanceForm(plan) {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label required">Kết luận nghiệm thu</label>
      <select class="form-control" id="acc-conclusion">
        <option value="dat">Đạt yêu cầu</option>
        <option value="khong_dat">Không đạt</option>
        <option value="can_kiem_tra_them">Cần kiểm tra thêm</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label required">Ngày nghiệm thu</label>
      <input type="date" class="form-control" id="acc-date"
        value="${new Date().toISOString().split('T')[0]}" />
    </div>
    <div class="form-group">
      <label class="form-label">Ghi chú</label>
      <textarea class="form-control" id="acc-note" placeholder="Nhập ghi chú nghiệm thu..."></textarea>
    </div>
  `;

  modal.open({
    title: 'Biên bản nghiệm thu',
    content,
    buttons: [
      { label: 'Hủy', class: 'btn-secondary', action: (c) => c() },
      {
        label: 'Lưu nghiệm thu',
        class: 'btn-primary',
        action: async (c) => {
          const data = {
            plan_id:         plan.id,
            conclusion:      content.querySelector('#acc-conclusion').value,
            acceptance_date: content.querySelector('#acc-date').value,
            note:            content.querySelector('#acc-note').value.trim(),
          };
          const res = await api.createAcceptance(data);
          if (res.success) {
            toast.success('Nghiệm thu thành công');
            c();
            router.navigate('plan-detail', { id: plan.id });
          } else {
            toast.error('Lỗi', res.error);
          }
        },
      },
    ],
  });
}


function _fmtDateTime(d) {
 if (!d) return "";

  // Nếu là Date object
  if (d instanceof Date) {
    return d.toLocaleDateString("vi-VN");
  }

  // Nếu là string yyyy-mm-dd
  if (typeof d === "string") {
    const parts = d.split("-");
    if (parts.length !== 3) return "";
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  console.error("Unsupported date type:", d);
  return "";
}

// Global for inline onclick
window.completeStep = completeStep;

router.register('plan-detail', {
  title: 'Chi tiết kế hoạch',
  render: (container, params) => renderPlanDetail(container, params),
});
