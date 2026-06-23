-- ============================================================
-- PCC ERP — Migration 011: A42 L-Wall Two-Phase Production
-- วันที่: 2026-06-23
-- รองรับการผลิตสินค้า A42 กำแพงกันดิน L Wall แบบ 2 เฟส
-- (COUNTERFORT ก่อน → บ่ม → STEM → บ่ม → ถอดแบบ)
-- ============================================================

-- ─── 1. เพิ่มคอลัมน์ Two-Phase ในตาราง products ───────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_two_phase         BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS concrete_counterfort NUMERIC(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS concrete_stem        NUMERIC(8,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN products.is_two_phase
  IS 'true = ผลิต 2 เฟส (COUNTERFORT ก่อน แล้วตาม STEM) เช่น A42 L-Wall';
COMMENT ON COLUMN products.concrete_counterfort
  IS 'ปริมาณคอนกรีตส่วน COUNTERFORT ต่อหน่วย (ลบ.ม.)';
COMMENT ON COLUMN products.concrete_stem
  IS 'ปริมาณคอนกรีตส่วน STEM ต่อหน่วย (ลบ.ม.)';

-- ─── 2. เพิ่ม Job Status ใหม่สำหรับ 2-Phase Flow ─────────────
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'counterfort_ordered';
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'counterfort_curing';
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'stem_ordered';
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'stem_curing';

-- ─── 3. เพิ่ม Phase Tracking Columns ใน job_orders ───────────
ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS counterfort_cast_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS counterfort_cured_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stem_cast_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stem_cured_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS photo_counterfort_url TEXT,
  ADD COLUMN IF NOT EXISTS photo_stem_url        TEXT;

COMMENT ON COLUMN job_orders.counterfort_cast_at
  IS 'วันเวลาที่ QC ยืนยันการเทคอนกรีต COUNTERFORT';
COMMENT ON COLUMN job_orders.counterfort_cured_at
  IS 'วันเวลาที่ COUNTERFORT บ่มเสร็จ (พร้อมเริ่ม STEM)';
COMMENT ON COLUMN job_orders.stem_cast_at
  IS 'วันเวลาที่ QC ยืนยันการเทคอนกรีต STEM';
COMMENT ON COLUMN job_orders.stem_cured_at
  IS 'วันเวลาที่ STEM บ่มเสร็จ (พร้อมถอดแบบ)';

-- ─── 4. เพิ่ม Phase Column ใน concrete_orders ────────────────
ALTER TABLE concrete_orders
  ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'main';

COMMENT ON COLUMN concrete_orders.phase
  IS 'เฟสการสั่งคอนกรีต: main (ปกติ) | counterfort | stem';

-- ─── 5. เพิ่ม Phase QC Columns ใน qc_inspections ─────────────
ALTER TABLE qc_inspections
  ADD COLUMN IF NOT EXISTS counterfort_pour_ok      BOOLEAN,
  ADD COLUMN IF NOT EXISTS counterfort_pour_notes   TEXT,
  ADD COLUMN IF NOT EXISTS counterfort_inspected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stem_pour_ok             BOOLEAN,
  ADD COLUMN IF NOT EXISTS stem_pour_notes          TEXT,
  ADD COLUMN IF NOT EXISTS stem_inspected_at        TIMESTAMPTZ;

COMMENT ON COLUMN qc_inspections.counterfort_pour_ok
  IS 'ผลตรวจการเท COUNTERFORT (true = ผ่าน)';
COMMENT ON COLUMN qc_inspections.stem_pour_ok
  IS 'ผลตรวจการเท STEM (true = ผ่าน)';

-- ─── 6. อัปเดตข้อมูลสินค้า A42 ทั้ง 5 รายการ ────────────────
UPDATE products SET
  is_two_phase         = true,
  concrete_counterfort = 0.0400,
  concrete_stem        = 0.4600,
  concrete_per_unit    = 0.5000
WHERE code = 'A42-LCT-H100-500-WM';

UPDATE products SET
  is_two_phase         = true,
  concrete_counterfort = 0.0400,
  concrete_stem        = 0.5500,
  concrete_per_unit    = 0.5900
WHERE code = 'A42-LCT-H100-600-WM';

UPDATE products SET
  is_two_phase         = true,
  concrete_counterfort = 0.0910,
  concrete_stem        = 0.4800,
  concrete_per_unit    = 0.5710
WHERE code = 'A42-LCT-H150';

UPDATE products SET
  is_two_phase         = true,
  concrete_counterfort = 0.1550,
  concrete_stem        = 0.6300,
  concrete_per_unit    = 0.7850
WHERE code = 'A42-LCT-H200-WM';

UPDATE products SET
  is_two_phase         = true,
  concrete_counterfort = 0.2540,
  concrete_stem        = 0.7800,
  concrete_per_unit    = 1.0340
WHERE code = 'A42-LCT-H250-WM';

-- ─── 7. Indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_is_two_phase
  ON products(is_two_phase) WHERE is_two_phase = true;

CREATE INDEX IF NOT EXISTS idx_concrete_orders_phase
  ON concrete_orders(phase);

CREATE INDEX IF NOT EXISTS idx_job_orders_cf_cast
  ON job_orders(counterfort_cast_at) WHERE counterfort_cast_at IS NOT NULL;
