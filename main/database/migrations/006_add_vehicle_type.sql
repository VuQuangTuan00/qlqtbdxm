-- ============================================================
-- Migration 006: Thêm bảng vehicle_type (loại hình trang bị)
-- ============================================================

CREATE TABLE IF NOT EXISTS vehicle_type (
    vehicle_type_id   SERIAL PRIMARY KEY,
    vehicle_id        INTEGER NOT NULL REFERENCES vehicle(vehicle_id) ON DELETE CASCADE,
    vehicle_type_name VARCHAR(200) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicle_type_vehicle ON vehicle_type(vehicle_id);
