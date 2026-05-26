-- ============================================================
-- Migration 001: Schema khởi tạo hệ thống QLQT bảo dưỡng xe máy
-- PostgreSQL syntax
-- ============================================================

-- --------------------------------
-- Đơn vị quân đội (có cấp bậc)
-- --------------------------------
CREATE TABLE IF NOT EXISTS units (
    id              SERIAL PRIMARY KEY,
    unit_code       VARCHAR(50) NOT NULL UNIQUE,
    unit_name       VARCHAR(200) NOT NULL,
    parent_unit_id  INTEGER REFERENCES units(id) ON DELETE SET NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- --------------------------------
-- Vai trò người dùng
-- --------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    role_code   VARCHAR(50) NOT NULL UNIQUE,
    role_name   VARCHAR(100) NOT NULL
);

-- --------------------------------
-- Người dùng hệ thống
-- --------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(100) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    full_name       VARCHAR(200) NOT NULL,
    role_id         INTEGER NOT NULL REFERENCES roles(id),
    unit_id         INTEGER REFERENCES units(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- --------------------------------
-- Trang bị / Xe máy
-- --------------------------------
CREATE TABLE IF NOT EXISTS equipments (
    id                  SERIAL PRIMARY KEY,
    equipment_code      VARCHAR(50) NOT NULL UNIQUE,
    equipment_name      VARCHAR(200) NOT NULL,
    model               VARCHAR(100),
    serial_number       VARCHAR(100) UNIQUE,
    year_of_manufacture INTEGER,
    unit_id             INTEGER REFERENCES units(id),
    status              VARCHAR(30) NOT NULL DEFAULT 'san_sang'
                            CHECK(status IN ('san_sang','bao_duong','hong_su_chua','ngung_hoat_dong','active','maintenance','inactive','decommissioned')),
    created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- --------------------------------
-- Kế hoạch bảo dưỡng
-- --------------------------------
CREATE TABLE IF NOT EXISTS maintenance_plans (
    id                  SERIAL PRIMARY KEY,
    plan_code           VARCHAR(50) NOT NULL UNIQUE,
    equipment_id        INTEGER NOT NULL REFERENCES equipments(id),
    maintenance_type    VARCHAR(30) NOT NULL
                            CHECK(maintenance_type IN ('dinh_ky','dot_xuat','sua_chua','kiem_tra')),
    planned_date        DATE NOT NULL,
    created_by          INTEGER NOT NULL REFERENCES users(id),
    approved_by         INTEGER REFERENCES users(id),
    status              VARCHAR(30) NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending','approved','in_progress','completed','cancelled')),
    created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- --------------------------------
-- Bước quy trình bảo dưỡng (mẫu)
-- --------------------------------
CREATE TABLE IF NOT EXISTS maintenance_steps (
    id                      SERIAL PRIMARY KEY,
    maintenance_type        VARCHAR(30) NOT NULL,
    step_order              INTEGER NOT NULL,
    step_name               VARCHAR(200) NOT NULL,
    technical_requirement   TEXT,
    estimated_time          INTEGER,
    UNIQUE(maintenance_type, step_order)
);

-- --------------------------------
-- Nhật ký thực hiện bảo dưỡng
-- --------------------------------
CREATE TABLE IF NOT EXISTS maintenance_logs (
    id              SERIAL PRIMARY KEY,
    plan_id         INTEGER NOT NULL REFERENCES maintenance_plans(id),
    step_id         INTEGER NOT NULL REFERENCES maintenance_steps(id),
    performed_by    INTEGER NOT NULL REFERENCES users(id),
    start_time      TIMESTAMP,
    end_time        TIMESTAMP,
    result          TEXT,
    status          VARCHAR(30) NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','in_progress','completed','failed')),
    note            TEXT
);

-- --------------------------------
-- Biên bản nghiệm thu
-- --------------------------------
CREATE TABLE IF NOT EXISTS acceptance_records (
    id              SERIAL PRIMARY KEY,
    plan_id         INTEGER NOT NULL UNIQUE REFERENCES maintenance_plans(id),
    accepted_by     INTEGER NOT NULL REFERENCES users(id),
    acceptance_date DATE NOT NULL,
    conclusion      VARCHAR(30) NOT NULL
                        CHECK(conclusion IN ('dat','khong_dat','can_kiem_tra_them')),
    note            TEXT
);

-- --------------------------------
-- Tệp đính kèm
-- --------------------------------
CREATE TABLE IF NOT EXISTS attachments (
    id          SERIAL PRIMARY KEY,
    ref_type    VARCHAR(30) NOT NULL CHECK(ref_type IN ('equipment','plan','log','acceptance')),
    ref_id      INTEGER NOT NULL,
    file_name   VARCHAR(255) NOT NULL,
    file_path   TEXT NOT NULL,
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- --------------------------------
-- Mã QR trang bị
-- --------------------------------
CREATE TABLE IF NOT EXISTS qr_codes (
    id              SERIAL PRIMARY KEY,
    equipment_id    INTEGER NOT NULL UNIQUE REFERENCES equipments(id),
    qr_value        TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- --------------------------------
-- Nhật ký kiểm toán
-- --------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id),
    action          VARCHAR(50) NOT NULL,
    target_table    VARCHAR(100) NOT NULL,
    target_id       INTEGER,
    action_time     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- --------------------------------
-- Indexes
-- --------------------------------
CREATE INDEX IF NOT EXISTS idx_units_parent            ON units(parent_unit_id);
CREATE INDEX IF NOT EXISTS idx_users_role              ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_unit              ON users(unit_id);
CREATE INDEX IF NOT EXISTS idx_equipments_unit         ON equipments(unit_id);
CREATE INDEX IF NOT EXISTS idx_equipments_status       ON equipments(status);
CREATE INDEX IF NOT EXISTS idx_plans_equipment         ON maintenance_plans(equipment_id);
CREATE INDEX IF NOT EXISTS idx_plans_status            ON maintenance_plans(status);
CREATE INDEX IF NOT EXISTS idx_plans_created_by        ON maintenance_plans(created_by);
CREATE INDEX IF NOT EXISTS idx_plans_approved_by       ON maintenance_plans(approved_by);
CREATE INDEX IF NOT EXISTS idx_logs_plan               ON maintenance_logs(plan_id);
CREATE INDEX IF NOT EXISTS idx_logs_step               ON maintenance_logs(step_id);
CREATE INDEX IF NOT EXISTS idx_logs_performed_by       ON maintenance_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_acceptance_plan         ON acceptance_records(plan_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_accepted_by  ON acceptance_records(accepted_by);
CREATE INDEX IF NOT EXISTS idx_attachments_ref         ON attachments(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_qr_equipment            ON qr_codes(equipment_id);
CREATE INDEX IF NOT EXISTS idx_audit_user              ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_table             ON audit_logs(target_table);

-- --------------------------------
-- Dữ liệu khởi tạo: Vai trò
-- --------------------------------
INSERT INTO roles (role_code, role_name) VALUES
    ('admin',       'Quản trị viên'),
    ('commander',   'Chỉ huy đơn vị'),
    ('technician',  'Thợ kỹ thuật'),
    ('inspector',   'Kiểm tra nghiệm thu'),
    ('viewer',      'Xem báo cáo')
ON CONFLICT (role_code) DO NOTHING;
