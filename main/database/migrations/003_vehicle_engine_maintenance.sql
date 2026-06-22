-- ============================================================
-- Migration 003: Danh Sách Trang Bị — vehicle + engine_maintenance
-- Thay thế vehicle_types / vehicle_maintenance_steps (nếu đã tồn tại)
-- ============================================================

-- --------------------------------
-- Loại xe (Vehicle)
-- --------------------------------
CREATE TABLE IF NOT EXISTS vehicle (
    vehicle_id      SERIAL PRIMARY KEY,
    vehicle_name    VARCHAR(200) NOT NULL,
    img_name        VARCHAR(255),
    img_path        TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- --------------------------------
-- Hạng mục bảo dưỡng động cơ — dùng chung cho 2 tab
-- Mỗi hạng mục có 2 cặp file riêng (Quy trình công nghệ / Định mức KT-KT)
-- --------------------------------
CREATE TABLE IF NOT EXISTS engine_maintenance (
    engine_maintenance_id   SERIAL PRIMARY KEY,
    vehicle_id              INTEGER NOT NULL REFERENCES vehicle(vehicle_id) ON DELETE CASCADE,
    maintenance_name        VARCHAR(200) NOT NULL,
    display_order           INTEGER NOT NULL DEFAULT 0,

    tech_process_file_name  VARCHAR(255),
    tech_process_file_path  TEXT,

    norm_ktkt_file_name     VARCHAR(255),
    norm_ktkt_file_path     TEXT
);

-- --------------------------------
-- Loại hình trang bị (vehicle_type)
-- --------------------------------
CREATE TABLE IF NOT EXISTS vehicle_type (
    vehicle_type_id   SERIAL PRIMARY KEY,
    vehicle_id        INTEGER NOT NULL REFERENCES vehicle(vehicle_id) ON DELETE CASCADE,
    vehicle_type_name VARCHAR(200) NOT NULL
);

-- --------------------------------
-- Liên kết trang bị với loại xe
-- --------------------------------
ALTER TABLE equipments
    ADD COLUMN IF NOT EXISTS vehicle_id INTEGER REFERENCES vehicle(vehicle_id) ON DELETE SET NULL;

-- --------------------------------
-- Indexes
-- --------------------------------
CREATE INDEX IF NOT EXISTS idx_vehicle_active            ON vehicle(is_active);
CREATE INDEX IF NOT EXISTS idx_engine_maint_vehicle       ON engine_maintenance(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_engine_maint_order         ON engine_maintenance(vehicle_id, display_order);
CREATE INDEX IF NOT EXISTS idx_equipments_vehicle         ON equipments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_type_vehicle       ON vehicle_type(vehicle_id);

-- --------------------------------
-- Migrate dữ liệu cũ từ vehicle_types / vehicle_maintenance_steps
-- (nếu các bảng này tồn tại từ lần migration trước — bỏ qua nếu chưa từng tạo)
-- --------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vehicle_types') THEN

    -- Copy loại xe cũ sang bảng vehicle mới
    INSERT INTO vehicle (vehicle_name, img_path, is_active)
    SELECT type_name, image_url, is_active
    FROM vehicle_types
    ON CONFLICT DO NOTHING;

    -- Cập nhật equipments.vehicle_id dựa trên tên loại xe trùng khớp
    UPDATE equipments e
    SET vehicle_id = v.vehicle_id
    FROM vehicle_types vt
    JOIN vehicle v ON v.vehicle_name = vt.type_name
    WHERE e.vehicle_type_id = vt.id AND e.vehicle_id IS NULL;

    -- Gộp các bước quy trình cũ (theo maintenance_type) thành hạng mục đơn giản
    -- Mỗi step cũ trở thành 1 hạng mục (không có file — cần admin upload lại)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vehicle_maintenance_steps') THEN
      INSERT INTO engine_maintenance (vehicle_id, maintenance_name, display_order)
      SELECT v.vehicle_id,
             vms.step_name || ' (' || vms.maintenance_type || ')',
             vms.step_order
      FROM vehicle_maintenance_steps vms
      JOIN vehicle_types vt ON vt.id = vms.vehicle_type_id
      JOIN vehicle v ON v.vehicle_name = vt.type_name
      ON CONFLICT DO NOTHING;
    END IF;

  END IF;
END $$;

-- --------------------------------
-- Dữ liệu mẫu (chỉ chèn nếu bảng vehicle còn trống)
-- --------------------------------
DO $$
DECLARE
  v_zil INTEGER;
  v_btr INTEGER;
  cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt FROM vehicle;
  IF cnt = 0 THEN

    INSERT INTO vehicle (vehicle_name)
    VALUES ('Xe ô tô ZIL-131')
    RETURNING vehicle_id INTO v_zil;

    INSERT INTO vehicle (vehicle_name)
    VALUES ('Xe bọc thép chở quân BTR-80')
    RETURNING vehicle_id INTO v_btr;

    INSERT INTO engine_maintenance (vehicle_id, maintenance_name, display_order) VALUES
      (v_zil, 'Bảo dưỡng động cơ',     1),
      (v_zil, 'Bảo dưỡng hộp số',      2),
      (v_zil, 'Hệ thống phanh',        3),
      (v_zil, 'Hệ thống điện',         4),
      (v_zil, 'Hệ thống làm mát',      5);

    INSERT INTO engine_maintenance (vehicle_id, maintenance_name, display_order) VALUES
      (v_btr, 'Bảo dưỡng động cơ KAMAZ-7403', 1),
      (v_btr, 'Hệ thống truyền động 8x8',      2),
      (v_btr, 'Hệ thống bơi',                  3),
      (v_btr, 'Hệ thống NBC (phòng hóa)',      4);

  END IF;
END $$;
