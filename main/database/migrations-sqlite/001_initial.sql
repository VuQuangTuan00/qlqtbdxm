CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_code TEXT NOT NULL UNIQUE,
  role_name TEXT NOT NULL
);

CREATE TABLE units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_code TEXT NOT NULL UNIQUE,
  unit_name TEXT NOT NULL,
  parent_unit_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (parent_unit_id) REFERENCES units(id) ON DELETE RESTRICT
);

CREATE TABLE vehicle_type (
  vehicle_type_id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_type_name TEXT NOT NULL
);

CREATE TABLE vehicle (
  vehicle_id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_name TEXT NOT NULL,
  img_name TEXT,
  img_path TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  vehicle_type_id INTEGER,
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_type(vehicle_type_id) ON DELETE SET NULL
);

CREATE TABLE engine_maintenance (
  engine_maintenance_id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL,
  maintenance_name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  tech_process_file_name TEXT,
  tech_process_file_path TEXT,
  norm_ktkt_file_name TEXT,
  norm_ktkt_file_path TEXT,
  FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id) ON DELETE CASCADE
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_id INTEGER NOT NULL,
  unit_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT
);

CREATE TABLE equipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_code TEXT NOT NULL UNIQUE,
  equipment_name TEXT NOT NULL,
  model TEXT,
  serial_number TEXT UNIQUE,
  year_of_manufacture INTEGER,
  unit_id INTEGER,
  status TEXT NOT NULL DEFAULT 'san_sang' CHECK (status IN (
    'san_sang','bao_duong','hong_su_chua','ngung_hoat_dong',
    'active','maintenance','inactive','decommissioned'
  )),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  vehicle_id INTEGER,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
  FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id) ON DELETE SET NULL
);

CREATE TABLE maintenance_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  maintenance_type TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  technical_requirement TEXT,
  estimated_time INTEGER,
  UNIQUE (maintenance_type, step_order)
);

CREATE TABLE maintenance_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_code TEXT NOT NULL UNIQUE,
  equipment_id INTEGER NOT NULL,
  maintenance_type TEXT NOT NULL CHECK (maintenance_type IN ('dinh_ky','dot_xuat','sua_chua','kiem_tra')),
  planned_date TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  approved_by INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','in_progress','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (equipment_id) REFERENCES equipments(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE maintenance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  step_id INTEGER NOT NULL,
  performed_by INTEGER NOT NULL,
  start_time TEXT,
  end_time TEXT,
  result TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','failed')),
  note TEXT,
  FOREIGN KEY (plan_id) REFERENCES maintenance_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (step_id) REFERENCES maintenance_steps(id) ON DELETE RESTRICT,
  FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE acceptance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL UNIQUE,
  accepted_by INTEGER NOT NULL,
  acceptance_date TEXT NOT NULL,
  conclusion TEXT NOT NULL CHECK (conclusion IN ('dat','khong_dat','can_kiem_tra_them')),
  note TEXT,
  FOREIGN KEY (plan_id) REFERENCES maintenance_plans(id) ON DELETE RESTRICT,
  FOREIGN KEY (accepted_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_type TEXT NOT NULL CHECK (ref_type IN ('equipment','plan','log','acceptance')),
  ref_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE qr_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id INTEGER NOT NULL UNIQUE,
  qr_value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (equipment_id) REFERENCES equipments(id) ON DELETE CASCADE
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id INTEGER,
  action_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_units_parent ON units(parent_unit_id);
CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_users_unit ON users(unit_id);
CREATE INDEX idx_equip_unit ON equipments(unit_id);
CREATE INDEX idx_equip_status ON equipments(status);
CREATE INDEX idx_equip_vehicle ON equipments(vehicle_id);
CREATE INDEX idx_vehicle_active ON vehicle(is_active);
CREATE INDEX idx_vehicle_type ON vehicle(vehicle_type_id);
CREATE INDEX idx_vehicle_updated ON vehicle(updated_at DESC);
CREATE INDEX idx_engmaint_vehicle ON engine_maintenance(vehicle_id);
CREATE INDEX idx_engmaint_order ON engine_maintenance(vehicle_id, display_order);
CREATE INDEX idx_plans_equip ON maintenance_plans(equipment_id);
CREATE INDEX idx_plans_status ON maintenance_plans(status);
CREATE INDEX idx_logs_plan ON maintenance_logs(plan_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_table ON audit_logs(target_table);

INSERT INTO roles (role_code, role_name) VALUES
  ('admin','Quản trị viên'),
  ('commander','Chỉ huy đơn vị'),
  ('technician','Thợ kỹ thuật'),
  ('inspector','Kiểm tra nghiệm thu'),
  ('viewer','Xem báo cáo');

INSERT INTO maintenance_steps
  (maintenance_type, step_order, step_name, technical_requirement, estimated_time)
VALUES
  ('dinh_ky',1,'Kiểm tra tổng quát','Kiểm tra ngoại quan, rò rỉ dầu mỡ',30),
  ('dinh_ky',2,'Kiểm tra và thay dầu động cơ','Dầu 15W40, đúng tiêu chuẩn nhà sản xuất',45),
  ('dinh_ky',3,'Thay lọc dầu','Lọc dầu chính hãng',20),
  ('dinh_ky',4,'Kiểm tra hệ thống phanh','Má phanh ≥ 4mm, dầu phanh đầy mức',30),
  ('dinh_ky',5,'Kiểm tra áp suất lốp','Áp suất theo quy định ±0.2 bar',15),
  ('dinh_ky',6,'Kiểm tra hệ thống điện','Acquy đủ điện, dây điện không rò rỉ',25),
  ('dinh_ky',7,'Tra dầu mỡ truyền động','Theo bảng bôi trơn',40),
  ('dinh_ky',8,'Kiểm tra đèn tín hiệu','Tất cả đèn hoạt động đúng',15),
  ('dinh_ky',9,'Vệ sinh và hoàn thiện','Sạch, gọn, đẹp',20),
  ('dinh_ky',10,'Chạy thử và nghiệm thu','Xe hoạt động ổn định, không có tiếng kêu bất thường',30),
  ('dot_xuat',1,'Xác định nguyên nhân hư hỏng','Ghi chép đầy đủ triệu chứng',30),
  ('dot_xuat',2,'Tháo lắp và kiểm tra chi tiết','Theo quy trình kỹ thuật',60),
  ('dot_xuat',3,'Thay thế chi tiết hư hỏng','Chi tiết đúng chủng loại',90),
  ('dot_xuat',4,'Lắp ráp và kiểm tra','Lắp đúng moment xiết',60),
  ('dot_xuat',5,'Chạy thử và bàn giao','Hết hư hỏng, hoạt động bình thường',30),
  ('sua_chua',1,'Tiếp nhận và lập phiếu sửa chữa','Ghi đầy đủ tình trạng ban đầu',30),
  ('sua_chua',2,'Tháo rã tổng thành','Theo trình tự kỹ thuật',120),
  ('sua_chua',3,'Kiểm tra và phân loại chi tiết','Đo đạc theo tiêu chuẩn kỹ thuật',90),
  ('sua_chua',4,'Sửa chữa và phục hồi chi tiết','Đạt kích thước sửa chữa',180),
  ('sua_chua',5,'Lắp ráp tổng thành','Moment xiết theo quy định',120),
  ('sua_chua',6,'Chạy rà và điều chỉnh','Theo quy trình rà trơn',120),
  ('sua_chua',7,'Nghiệm thu kỹ thuật','Đạt tất cả chỉ tiêu kỹ thuật',60),
  ('kiem_tra',1,'Kiểm tra hồ sơ kỹ thuật','Hồ sơ đầy đủ, không thất lạc',20),
  ('kiem_tra',2,'Kiểm tra ngoại quan','Không có hư hỏng ngoại quan',20),
  ('kiem_tra',3,'Kiểm tra thông số kỹ thuật','Theo bảng thông số',45),
  ('kiem_tra',4,'Ghi kết quả và báo cáo','Ghi đầy đủ, chính xác',20);
