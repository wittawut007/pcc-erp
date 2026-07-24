-- Migration: 016_backup_system.sql
-- Description: Automatic Database Backup System — tables, procedures, and RLS policies

-- ─── 1. BACKUP LOGS TABLE ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backup_logs (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  backup_type         TEXT NOT NULL CHECK (backup_type IN ('database', 'storage', 'full')),
  status              TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  triggered_by        TEXT NOT NULL,          -- 'auto' | 'manual:<user_id>'
  file_name           TEXT,                   -- ชื่อไฟล์ backup ใน Supabase Storage
  file_size_bytes     BIGINT,
  storage_path        TEXT,                   -- path ใน bucket backups
  backup_started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  backup_finished_at  TIMESTAMPTZ,
  duration_seconds    INTEGER,
  error_message       TEXT,
  metadata            JSONB                   -- table row counts, version info ฯลฯ
);

-- ─── 2. BACKUP SCHEDULE CONFIG TABLE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backup_schedule_config (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  is_enabled          BOOLEAN NOT NULL DEFAULT true,
  schedule_hour       INTEGER NOT NULL DEFAULT 2 CHECK (schedule_hour BETWEEN 0 AND 23),   -- เวลา backup (ชั่วโมง UTC+7)
  schedule_minute     INTEGER NOT NULL DEFAULT 0 CHECK (schedule_minute BETWEEN 0 AND 59),
  retention_days      INTEGER NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 365),
  backup_types        TEXT[] NOT NULL DEFAULT ARRAY['database'],
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID REFERENCES auth.users(id)
);

-- เพิ่ม default config (1 row เท่านั้น)
INSERT INTO backup_schedule_config (is_enabled, schedule_hour, schedule_minute, retention_days, backup_types)
VALUES (true, 2, 0, 30, ARRAY['database'])
ON CONFLICT DO NOTHING;

-- ─── 3. INDEXES ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_backup_logs_status          ON backup_logs (status);
CREATE INDEX IF NOT EXISTS idx_backup_logs_backup_type     ON backup_logs (backup_type);
CREATE INDEX IF NOT EXISTS idx_backup_logs_started_at      ON backup_logs (backup_started_at DESC);

-- ─── 4. RLS POLICIES ─────────────────────────────────────────────────────────
ALTER TABLE backup_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_schedule_config ENABLE ROW LEVEL SECURITY;

-- backup_logs: Admin และ super_admin (ซึ่งตอนนี้คือ admin เพียง role เดียวที่มี '*')
-- อ่านได้เฉพาะ admin
CREATE POLICY "backup_logs_select_admin"
  ON backup_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.is_active = true
    )
  );

-- insert ได้เฉพาะ service_role (server-side) — ไม่อนุญาต client insert โดยตรง
CREATE POLICY "backup_logs_insert_service"
  ON backup_logs FOR INSERT
  WITH CHECK (false); -- ต้องใช้ service_role เท่านั้น (bypass RLS)

-- update ได้เฉพาะ service_role — ไม่อนุญาต client update
CREATE POLICY "backup_logs_update_service"
  ON backup_logs FOR UPDATE
  USING (false);

-- backup_schedule_config: admin อ่าน+แก้ไขได้
CREATE POLICY "backup_schedule_select_admin"
  ON backup_schedule_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.is_active = true
    )
  );

CREATE POLICY "backup_schedule_update_admin"
  ON backup_schedule_config FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.is_active = true
    )
  );

-- ─── 5. STORED PROCEDURES ────────────────────────────────────────────────────

-- 5a. Procedure: สร้าง backup log record (ใช้จาก server-side ผ่าน service_role)
CREATE OR REPLACE FUNCTION create_backup_log(
  p_backup_type  TEXT,
  p_triggered_by TEXT
)
RETURNS UUID
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO backup_logs (backup_type, status, triggered_by)
  VALUES (p_backup_type, 'running', p_triggered_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 5b. Procedure: อัปเดต backup log เมื่อสำเร็จ
CREATE OR REPLACE FUNCTION complete_backup_log(
  p_id              UUID,
  p_file_name       TEXT,
  p_file_size_bytes BIGINT,
  p_storage_path    TEXT,
  p_metadata        JSONB DEFAULT NULL
)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE backup_logs
  SET
    status             = 'success',
    file_name          = p_file_name,
    file_size_bytes    = p_file_size_bytes,
    storage_path       = p_storage_path,
    backup_finished_at = now(),
    duration_seconds   = EXTRACT(EPOCH FROM (now() - backup_started_at))::INTEGER,
    metadata           = p_metadata
  WHERE id = p_id;
END;
$$;

-- 5c. Procedure: อัปเดต backup log เมื่อล้มเหลว
CREATE OR REPLACE FUNCTION fail_backup_log(
  p_id            UUID,
  p_error_message TEXT
)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE backup_logs
  SET
    status             = 'failed',
    error_message      = p_error_message,
    backup_finished_at = now(),
    duration_seconds   = EXTRACT(EPOCH FROM (now() - backup_started_at))::INTEGER
  WHERE id = p_id;
END;
$$;

-- 5d. Procedure: ลบ backup logs ที่เก่าเกิน retention_days
CREATE OR REPLACE FUNCTION cleanup_old_backup_logs(p_retention_days INTEGER DEFAULT 30)
RETURNS INTEGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM backup_logs
  WHERE backup_started_at < NOW() - MAKE_INTERVAL(days => p_retention_days)
    AND status IN ('success', 'failed');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- 5e. Function: ดึง snapshot ข้อมูลสถิติ (สำหรับบันทึกใน backup metadata)
CREATE OR REPLACE FUNCTION get_backup_metadata_snapshot()
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'snapshot_at',        now(),
    'profiles_count',     (SELECT COUNT(*) FROM profiles),
    'products_count',     (SELECT COUNT(*) FROM products),
    'raw_materials_count',(SELECT COUNT(*) FROM raw_materials),
    'production_plans_count', (SELECT COUNT(*) FROM production_plans),
    'job_orders_count',   (SELECT COUNT(*) FROM job_orders),
    'qc_inspections_count', (SELECT COUNT(*) FROM qc_inspections),
    'fg_inventory_count', (SELECT COUNT(*) FROM fg_inventory),
    'activity_logs_count',(SELECT COUNT(*) FROM activity_logs)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- ─── 6. GRANT Permissions (service_role ใช้ RPC เหล่านี้ได้) ─────────────────
REVOKE EXECUTE ON FUNCTION create_backup_log(TEXT, TEXT)       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION complete_backup_log(UUID, TEXT, BIGINT, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fail_backup_log(UUID, TEXT)         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cleanup_old_backup_logs(INTEGER)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_backup_metadata_snapshot()      FROM PUBLIC;

GRANT EXECUTE ON FUNCTION create_backup_log(TEXT, TEXT)        TO service_role;
GRANT EXECUTE ON FUNCTION create_backup_log(TEXT, TEXT)        TO postgres;
GRANT EXECUTE ON FUNCTION complete_backup_log(UUID, TEXT, BIGINT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION complete_backup_log(UUID, TEXT, BIGINT, TEXT, JSONB) TO postgres;
GRANT EXECUTE ON FUNCTION fail_backup_log(UUID, TEXT)          TO service_role;
GRANT EXECUTE ON FUNCTION fail_backup_log(UUID, TEXT)          TO postgres;
GRANT EXECUTE ON FUNCTION cleanup_old_backup_logs(INTEGER)     TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_backup_logs(INTEGER)     TO postgres;
GRANT EXECUTE ON FUNCTION get_backup_metadata_snapshot()       TO service_role;
GRANT EXECUTE ON FUNCTION get_backup_metadata_snapshot()       TO postgres;
