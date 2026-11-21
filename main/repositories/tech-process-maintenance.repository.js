'use strict';

const MaintenanceItemRepository = require('./maintenance-item.repository');

class TechProcessMaintenanceRepository extends MaintenanceItemRepository {
  constructor() {
    super({ tableName: 'tech_process_maintenance', idColumn: 'tech_process_id' });
  }
}

module.exports = new TechProcessMaintenanceRepository();
