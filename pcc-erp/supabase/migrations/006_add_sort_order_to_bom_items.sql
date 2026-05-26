-- ============================================================
-- PCC POSTENTION ERP - Migration 006
-- เพิ่ม sort_order ใน product_bom_items
-- เพื่อระบุลำดับของวัตถุดิบในแต่ละหมวด (wire1=1, wire2=2, ...)
-- ============================================================

-- 1. เพิ่ม column sort_order (default=1 สำหรับข้อมูลใหม่)
ALTER TABLE product_bom_items
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 1;

-- 2. Assign sort_order ให้ข้อมูลเดิม
--    จัดลำดับตาม created_at ภายใน product_id + category ของ raw_material
--    wire ที่ insert ก่อน = sort_order=1, insert ทีหลัง = sort_order=2
WITH ranked AS (
  SELECT
    bi.id,
    ROW_NUMBER() OVER (
      PARTITION BY bi.product_id, rm.category
      ORDER BY bi.created_at ASC
    ) AS rn
  FROM product_bom_items bi
  JOIN raw_materials rm ON rm.id = bi.raw_material_id
)
UPDATE product_bom_items
SET sort_order = ranked.rn
FROM ranked
WHERE product_bom_items.id = ranked.id;

-- 3. Index เพื่อการ query ที่รวดเร็ว
CREATE INDEX IF NOT EXISTS idx_bom_items_product_sort
  ON product_bom_items(product_id, sort_order);
