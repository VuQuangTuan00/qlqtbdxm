-- ============================================================
-- Migration 001: Schema khởi tạo hệ thống QLQT bảo dưỡng xe máy
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- --------------------------------
-- Đơn vị quân đội (có cấp bậc)
-- --------------------------------
CREATE TABLE IF NOT EXISTS units (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_code       TEXT NOT NULL UNIQUE,
    unit_name       TEXT NOT NULL,
    parent_unit_id  INTEGER REFERENCES units(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- --------------------------------
-- Vai trò người dùng
-- --------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    role_code   TEXT NOT NULL UNIQUE,
    role_name   TEXT NOT NULL
);

-- --------------------------------
-- Người dùng hệ thống
-- --------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    role_id         INTEGER NOT NULL REFERENCES roles(id),
    unit_id         INTEGER REFERENCES units(id),
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- --------------------------------
-- Trang bị / Xe máy
-- --------------------------------
CREATE TABLE IF NOT EXISTS equipments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_code      TEXT NOT NULL UNIQUE,
    equipment_name      TEXT NOT NULL,
    model               TEXT,
    serial_number       TEXT UNIQUE,
    year_of_manufacture INTEGER,
    unit_id             INTEGER REFERENCES units(id),
    status              TEXT NOT NULL DEFAULT 'active'
                            CHECK(status IN ('active','maintenance','inactive','decommissioned')),
    created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- --------------------------------
-- Kế hoạch bảo dưỡng
-- --------------------------------
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
    created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- --------------------------------
-- Bước quy trình bảo dưỡng (mẫu)
-- --------------------------------
CREATE TABLE IF NOT EXISTS maintenance_steps (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    maintenance_type        TEXT NOT NULL,
    step_order              INTEGER NOT NULL,
    step_name               TEXT NOT NULL,
    technical_requirement   TEXT,
    estimated_time          INTEGER, -- phút
    UNIQUE(maintenance_type, step_order)
);

-- --------------------------------
-- Nhật ký thực hiện bảo dưỡng
-- --------------------------------
CREATE TABLE IF NOT EXISTS maintenance_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id         INTEGER NOT NULL REFERENCES maintenance_plans(id),
    step_id         INTEGER NOT NULL REFERENCES maintenance_steps(id),
    performed_by    INTEGER NOT NULL REFERENCES users(id),
    start_time      TEXT,
    end_time        TEXT,
    result          TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','in_progress','completed','failed')),
    note            TEXT
);

-- --------------------------------
-- Biên bản nghiệm thu
-- --------------------------------
CREATE TABLE IF NOT EXISTS acceptance_records (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id         INTEGER NOT NULL UNIQUE REFERENCES maintenance_plans(id),
    accepted_by     INTEGER NOT NULL REFERENCES users(id),
    acceptance_date TEXT NOT NULL,
    conclusion      TEXT NOT NULL
                        CHECK(conclusion IN ('dat','khong_dat','can_kiem_tra_them')),
    note            TEXT
);

-- --------------------------------
-- Tệp đính kèm
-- --------------------------------
CREATE TABLE IF NOT EXISTS attachments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_type    TEXT NOT NULL CHECK(ref_type IN ('equipment','plan','log','acceptance')),
    ref_id      INTEGER NOT NULL,
    file_name   TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- --------------------------------
-- Mã QR trang bị
-- --------------------------------
CREATE TABLE IF NOT EXISTS qr_codes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id    INTEGER NOT NULL UNIQUE REFERENCES equipments(id),
    qr_value        TEXT NOT NULL UNIQUE,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- --------------------------------
-- Nhật ký kiểm toán
-- --------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER REFERENCES users(id),
    action          TEXT NOT NULL,
    target_table    TEXT NOT NULL,
    target_id       INTEGER,
    action_time     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- --------------------------------
-- Indexes
-- --------------------------------
CREATE INDEX IF NOT EXISTS idx_equipments_unit        ON equipments(unit_id);
CREATE INDEX IF NOT EXISTS idx_equipments_status      ON equipments(status);
CREATE INDEX IF NOT EXISTS idx_plans_equipment        ON maintenance_plans(equipment_id);
CREATE INDEX IF NOT EXISTS idx_plans_status           ON maintenance_plans(status);
CREATE INDEX IF NOT EXISTS idx_plans_created_by       ON maintenance_plans(created_by);
CREATE INDEX IF NOT EXISTS idx_logs_plan              ON maintenance_logs(plan_id);
CREATE INDEX IF NOT EXISTS idx_logs_performed_by      ON maintenance_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_user             ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_table            ON audit_logs(target_table);
CREATE INDEX IF NOT EXISTS idx_attachments_ref        ON attachments(ref_type, ref_id);

-- --------------------------------
-- Dữ liệu khởi tạo: Vai trò
-- --------------------------------
INSERT OR IGNORE INTO roles (role_code, role_name) VALUES
    ('admin',       'Quản trị viên'),
    ('commander',   'Chỉ huy đơn vị'),
    ('technician',  'Thợ kỹ thuật'),
    ('inspector',   'Kiểm tra nghiệm thu'),
    ('viewer',      'Xem báo cáo');
