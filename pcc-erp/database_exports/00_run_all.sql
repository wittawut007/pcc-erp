-- =====================================================
-- PCC POSTENTION ERP - Master Import Script (Full)
-- Generated: 2026-07-08
-- Total: 15 files, ~2500+ rows
-- =====================================================
-- รันไฟล์นี้เพื่อ import ข้อมูลทั้งหมดตามลำดับ dependency
-- ⚠️ ต้องรันในโฟลเดอร์ database_exports เท่านั้น
-- =====================================================

\echo '============================================'
\echo '  PCC ERP - Full Database Import'
\echo '  Date: 2026-07-08'
\echo '============================================'
\echo ''

-- =========================================
-- LAYER 1: Master Data (ไม่มี dependencies)
-- =========================================
\echo '--- LAYER 1: Master Data ---'

\echo '1/12 raw_materials (18 rows)...'
\i 02_raw_materials_seed.sql

\echo '2/12 profiles/users (7 rows)...'
\echo '⚠️  profiles.id ต้องตรงกับ auth.users ในระบบ Supabase'
\i 03_profiles_seed.sql

\echo '3/12 products (400 rows)...'
\i 01_products_seed.sql

-- =========================================
-- LAYER 2: Product Relations
-- =========================================
\echo ''
\echo '--- LAYER 2: Product Relations ---'

\echo '4/12 product_bom_items (345 rows)...'
\i 04_product_bom_items_seed.sql

-- =========================================
-- LAYER 3: Production Planning
-- =========================================
\echo ''
\echo '--- LAYER 3: Production Planning ---'

\echo '5/12 production_plans (122 rows)...'
\i 05_production_plans_seed.sql

\echo '6/12 production_plan_items (223 rows)...'
\i 06_production_plan_items_seed.sql

\echo '7/12 production_orders (121 rows)...'
\i 07_production_orders_seed.sql

\echo '8/12 plan_materials (179 rows)...'
\i 09_plan_materials_seed.sql

-- =========================================
-- LAYER 4: Production Execution
-- =========================================
\echo ''
\echo '--- LAYER 4: Production Execution ---'

\echo '9/12 job_orders (222 rows)...'
\i 08_job_orders_seed.sql

\echo '10/12 concrete_orders (94 rows)...'
\i 12_concrete_orders_seed.sql

\echo '11/12 concrete_rounds (393 rows)...'
\i 13_concrete_rounds_seed.sql

-- =========================================
-- LAYER 5: QC & Results
-- =========================================
\echo ''
\echo '--- LAYER 5: QC & Results ---'

\echo '12/12 demolding_records (91 rows)...'
\i 10_demolding_records_seed.sql

\echo '13/12 qc_inspections (147 rows)...'
\i 11_qc_inspections_seed.sql

\echo '14/12 job_order_defects (36 rows)...'
\i 14_job_order_defects_seed.sql

-- =========================================
-- LAYER 6: Inventory
-- =========================================
\echo ''
\echo '--- LAYER 6: Inventory ---'

\echo '15/15 fg_inventory (79 rows)...'
\i 15_fg_inventory_seed.sql

-- =========================================
-- SUMMARY
-- =========================================
\echo ''
\echo '============================================'
\echo '  Import เสร็จสมบูรณ์!'
\echo '============================================'

SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.tables t2 WHERE t2.table_name = t.table_name) AS exists
FROM (VALUES
    ('products'),('raw_materials'),('profiles'),
    ('product_bom_items'),
    ('production_plans'),('production_plan_items'),('production_orders'),
    ('job_orders'),('plan_materials'),
    ('demolding_records'),('qc_inspections'),
    ('concrete_orders'),('concrete_rounds'),
    ('job_order_defects'),('fg_inventory')
) AS t(table_name);

-- นับ rows ทั้งหมด
SELECT 'products' AS tbl, COUNT(*) FROM products
UNION ALL SELECT 'raw_materials', COUNT(*) FROM raw_materials
UNION ALL SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL SELECT 'product_bom_items', COUNT(*) FROM product_bom_items
UNION ALL SELECT 'production_plans', COUNT(*) FROM production_plans
UNION ALL SELECT 'production_plan_items', COUNT(*) FROM production_plan_items
UNION ALL SELECT 'production_orders', COUNT(*) FROM production_orders
UNION ALL SELECT 'job_orders', COUNT(*) FROM job_orders
UNION ALL SELECT 'plan_materials', COUNT(*) FROM plan_materials
UNION ALL SELECT 'demolding_records', COUNT(*) FROM demolding_records
UNION ALL SELECT 'qc_inspections', COUNT(*) FROM qc_inspections
UNION ALL SELECT 'concrete_orders', COUNT(*) FROM concrete_orders
UNION ALL SELECT 'concrete_rounds', COUNT(*) FROM concrete_rounds
UNION ALL SELECT 'job_order_defects', COUNT(*) FROM job_order_defects
UNION ALL SELECT 'fg_inventory', COUNT(*) FROM fg_inventory
ORDER BY 1;
