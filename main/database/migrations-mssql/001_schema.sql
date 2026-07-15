-- ============================================================
-- Migration 001: Schema đầy đủ hệ thống QLQT Bảo Dưỡng Xe Máy
-- SQL Server (T-SQL) — schema cuối cùng sau tất cả PG migrations
-- ============================================================

-- ----------------------------------------------------------------
-- Đơn vị quân đội (tự tham chiếu)
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'units' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE units (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    unit_code      NVARCHAR(50)  NOT NULL,
    unit_name      NVARCHAR(200) NOT NULL,
    parent_unit_id INT           NULL,
    created_at     DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT uq_units_code UNIQUE (unit_code)
  );
END
GO

-- Thêm FK tự tham chiếu sau khi bảng đã tồn tại
IF NOT EXISTS (
  SELECT * FROM sys.foreign_keys
  WHERE name = 'fk_units_parent' AND parent_object_id = OBJECT_ID('units')
)
  ALTER TABLE units
    ADD CONSTRAINT fk_units_parent
      FOREIGN KEY (parent_unit_id) REFERENCES units(id) ON DELETE SET NULL;
GO

-- ----------------------------------------------------------------
-- Vai trò người dùng
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'roles' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE roles (
    id        INT IDENTITY(1,1) PRIMARY KEY,
    role_code NVARCHAR(50)  NOT NULL,
    role_name NVARCHAR(100) NOT NULL,
    CONSTRAINT uq_roles_code UNIQUE (role_code)
  );
END
GO

-- ----------------------------------------------------------------
-- Loại hình trang bị (danh sách tham chiếu toàn cục)
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'vehicle_type' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE vehicle_type (
    vehicle_type_id   INT IDENTITY(1,1) PRIMARY KEY,
    vehicle_type_name NVARCHAR(200) NOT NULL
  );
END
GO

-- ----------------------------------------------------------------
-- Loại xe (Danh sách trang bị)
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'vehicle' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE vehicle (
    vehicle_id      INT IDENTITY(1,1) PRIMARY KEY,
    vehicle_name    NVARCHAR(200) NOT NULL,
    img_name        NVARCHAR(255) NULL,
    img_path        NVARCHAR(MAX) NULL,
    is_active       BIT           NOT NULL DEFAULT 1,
    vehicle_type_id INT           NULL,
    updated_at      DATETIME2     NULL DEFAULT GETDATE(),
    CONSTRAINT fk_vehicle_type FOREIGN KEY (vehicle_type_id)
      REFERENCES vehicle_type(vehicle_type_id) ON DELETE SET NULL
  );
END
GO

-- ----------------------------------------------------------------
-- Hạng mục bảo dưỡng động cơ
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'engine_maintenance' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE engine_maintenance (
    engine_maintenance_id  INT IDENTITY(1,1) PRIMARY KEY,
    vehicle_id             INT           NOT NULL,
    maintenance_name       NVARCHAR(200) NOT NULL,
    display_order          INT           NOT NULL DEFAULT 0,
    tech_process_file_name NVARCHAR(255) NULL,
    tech_process_file_path NVARCHAR(MAX) NULL,
    norm_ktkt_file_name    NVARCHAR(255) NULL,
    norm_ktkt_file_path    NVARCHAR(MAX) NULL,
    CONSTRAINT fk_engmaint_vehicle FOREIGN KEY (vehicle_id)
      REFERENCES vehicle(vehicle_id) ON DELETE CASCADE
  );
END
GO

-- ----------------------------------------------------------------
-- Người dùng hệ thống
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE users (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    username      NVARCHAR(100) NOT NULL,
    password_hash NVARCHAR(MAX) NOT NULL,
    full_name     NVARCHAR(200) NOT NULL,
    role_id       INT           NOT NULL,
    unit_id       INT           NULL,
    is_active     BIT           NOT NULL DEFAULT 1,
    created_at    DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id),
    CONSTRAINT fk_users_unit FOREIGN KEY (unit_id) REFERENCES units(id)
  );
END
GO

-- ----------------------------------------------------------------
-- Trang bị / Xe máy
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'equipments' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE equipments (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    equipment_code      NVARCHAR(50)  NOT NULL,
    equipment_name      NVARCHAR(200) NOT NULL,
    model               NVARCHAR(100) NULL,
    serial_number       NVARCHAR(100) NULL,
    year_of_manufacture INT           NULL,
    unit_id             INT           NULL,
    status              NVARCHAR(30)  NOT NULL DEFAULT 'san_sang',
    created_at          DATETIME2     NOT NULL DEFAULT GETDATE(),
    vehicle_id          INT           NULL,
    CONSTRAINT uq_equipments_code   UNIQUE (equipment_code),
    CONSTRAINT uq_equipments_serial UNIQUE (serial_number),
    CONSTRAINT chk_equip_status CHECK (status IN (
      'san_sang','bao_duong','hong_su_chua','ngung_hoat_dong',
      'active','maintenance','inactive','decommissioned'
    )),
    CONSTRAINT fk_equip_unit    FOREIGN KEY (unit_id)    REFERENCES units(id),
    CONSTRAINT fk_equip_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id) ON DELETE SET NULL
  );
END
GO

-- ----------------------------------------------------------------
-- Bước quy trình bảo dưỡng (mẫu)
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'maintenance_steps' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE maintenance_steps (
    id                    INT IDENTITY(1,1) PRIMARY KEY,
    maintenance_type      NVARCHAR(30)  NOT NULL,
    step_order            INT           NOT NULL,
    step_name             NVARCHAR(200) NOT NULL,
    technical_requirement NVARCHAR(MAX) NULL,
    estimated_time        INT           NULL,
    CONSTRAINT uq_maint_step UNIQUE (maintenance_type, step_order)
  );
END
GO

-- ----------------------------------------------------------------
-- Kế hoạch bảo dưỡng
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'maintenance_plans' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE maintenance_plans (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    plan_code        NVARCHAR(50)  NOT NULL,
    equipment_id     INT           NOT NULL,
    maintenance_type NVARCHAR(30)  NOT NULL,
    planned_date     DATE          NOT NULL,
    created_by       INT           NOT NULL,
    approved_by      INT           NULL,
    status           NVARCHAR(30)  NOT NULL DEFAULT 'pending',
    created_at       DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT uq_plan_code UNIQUE (plan_code),
    CONSTRAINT chk_plan_type CHECK (maintenance_type IN ('dinh_ky','dot_xuat','sua_chua','kiem_tra')),
    CONSTRAINT chk_plan_status CHECK (status IN ('pending','approved','in_progress','completed','cancelled')),
    CONSTRAINT fk_plan_equip   FOREIGN KEY (equipment_id) REFERENCES equipments(id),
    CONSTRAINT fk_plan_creator FOREIGN KEY (created_by)   REFERENCES users(id),
    CONSTRAINT fk_plan_approver FOREIGN KEY (approved_by) REFERENCES users(id)
  );
END
GO

-- ----------------------------------------------------------------
-- Nhật ký thực hiện bảo dưỡng
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'maintenance_logs' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE maintenance_logs (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    plan_id      INT           NOT NULL,
    step_id      INT           NOT NULL,
    performed_by INT           NOT NULL,
    start_time   DATETIME2     NULL,
    end_time     DATETIME2     NULL,
    result       NVARCHAR(MAX) NULL,
    status       NVARCHAR(30)  NOT NULL DEFAULT 'pending',
    note         NVARCHAR(MAX) NULL,
    CONSTRAINT chk_log_status CHECK (status IN ('pending','in_progress','completed','failed')),
    CONSTRAINT fk_log_plan FOREIGN KEY (plan_id)      REFERENCES maintenance_plans(id),
    CONSTRAINT fk_log_step FOREIGN KEY (step_id)      REFERENCES maintenance_steps(id),
    CONSTRAINT fk_log_user FOREIGN KEY (performed_by) REFERENCES users(id)
  );
END
GO

-- ----------------------------------------------------------------
-- Biên bản nghiệm thu
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'acceptance_records' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE acceptance_records (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    plan_id         INT           NOT NULL,
    accepted_by     INT           NOT NULL,
    acceptance_date DATE          NOT NULL,
    conclusion      NVARCHAR(30)  NOT NULL,
    note            NVARCHAR(MAX) NULL,
    CONSTRAINT uq_accept_plan UNIQUE (plan_id),
    CONSTRAINT chk_conclusion CHECK (conclusion IN ('dat','khong_dat','can_kiem_tra_them')),
    CONSTRAINT fk_accept_plan FOREIGN KEY (plan_id)     REFERENCES maintenance_plans(id),
    CONSTRAINT fk_accept_user FOREIGN KEY (accepted_by) REFERENCES users(id)
  );
END
GO

-- ----------------------------------------------------------------
-- Tệp đính kèm
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'attachments' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE attachments (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    ref_type    NVARCHAR(30)  NOT NULL,
    ref_id      INT           NOT NULL,
    file_name   NVARCHAR(255) NOT NULL,
    file_path   NVARCHAR(MAX) NOT NULL,
    uploaded_by INT           NOT NULL,
    uploaded_at DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT chk_attach_ref CHECK (ref_type IN ('equipment','plan','log','acceptance')),
    CONSTRAINT fk_attach_user FOREIGN KEY (uploaded_by) REFERENCES users(id)
  );
END
GO

-- ----------------------------------------------------------------
-- Mã QR trang bị
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'qr_codes' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE qr_codes (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    equipment_id INT           NOT NULL,
    qr_value     NVARCHAR(MAX) NOT NULL,
    created_at   DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT uq_qr_equip UNIQUE (equipment_id),
    CONSTRAINT fk_qr_equip FOREIGN KEY (equipment_id) REFERENCES equipments(id)
  );
END
GO

-- ----------------------------------------------------------------
-- Nhật ký kiểm toán
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'audit_logs' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE audit_logs (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    user_id      INT           NULL,
    action       NVARCHAR(50)  NOT NULL,
    target_table NVARCHAR(100) NOT NULL,
    target_id    INT           NULL,
    action_time  DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id)
  );
END
GO

-- ----------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_units_parent' AND object_id = OBJECT_ID('units'))
  CREATE INDEX idx_units_parent ON units(parent_unit_id);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_users_role' AND object_id = OBJECT_ID('users'))
  CREATE INDEX idx_users_role ON users(role_id);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_users_unit' AND object_id = OBJECT_ID('users'))
  CREATE INDEX idx_users_unit ON users(unit_id);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_equip_unit' AND object_id = OBJECT_ID('equipments'))
  CREATE INDEX idx_equip_unit ON equipments(unit_id);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_equip_status' AND object_id = OBJECT_ID('equipments'))
  CREATE INDEX idx_equip_status ON equipments(status);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_equip_vehicle' AND object_id = OBJECT_ID('equipments'))
  CREATE INDEX idx_equip_vehicle ON equipments(vehicle_id);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_vehicle_active' AND object_id = OBJECT_ID('vehicle'))
  CREATE INDEX idx_vehicle_active ON vehicle(is_active);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_vehicle_type' AND object_id = OBJECT_ID('vehicle'))
  CREATE INDEX idx_vehicle_type ON vehicle(vehicle_type_id);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_vehicle_updated' AND object_id = OBJECT_ID('vehicle'))
  CREATE INDEX idx_vehicle_updated ON vehicle(updated_at DESC);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_engmaint_vehicle' AND object_id = OBJECT_ID('engine_maintenance'))
  CREATE INDEX idx_engmaint_vehicle ON engine_maintenance(vehicle_id);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_engmaint_order' AND object_id = OBJECT_ID('engine_maintenance'))
  CREATE INDEX idx_engmaint_order ON engine_maintenance(vehicle_id, display_order);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_plans_equip' AND object_id = OBJECT_ID('maintenance_plans'))
  CREATE INDEX idx_plans_equip ON maintenance_plans(equipment_id);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_plans_status' AND object_id = OBJECT_ID('maintenance_plans'))
  CREATE INDEX idx_plans_status ON maintenance_plans(status);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_logs_plan' AND object_id = OBJECT_ID('maintenance_logs'))
  CREATE INDEX idx_logs_plan ON maintenance_logs(plan_id);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_audit_user' AND object_id = OBJECT_ID('audit_logs'))
  CREATE INDEX idx_audit_user ON audit_logs(user_id);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_audit_table' AND object_id = OBJECT_ID('audit_logs'))
  CREATE INDEX idx_audit_table ON audit_logs(target_table);
GO

-- ----------------------------------------------------------------
-- Dữ liệu khởi tạo: Vai trò
-- ----------------------------------------------------------------
MERGE roles AS target
USING (VALUES
  ('admin',      N'Quản trị viên'),
  ('commander',  N'Chỉ huy đơn vị'),
  ('technician', N'Thợ kỹ thuật'),
  ('inspector',  N'Kiểm tra nghiệm thu'),
  ('viewer',     N'Xem báo cáo')
) AS source (role_code, role_name)
ON target.role_code = source.role_code
WHEN NOT MATCHED THEN
  INSERT (role_code, role_name) VALUES (source.role_code, source.role_name);
GO
