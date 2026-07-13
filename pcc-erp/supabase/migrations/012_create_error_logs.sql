-- ============================================================
-- Migration 012: Create error_logs table
-- Purpose: เก็บ Server Action errors ถาวรใน Supabase
--          แทนการพึ่ง Vercel Log ที่หายหลัง 1 ชั่วโมง
-- ============================================================

CREATE TABLE IF NOT EXISTS public.error_logs (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now() NOT NULL,
  action      text NOT NULL,
  error_msg   text NOT NULL,
  error_code  text,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  context     jsonb
);

-- ดัชนีเพื่อค้นหาตามเวลา (Admin ใช้ดู log ล่าสุด)
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at
  ON public.error_logs(created_at DESC);

-- ดัชนีเพื่อ filter ตามชื่อ action
CREATE INDEX IF NOT EXISTS idx_error_logs_action
  ON public.error_logs(action);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- เฉพาะ Admin เท่านั้นที่อ่านได้
CREATE POLICY "admin_can_read_error_logs"
  ON public.error_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Server (service_role / server actions) INSERT ได้เสมอ
-- Note: INSERT ผ่าน service_role key bypass RLS อยู่แล้ว
-- แต่เพิ่ม policy ไว้รองรับกรณีใช้ anon/user key
CREATE POLICY "server_can_insert_error_logs"
  ON public.error_logs
  FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- Comment สำหรับ Documentation
-- ============================================================
COMMENT ON TABLE public.error_logs IS
  'บันทึก Server Action errors สำหรับ Debug — ลบ records เก่ากว่า 90 วันได้';
COMMENT ON COLUMN public.error_logs.action IS
  'ชื่อ Server Action function ที่เกิด error เช่น submitConcreteOrder';
COMMENT ON COLUMN public.error_logs.error_msg IS
  'ข้อความ error (err.message)';
COMMENT ON COLUMN public.error_logs.error_code IS
  'Supabase/PostgreSQL error code เช่น 23503 (FK violation)';
COMMENT ON COLUMN public.error_logs.context IS
  'ข้อมูลเพิ่มเติมช่วย reproduce bug เช่น { planId, orderId }';
