-- Migration 008: Thêm updated_at vào bảng vehicle để hỗ trợ sắp xếp theo ngày sửa đổi

ALTER TABLE vehicle
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Gán giá trị mặc định cho các bản ghi cũ
UPDATE vehicle SET updated_at = NOW() WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_updated_at ON vehicle(updated_at DESC);
