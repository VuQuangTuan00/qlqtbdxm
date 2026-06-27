-- ============================================================
-- SQLite schema cho chế độ Demo — tổng hợp từ các migration PostgreSQL
-- SQLite 3.35+ (RETURNING hỗ trợ), SQLite 3.24+ (ON CONFLICT DO UPDATE)
-- ============================================================

CREATE TABLE IF NOT EXISTS units (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_code       TEXT NOT NULL UNIQUE,
    unit_name       TEXT NOT NULL,
    parent_unit_id  INTEGER REFERENCES units(id) ON DELETE SET NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    role_code   TEXT NOT NULL UNIQUE,
    role_name   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    role_id         INTEGER NOT NULL REFERENCES roles(id),
    unit_id         INTEGER REFERENCES units(id),
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- vehicle phải khai báo trước equipments vì equipments FK tới vehicle
CREATE TABLE IF NOT EXISTS vehicle (
    vehicle_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_name    TEXT NOT NULL,
    img_name        TEXT,
    img_path        TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    vehicle_type_id INTEGER REFERENCES vehicle_type(vehicle_type_id) ON DELETE SET NULL,
    updated_at      DATETIME
);

CREATE TABLE IF NOT EXISTS vehicle_type (
    vehicle_type_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_type_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS equipments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_code      TEXT NOT NULL UNIQUE,
    equipment_name      TEXT NOT NULL,
    model               TEXT,
    serial_number       TEXT UNIQUE,
    year_of_manufacture INTEGER,
    unit_id             INTEGER REFERENCES units(id),
    status              TEXT NOT NULL DEFAULT 'san_sang'
                            CHECK(status IN ('san_sang','bao_duong','hong_su_chua','ngung_hoat_dong','active','maintenance','inactive','decommissioned')),
    vehicle_id          INTEGER REFERENCES vehicle(vehicle_id) ON DELETE SET NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maintenance_plans (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_code           TEXT NOT NULL UNIQUE,
    equipment_id        INTEGER NOT NULL REFERENCES equipments(id),
    maintenance_type    TEXT NOT NULL
                            CHECK(maintenance_type IN ('dinh_ky','dot_xuat','sua_chua','kiem_tra')),
    planned_date        TEXT NOT NULL,
    created_by          INTEGER NOT NULL REFERENCES users(id),
    approved_by         INTEGER REFERENCES users(id),
    status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending','approved','in_progress','completed','cancelled')),
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maintenance_steps (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    maintenance_type        TEXT NOT NULL,
    step_order              INTEGER NOT NULL,
    step_name               TEXT NOT NULL,
    technical_requirement   TEXT,
    estimated_time          INTEGER,
    UNIQUE(maintenance_type, step_order)
);

CREATE TABLE IF NOT EXISTS maintenance_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id         INTEGER NOT NULL REFERENCES maintenance_plans(id),
    step_id         INTEGER NOT NULL REFERENCES maintenance_steps(id),
    performed_by    INTEGER NOT NULL REFERENCES users(id),
    start_time      DATETIME,
    end_time        DATETIME,
    result          TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','in_progress','completed','failed')),
    note            TEXT
);

CREATE TABLE IF NOT EXISTS acceptance_records (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id         INTEGER NOT NULL UNIQUE REFERENCES maintenance_plans(id),
    accepted_by     INTEGER NOT NULL REFERENCES users(id),
    acceptance_date TEXT NOT NULL,
    conclusion      TEXT NOT NULL
                        CHECK(conclusion IN ('dat','khong_dat','can_kiem_tra_them')),
    note            TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_type    TEXT NOT NULL CHECK(ref_type IN ('equipment','plan','log','acceptance')),
    ref_id      INTEGER NOT NULL,
    file_name   TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qr_codes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id    INTEGER NOT NULL UNIQUE REFERENCES equipments(id),
    qr_value        TEXT NOT NULL UNIQUE,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER REFERENCES users(id),
    action          TEXT NOT NULL,
    target_table    TEXT NOT NULL,
    target_id       INTEGER,
    action_time     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS engine_maintenance (
    engine_maintenance_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id              INTEGER NOT NULL REFERENCES vehicle(vehicle_id) ON DELETE CASCADE,
    maintenance_name        TEXT NOT NULL,
    display_order           INTEGER NOT NULL DEFAULT 0,
    tech_process_file_name  TEXT,
    tech_process_file_path  TEXT,
    norm_ktkt_file_name     TEXT,
    norm_ktkt_file_path     TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_units_parent            ON units(parent_unit_id);
CREATE INDEX IF NOT EXISTS idx_users_role              ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_unit              ON users(unit_id);
CREATE INDEX IF NOT EXISTS idx_equipments_unit         ON equipments(unit_id);
CREATE INDEX IF NOT EXISTS idx_equipments_status       ON equipments(status);
CREATE INDEX IF NOT EXISTS idx_equipments_vehicle      ON equipments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_plans_equipment         ON maintenance_plans(equipment_id);
CREATE INDEX IF NOT EXISTS idx_plans_status            ON maintenance_plans(status);
CREATE INDEX IF NOT EXISTS idx_logs_plan               ON maintenance_logs(plan_id);
CREATE INDEX IF NOT EXISTS idx_engine_maint_vehicle    ON engine_maintenance(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_engine_maint_order      ON engine_maintenance(vehicle_id, display_order);
CREATE INDEX IF NOT EXISTS idx_vehicle_vehicle_type    ON vehicle(vehicle_type_id);

-- Dữ liệu vai trò ban đầu
INSERT OR IGNORE INTO roles (role_code, role_name) VALUES
    ('admin',      'Quản trị viên'),
    ('commander',  'Chỉ huy đơn vị'),
    ('technician', 'Thợ kỹ thuật'),
    ('inspector',  'Kiểm tra nghiệm thu'),
    ('viewer',     'Xem báo cáo');
