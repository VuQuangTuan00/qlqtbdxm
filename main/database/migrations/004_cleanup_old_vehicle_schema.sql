-- ============================================================
-- Migration 004: Dọn dẹp kiến trúc cũ (vehicle_types, vehicle_maintenance_steps)
-- Chỉ chạy sau khi migration 003 đã tạo vehicle + engine_maintenance
-- ============================================================

-- Xóa bảng cũ (CASCADE sẽ tự xử lý FK)
DROP TABLE IF EXISTS vehicle_maintenance_steps CASCADE;
DROP TABLE IF EXISTS vehicle_types CASCADE;

-- Xóa cột liên kết cũ trong equipments
ALTER TABLE equipments DROP COLUMN IF EXISTS vehicle_type_id;
