/* ============================================================
   API - IPC bridge wrapper
   Wraps window.electronAPI.invoke() with error handling
   ============================================================ */
'use strict';

const api = (() => {
  /**
   * Gọi IPC handler
   * @param {string} channel
   * @param {*} args
   * @returns {Promise<{success: boolean, data?: *, error?: string}>}
   */
  async function invoke(channel, args) {
    try {
      return await window.electronAPI.invoke(channel, args);
    } catch (err) {
      console.error(`[API] Lỗi gọi ${channel}:`, err);
      return { success: false, error: err.message || 'Lỗi không xác định' };
    }
  }

  return {
    // Auth
    login:          (username, password) => invoke('auth:login', { username, password }),
    logout:         ()                   => invoke('auth:logout'),
    getSession:     ()                   => invoke('auth:getSession'),
    changePassword: (oldPwd, newPwd)     => invoke('auth:changePassword', { oldPassword: oldPwd, newPassword: newPwd }),

    // Users
    listUsers:      (opts)               => invoke('user:list', opts),
    createUser:     (data)               => invoke('user:create', data),
    updateUser:     (id, data)           => invoke('user:update', { id, data }),
    toggleActive:   (id)                 => invoke('user:toggleActive', { id }),
    listRoles:      ()                   => invoke('role:list'),

    // Units
    listUnits:      (opts)               => invoke('unit:list', opts),
    getUnit:        (id)                 => invoke('unit:get', { id }),
    getUnitTree:    ()                   => invoke('unit:tree'),
    createUnit:     (data)               => invoke('unit:create', data),
    updateUnit:     (id, data)           => invoke('unit:update', { id, data }),
    deleteUnit:     (id)                 => invoke('unit:delete', { id }),

    // Equipment
    listEquipment:  (opts)               => invoke('equipment:list', opts),
    getEquipment:   (id)                 => invoke('equipment:get', { id }),
    searchEquipment:(opts)               => invoke('equipment:search', opts),
    createEquipment:(data)               => invoke('equipment:create', data),
    updateEquipment:(id, data)           => invoke('equipment:update', { id, data }),
    deleteEquipment:(id)                 => invoke('equipment:delete', { id }),
    getByQr:        (qrValue)            => invoke('equipment:getByQr', { qrValue }),

    // Plans
    listPlans:      (opts)               => invoke('plan:list', opts),
    getPlan:        (id)                 => invoke('plan:get', { id }),
    getPlanSteps:   (type)               => invoke('plan:getSteps', { maintenanceType: type }),
    createPlan:     (data)               => invoke('plan:create', data),
    updatePlan:     (id, data)           => invoke('plan:update', { id, data }),
    approvePlan:    (id)                 => invoke('plan:approve', { id }),
    cancelPlan:     (id)                 => invoke('plan:cancel', { id }),
    deletePlan:     (id)                 => invoke('plan:delete', { id }),

    // Logs
    listLogs:       (planId)             => invoke('log:list', { planId }),
    getLog:         (id)                 => invoke('log:get', { id }),
    createLog:      (data)               => invoke('log:create', data),
    updateLog:      (id, data)           => invoke('log:update', { id, data }),
    updateLogStatus:(id, status, extra)  => invoke('log:updateStatus', { id, status, extra }),

    // Acceptance
    getAcceptance:  (planId)             => invoke('acceptance:get', { planId }),
    createAcceptance:(data)              => invoke('acceptance:create', data),
    updateAcceptance:(id, data)          => invoke('acceptance:update', { id, data }),

    // Reports
    reportSummary:        ()             => invoke('report:summary'),
    reportEquipmentStatus:()             => invoke('report:equipmentStatus'),
    reportByPeriod:       (opts)         => invoke('report:maintenanceByPeriod', opts),
    reportOverdue:        ()             => invoke('report:overdueEquipment'),
  };
})();

window.api = api;
