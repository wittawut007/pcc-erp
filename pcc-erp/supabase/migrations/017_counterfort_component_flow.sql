-- ============================================================
-- PCC ERP — Migration 017: Counterfort Decoupled Component Flow
-- วันที่: 2026-07-25
-- แทนที่ระบบ Two-Phase In-situ (Migration 011) ด้วย Decoupled
-- Counterfort Component Flow ที่ผลิต CF แยก แล้วเก็บเข้าคลัง
-- วัตถุดิบ (Raw Materials) ประเภท SFG ก่อนนำไปประกอบ L-Wall
-- ============================================================

-- ─── 1. เพิ่ม plan_type ใน production_plans ─────────────────
--   'fg'        = แผนผลิตสินค้าสำเร็จรูปทั่วไป (default เดิม)
--   'component' = แผนผลิตชิ้นส่วน Counterfort เข้าคลัง
ALTER TABLE production_plans
  ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'fg'
    CHECK (plan_type IN ('fg', 'component'));

COMMENT ON COLUMN production_plans.plan_type
  IS 'ประเภทแผนผลิต: fg = สินค้าสำเร็จรูป (ค่าเริ่มต้น), component = ชิ้นส่วน SFG (Counterfort)';

-- ─── 2. เพิ่ม job_type ใน job_orders ──────────────────────
--   'fg'        = Job ผลิตสินค้าสำเร็จรูปทั่วไป (default เดิม)
--   'component' = Job ผลิตชิ้นส่วน Counterfort
ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'fg'
    CHECK (job_type IN ('fg', 'component'));

COMMENT ON COLUMN job_orders.job_type
  IS 'ประเภท Job Order: fg = สินค้าสำเร็จรูป, component = ชิ้นส่วน SFG';

-- ─── 3. เพิ่มคอลัมน์ Counterfort Link ใน products ────────
--   counterfort_material_id   → FK → raw_materials.id (SFG ที่ผูกอยู่)
--   counterfort_qty_per_unit  → จำนวน CF ต่อ L-Wall 1 ชิ้น
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS counterfort_material_id UUID REFERENCES raw_materials(id),
  ADD COLUMN IF NOT EXISTS counterfort_qty_per_unit INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN products.counterfort_material_id
  IS 'FK → raw_materials.id ชี้ไปที่ Counterfort SFG ที่ใช้ประกอบสินค้านี้ (เฉพาะ A42 L-Wall)';
COMMENT ON COLUMN products.counterfort_qty_per_unit
  IS 'จำนวน Counterfort (ชิ้น) ที่ต้องใช้ต่อ L-Wall 1 ชิ้น';

-- ─── 4. สร้าง Counterfort SFG ใน raw_materials ──────────
--   Category: 'ชิ้นส่วน SFG'
--   unit: 'ชิ้น'
--   qty_on_hand เริ่มต้น 0 (ต้องผลิตเข้ามาก่อน)
INSERT INTO raw_materials
  (name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier)
VALUES
  ('Counterfort H100-500', 'ชิ้นส่วน SFG', 'ชิ้น', 0, 10, NULL, 'ผลิตเอง'),
  ('Counterfort H100-600', 'ชิ้นส่วน SFG', 'ชิ้น', 0, 10, NULL, 'ผลิตเอง'),
  ('Counterfort H150',     'ชิ้นส่วน SFG', 'ชิ้น', 0, 10, NULL, 'ผลิตเอง'),
  ('Counterfort H200',     'ชิ้นส่วน SFG', 'ชิ้น', 0, 10, NULL, 'ผลิตเอง'),
  ('Counterfort H250',     'ชิ้นส่วน SFG', 'ชิ้น', 0, 10, NULL, 'ผลิตเอง')
ON CONFLICT DO NOTHING;

-- ─── 5. เพิ่ม material_code ให้ Counterfort SFG ────────────
UPDATE raw_materials SET material_code = 'CF-H100-500-WM' WHERE name = 'Counterfort H100-500' AND material_code IS NULL;
UPDATE raw_materials SET material_code = 'CF-H100-600-WM' WHERE name = 'Counterfort H100-600' AND material_code IS NULL;
UPDATE raw_materials SET material_code = 'CF-H150'        WHERE name = 'Counterfort H150'     AND material_code IS NULL;
UPDATE raw_materials SET material_code = 'CF-H200-WM'     WHERE name = 'Counterfort H200'     AND material_code IS NULL;
UPDATE raw_materials SET material_code = 'CF-H250-WM'     WHERE name = 'Counterfort H250'     AND material_code IS NULL;

-- ─── 6. ผูก A42 products กับ Counterfort SFG ─────────────
-- A42-LCT-H100-500-WM → CF-H100-500-WM (3 ชิ้น)
UPDATE products
SET
  counterfort_material_id = (SELECT id FROM raw_materials WHERE material_code = 'CF-H100-500-WM' LIMIT 1),
  counterfort_qty_per_unit = 3
WHERE code = 'A42-LCT-H100-500-WM';

-- A42-LCT-H100-600-WM → CF-H100-600-WM (3 ชิ้น)
UPDATE products
SET
  counterfort_material_id = (SELECT id FROM raw_materials WHERE material_code = 'CF-H100-600-WM' LIMIT 1),
  counterfort_qty_per_unit = 3
WHERE code = 'A42-LCT-H100-600-WM';

-- A42-LCT-H150 → CF-H150 (2 ชิ้น)
UPDATE products
SET
  counterfort_material_id = (SELECT id FROM raw_materials WHERE material_code = 'CF-H150' LIMIT 1),
  counterfort_qty_per_unit = 2
WHERE code = 'A42-LCT-H150';

-- A42-LCT-H200-WM → CF-H200-WM (2 ชิ้น)
UPDATE products
SET
  counterfort_material_id = (SELECT id FROM raw_materials WHERE material_code = 'CF-H200-WM' LIMIT 1),
  counterfort_qty_per_unit = 2
WHERE code = 'A42-LCT-H200-WM';

-- A42-LCT-H250-WM → CF-H250-WM (2 ชิ้น)
UPDATE products
SET
  counterfort_material_id = (SELECT id FROM raw_materials WHERE material_code = 'CF-H250-WM' LIMIT 1),
  counterfort_qty_per_unit = 2
WHERE code = 'A42-LCT-H250-WM';

-- ─── 7. ยกเลิกแผนการผลิต A42 ที่ค้างอยู่ (status = draft/confirmed แต่ยังไม่เริ่มดำเนินการ) ──
-- ยกเลิก Job Orders ที่เป็น status = 'counterfort_ordered', 'stem_ordered', 'pending'
-- สำหรับสินค้า A42 ที่ยังไม่มีการเทคอนกรีตจริง
UPDATE job_orders
SET status = 'cancelled'
WHERE status IN ('counterfort_ordered', 'pending')
  AND plan_item_id IN (
    SELECT ppi.id
    FROM production_plan_items ppi
    JOIN products p ON p.id = ppi.product_id
    WHERE p.category LIKE 'A42%'
  )
  AND cast_at IS NULL
  AND counterfort_cast_at IS NULL;

-- ─── 8. Deprecation Notice สำหรับ Two-Phase Columns ──────
-- columns เหล่านี้ยังคงอยู่เพื่อ backward-compat กับข้อมูลเดิม
-- แต่ระบบจะไม่เขียนข้อมูลใหม่ลงอีกต่อไป
COMMENT ON COLUMN products.is_two_phase
  IS '[DEPRECATED since migration 017] ใช้ counterfort_material_id แทน';
COMMENT ON COLUMN products.concrete_counterfort
  IS '[DEPRECATED since migration 017] ปริมาณ concrete CF ยังคงเก็บเพื่ออ้างอิงข้อมูลเดิม';
COMMENT ON COLUMN products.concrete_stem
  IS '[DEPRECATED since migration 017] ปริมาณ concrete Stem ยังคงเก็บเพื่ออ้างอิงข้อมูลเดิม';
COMMENT ON COLUMN job_orders.counterfort_cast_at
  IS '[DEPRECATED since migration 017] ไม่ใช้งานใน Decoupled Flow';
COMMENT ON COLUMN job_orders.stem_cast_at
  IS '[DEPRECATED since migration 017] ไม่ใช้งานใน Decoupled Flow';

-- ─── 9. Indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_production_plans_plan_type
  ON production_plans(plan_type);

CREATE INDEX IF NOT EXISTS idx_job_orders_job_type
  ON job_orders(job_type);

CREATE INDEX IF NOT EXISTS idx_products_counterfort_material
  ON products(counterfort_material_id) WHERE counterfort_material_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_raw_materials_sfg_category
  ON raw_materials(category) WHERE category = 'ชิ้นส่วน SFG';

-- ─── 10. สร้างสินค้าและรายการ BOM สำหรับ Counterfort SFG (Per-unit per piece) ─────
INSERT INTO products
  (code, name, category, size, unit, concrete_per_unit, concrete_group, is_active, counterfort_material_id)
VALUES
  ('CF-H100-500-WM', 'Counterfort H100-500', 'A42-CF ชิ้นส่วน Counterfort (SFG)', 'H100x500', 'ชิ้น', 0.0133, 'A42 กำแพงกันดิน', true, (SELECT id FROM raw_materials WHERE material_code = 'CF-H100-500-WM' LIMIT 1)),
  ('CF-H100-600-WM', 'Counterfort H100-600', 'A42-CF ชิ้นส่วน Counterfort (SFG)', 'H100x600', 'ชิ้น', 0.0133, 'A42 กำแพงกันดิน', true, (SELECT id FROM raw_materials WHERE material_code = 'CF-H100-600-WM' LIMIT 1)),
  ('CF-H150',        'Counterfort H150',     'A42-CF ชิ้นส่วน Counterfort (SFG)', 'H150',     'ชิ้น', 0.0225, 'A42 กำแพงกันดิน', true, (SELECT id FROM raw_materials WHERE material_code = 'CF-H150' LIMIT 1)),
  ('CF-H200-WM',     'Counterfort H200',     'A42-CF ชิ้นส่วน Counterfort (SFG)', 'H200',     'ชิ้น', 0.0390, 'A42 กำแพงกันดิน', true, (SELECT id FROM raw_materials WHERE material_code = 'CF-H200-WM' LIMIT 1)),
  ('CF-H250-WM',     'Counterfort H250',     'A42-CF ชิ้นส่วน Counterfort (SFG)', 'H250',     'ชิ้น', 0.1270, 'A42 กำแพงกันดิน', true, (SELECT id FROM raw_materials WHERE material_code = 'CF-H250-WM' LIMIT 1))
ON CONFLICT (code) DO UPDATE SET
  category = 'A42-CF ชิ้นส่วน Counterfort (SFG)',
  concrete_group = 'A42 กำแพงกันดิน',
  concrete_per_unit = EXCLUDED.concrete_per_unit,
  counterfort_material_id = EXCLUDED.counterfort_material_id;


INSERT INTO product_bom_items (product_id, raw_material_id, qty_per_unit, phase, sort_order)
SELECT p.id, rm.id, b.qty, 'all', b.sort_order
FROM (VALUES
  ('CF-H100-500-WM', 'DB 12 MM(SD40)', 0.7767, 1),
  ('CF-H100-500-WM', 'เหล็กเส้นกลม 9 มม. RB 9', 1.1200, 2),
  ('CF-H100-600-WM', 'DB 12 MM(SD40)', 0.7767, 1),
  ('CF-H100-600-WM', 'เหล็กเส้นกลม 9 มม. RB 9', 1.1200, 2),
  ('CF-H150',        'DB 12 MM(SD40)', 4.2400, 1),
  ('CF-H150',        'เหล็กเส้นกลม 9 มม. RB 9', 7.1200, 2),
  ('CF-H200-WM',     'DB 12 MM(SD40)', 2.0800, 1),
  ('CF-H200-WM',     'เหล็กเส้นกลม 9 มม. RB 9', 6.9050, 2),
  ('CF-H200-WM',     'เหล็กเส้นกลม 6 มม. RB 6', 1.1550, 3),
  ('CF-H200-WM',     'ตะแกรงเหล็กสำเร็จรูป 6มม 15*15', 3.0000, 4),
  ('CF-H250-WM',     'DB 12 MM(SD40)', 1.9200, 1),
  ('CF-H250-WM',     'เหล็กเส้นกลม 9 มม. RB 9', 7.9900, 2),
  ('CF-H250-WM',     'DB 16 MM(SD40)', 1.3250, 3)
) AS b(code, material_name, qty, sort_order)
JOIN products p ON p.code = b.code
JOIN raw_materials rm ON rm.name = b.material_name
ON CONFLICT (product_id, raw_material_id) DO UPDATE SET qty_per_unit = EXCLUDED.qty_per_unit;


