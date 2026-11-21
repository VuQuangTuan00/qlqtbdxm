'use strict';

const MaintenanceItemRepository = require('./maintenance-item.repository');

class NormKtktMaintenanceRepository extends MaintenanceItemRepository {
  constructor() {
    super({ tableName: 'norm_ktkt_maintenance', idColumn: 'norm_ktkt_id' });
  }
}

module.exports = new NormKtktMaintenanceRepository();
