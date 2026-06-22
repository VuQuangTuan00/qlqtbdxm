-- ============================================================
-- Migration 005: Bỏ các cột không sử dụng trong vehicle & engine_maintenance
-- ============================================================

ALTER TABLE vehicle
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS created_at,
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS origin_country,
  DROP COLUMN IF EXISTS manufacturer,
  DROP COLUMN IF EXISTS description;

ALTER TABLE engine_maintenance
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS created_at,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS norm_ktkt_uploaded_at,
  DROP COLUMN IF EXISTS norm_ktkt_uploaded_by,
  DROP COLUMN IF EXISTS tech_process_uploaded_by,
  DROP COLUMN IF EXISTS tech_process_uploaded_at;
