-- Migration 007: vehicle_type thành bảng danh sách chung
-- Trước: vehicle_type(vehicle_type_id, vehicle_id, vehicle_type_name) — gắn theo từng xe
-- Sau:   vehicle_type(vehicle_type_id, vehicle_type_name)              — danh sách toàn cục
--        vehicle thêm vehicle_type_id FK                               — mỗi xe chọn 1 loại

-- Xóa cột vehicle_id khỏi vehicle_type (bảng trở thành danh sách tham chiếu)
ALTER TABLE vehicle_type DROP COLUMN IF EXISTS vehicle_id;

-- Thêm vehicle_type_id vào bảng vehicle (FK, nullable — xe có thể chưa phân loại)
ALTER TABLE vehicle
  ADD COLUMN IF NOT EXISTS vehicle_type_id INTEGER
    REFERENCES vehicle_type(vehicle_type_id) ON DELETE SET NULL;

-- Bỏ index cũ (liên kết vehicle_id trong vehicle_type, không còn hợp lệ)
DROP INDEX IF EXISTS idx_vehicle_type_vehicle;

-- Index mới cho FK từ vehicle
CREATE INDEX IF NOT EXISTS idx_vehicle_vehicle_type ON vehicle(vehicle_type_id);
