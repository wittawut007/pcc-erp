-- ============================================================
-- PCC ERP — Migration 023: Add Missing Columns to Products & Raw Materials
-- วันที่: 2026-08-01
-- ปัญหา: มีคอลัมน์หลายตัวที่ถูกเพิ่มโดยตรงบน Supabase Cloud
--        แต่ไม่มีใน migration files ทำให้ VPS (Self-hosted) ขาดคอลัมน์เหล่านั้น
-- ============================================================

-- ─── 1. เพิ่ม Columns ที่ขาดหายในตาราง products ─────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS length         NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS wire_per_unit  NUMERIC(10, 4),
  ADD COLUMN IF NOT EXISTS mesh_per_unit  NUMERIC(10, 4),
  ADD COLUMN IF NOT EXISTS rebar_per_unit NUMERIC(10, 4),
  ADD COLUMN IF NOT EXISTS concrete_group TEXT;

COMMENT ON COLUMN public.products.description    IS 'คำอธิบายสินค้าเพิ่มเติม';
COMMENT ON COLUMN public.products.length         IS 'ความยาวสินค้า (เมตร)';
COMMENT ON COLUMN public.products.wire_per_unit  IS 'ลวดที่ใช้ต่อหน่วย (กก.)';
COMMENT ON COLUMN public.products.mesh_per_unit  IS 'เมชที่ใช้ต่อหน่วย (ตร.ม.)';
COMMENT ON COLUMN public.products.rebar_per_unit IS 'เหล็กเส้นที่ใช้ต่อหน่วย (เมตร)';
COMMENT ON COLUMN public.products.concrete_group IS 'กลุ่มสินค้าสำหรับจัดการคอนกรีต เช่น A13, A41, A42';

-- ─── 2. เพิ่ม Columns ที่ขาดหายในตาราง raw_materials ────────
ALTER TABLE public.raw_materials
  ADD COLUMN IF NOT EXISTS material_code    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS weight_per_meter NUMERIC(8, 4);

COMMENT ON COLUMN public.raw_materials.material_code    IS 'รหัสวัตถุดิบ (เช่น D1-003-004)';
COMMENT ON COLUMN public.raw_materials.weight_per_meter IS 'น้ำหนักต่อเมตร (กก./ม.) สำหรับเหล็กเส้น/ลวด';

-- ─── 3. ตรวจสอบผลลัพธ์ ───────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('products', 'raw_materials')
ORDER BY table_name, ordinal_position;
