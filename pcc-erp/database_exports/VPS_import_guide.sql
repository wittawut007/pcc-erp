-- ============================================================
-- PCC ERP — VPS Full Data Import Script
-- วันที่: 2026-08-01
-- วัตถุประสงค์: นำเข้าข้อมูลสินค้า วัตถุดิบ และ BOM ทั้งหมดเข้า VPS
--
-- ⚠️  ลำดับการรัน (ต้องรันในลำดับนี้เท่านั้น):
--   STEP 1 → รัน migration 022 (สร้าง product_bom_items table)
--   STEP 2 → รัน migration 023 (เพิ่ม columns ที่ขาด)
--   STEP 3 → รัน script นี้ (import ข้อมูล)
--
-- วิธีรัน (บน Supabase Dashboard SQL Editor):
--   Copy ทีละ STEP และ paste ใน SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- STEP A: ล้างข้อมูล Seed ตัวอย่างเดิม (6 rows จาก migration 001)
-- ─────────────────────────────────────────────────────────────
-- ⚠️  WARNING: คำสั่งนี้จะลบข้อมูลทั้งหมดใน products, raw_materials, product_bom_items
--              ก่อนรัน ตรวจสอบให้แน่ใจว่าไม่มีข้อมูล production จริงอยู่
-- ─────────────────────────────────────────────────────────────

-- ปิด triggers/constraints ชั่วคราว
SET session_replication_role = 'replica';

-- ลบข้อมูลเก่าออก (cascade จะลบ bom items ที่อ้างอิงด้วย)
TRUNCATE TABLE public.product_bom_items RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.products RESTART IDENTITY CASCADE;

-- ลบ raw_materials เก่า (6 rows จาก seed เดิม) แล้วใส่ใหม่ 18 rows
TRUNCATE TABLE public.raw_materials RESTART IDENTITY CASCADE;

-- เปิด triggers กลับ
SET session_replication_role = 'origin';

SELECT 'STEP A: ล้างข้อมูลเดิมเรียบร้อย' AS status;

-- ─────────────────────────────────────────────────────────────
-- STEP B: Import raw_materials (18 rows)
-- ─────────────────────────────────────────────────────────────
-- ⚠️  ต้อง copy ไฟล์ database_exports/02_raw_materials_seed.sql มา paste ที่นี่
--     หรือรัน script นั้นก่อนจาก SQL Editor
-- ─────────────────────────────────────────────────────────────

-- [PLACEHOLDER: paste เนื้อหา database_exports/02_raw_materials_seed.sql ที่นี่]

SELECT 'STEP B: raw_materials import เสร็จ (' || COUNT(*) || ' rows)' AS status FROM public.raw_materials;

-- ─────────────────────────────────────────────────────────────
-- STEP C: Import products (400 rows)
-- ─────────────────────────────────────────────────────────────
-- ⚠️  ต้อง copy ไฟล์ database_exports/01_products_seed.sql มา paste ที่นี่
--     หรือรัน script นั้นก่อนจาก SQL Editor
-- ─────────────────────────────────────────────────────────────

-- [PLACEHOLDER: paste เนื้อหา database_exports/01_products_seed.sql ที่นี่]

SELECT 'STEP C: products import เสร็จ (' || COUNT(*) || ' rows)' AS status FROM public.products;

-- ─────────────────────────────────────────────────────────────
-- STEP D: Import product_bom_items (345 rows)
-- ─────────────────────────────────────────────────────────────
-- ⚠️  ต้อง copy ไฟล์ database_exports/04_product_bom_items_seed.sql มา paste ที่นี่
--     หรือรัน script นั้นก่อนจาก SQL Editor
-- ─────────────────────────────────────────────────────────────

-- [PLACEHOLDER: paste เนื้อหา database_exports/04_product_bom_items_seed.sql ที่นี่]

SELECT 'STEP D: product_bom_items import เสร็จ (' || COUNT(*) || ' rows)' AS status FROM public.product_bom_items;

-- ─────────────────────────────────────────────────────────────
-- STEP E: ตรวจสอบผลลัพธ์สุดท้าย
-- ─────────────────────────────────────────────────────────────
SELECT
  'products'          AS table_name, COUNT(*) AS row_count FROM public.products
UNION ALL SELECT
  'raw_materials'     AS table_name, COUNT(*) AS row_count FROM public.raw_materials
UNION ALL SELECT
  'product_bom_items' AS table_name, COUNT(*) AS row_count FROM public.product_bom_items
ORDER BY table_name;
