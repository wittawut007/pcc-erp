-- ============================================================
-- PCC ERP — Migration 022: Create product_bom_items Table
-- วันที่: 2026-08-01
-- ปัญหา: ตาราง product_bom_items ถูกสร้างโดยตรงบน Supabase Cloud
--        แต่ไม่มีใน migration files ทำให้ VPS (Self-hosted) ไม่มีตารางนี้
-- ============================================================

-- ─── 1. สร้างตาราง product_bom_items ────────────────────────
CREATE TABLE IF NOT EXISTS public.product_bom_items (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_id       UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  raw_material_id  UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  qty_per_unit     NUMERIC(12, 4) NOT NULL DEFAULT 0,
  sort_order       INTEGER NOT NULL DEFAULT 1,
  phase            TEXT NOT NULL DEFAULT 'all',  -- 'all' | 'counterfort' | 'stem'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, raw_material_id, phase)
);

COMMENT ON TABLE public.product_bom_items IS 'Bill of Materials — วัตถุดิบที่ใช้ผลิตสินค้าแต่ละรายการ';
COMMENT ON COLUMN public.product_bom_items.qty_per_unit IS 'ปริมาณวัตถุดิบที่ใช้ต่อหน่วยผลิต';
COMMENT ON COLUMN public.product_bom_items.sort_order IS 'ลำดับการแสดงวัตถุดิบใน BOM (1 = แรก)';
COMMENT ON COLUMN public.product_bom_items.phase IS 'เฟสการผลิต: all=ทั่วไป, counterfort=เฟส CF, stem=เฟส Stem (A42 L-Wall)';

-- ─── 2. Indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bom_items_product_id
  ON public.product_bom_items(product_id);

CREATE INDEX IF NOT EXISTS idx_bom_items_raw_material_id
  ON public.product_bom_items(raw_material_id);

CREATE INDEX IF NOT EXISTS idx_bom_items_product_sort
  ON public.product_bom_items(product_id, sort_order);

-- ─── 3. Row Level Security ───────────────────────────────────
ALTER TABLE public.product_bom_items ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read BOM items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'product_bom_items'
    AND policyname = 'allow_auth_all_bom_items'
  ) THEN
    CREATE POLICY "allow_auth_all_bom_items"
      ON public.product_bom_items
      FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- ─── 4. ตรวจสอบผลลัพธ์ ───────────────────────────────────────
SELECT
  'product_bom_items' AS table_name,
  COUNT(*) AS row_count
FROM public.product_bom_items;
