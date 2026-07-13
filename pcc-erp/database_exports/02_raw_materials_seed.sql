-- =====================================================
-- PCC POSTENTION ERP - Raw Materials Data Export
-- Generated: 2026-07-08
-- Table: public.raw_materials (18 rows)
-- =====================================================

-- ปิด trigger ชั่วคราวเพื่อเพิ่มประสิทธิภาพ
SET session_replication_role = 'replica';

-- ลบข้อมูลเก่า (ถ้าต้องการ reset ก่อน import)
-- TRUNCATE TABLE public.raw_materials CASCADE;

INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('166b3c0a-2c71-43f2-ae13-bab100fce2bc','DB 20 MM(SD40)','เหล็กเส้น','เมตร',5000.000,50.000,NULL,'-','2026-06-23 17:15:27.305+00','D1-010-D20',NULL,true);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('1a5b6db3-5b0b-4fd9-8a49-cd045813a14e','ลวด PC-Wire 4 มม.','ลวด','กก.',6172.207,10.000,NULL,'-','2026-06-23 17:20:32.217+00','D1-003-004',0.0989,true);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('3cbcbefc-3d6c-4924-ae34-f7211c11b145','DB 12 MM(SD40)','เหล็กเส้น','เมตร',4852.700,50.000,NULL,'-','2026-06-23 17:15:14.351+00','D1-010-D12',NULL,true);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('4499ee72-a35d-44cd-be2e-ee48bc7c776a','ลวด PC-WIRE 7 มม.','ลวด','กก.',2140.000,10.000,NULL,'-','2026-06-23 17:20:20.612+00','D1-003-007',0.3020,true);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('48bdba14-e43f-4a12-98a0-d2b3ccd10442','DB 10 MM(SD40)','เหล็กเส้น','เมตร',0.000,50.000,NULL,'-','2026-05-04 16:25:32.412129+00','D1-010-D10',NULL,false);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('53a39570-310b-4fbd-b296-58f2e8fc1b56','ตะแกรงเหล็กสำเร็จรูป 6มม 15*15','เมช','ตร.ม.',5547.530,10.000,NULL,'-','2026-06-23 17:18:37.373+00','D1-012-61515',NULL,true);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('617f196e-fd75-4c44-86f1-5a4d5cd8b04e','เหล็กเส้นกลม 9 มม. RB 9','เหล็กเส้น','เมตร',4690.300,50.000,NULL,'-','2026-06-23 17:16:02.629+00','D1-009-009',0.499,true);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('67644602-b348-4299-93e9-9d01678ad031','ลวด PC-Strand 1/2"','ลวด','กก.',6167.418,10.000,NULL,'-','2026-06-23 17:20:43.314+00','D1-004-012A',0.775,true);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('7da69035-67d5-436b-911e-af6a69f754bc','ตะแกรงเหล็กสำเร็จรูป 4mm 10*10','เมช','ตร.ม.',2200.000,10.000,NULL,'-','2026-06-23 17:19:58.99+00','D1-012-41010',NULL,true);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('846e4aea-1259-480c-945c-38f412bfb808','ตะแกรงเหล็กสำเร็จรูป 6มม 20*20','เมช','ตร.ม.',2500.000,10.000,NULL,'-','2026-06-23 17:18:47.684+00','D1-012-62020',NULL,true);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('b5507577-8913-4314-84a4-0029b33a1657','เหล็กเส้นกลม 6 มม. RB 6','เหล็กเส้น','เมตร',5729.490,50.000,NULL,'-','2026-06-23 17:15:57.328+00','D1-009-006',0.222,true);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('b68bc5e8-da72-4ed3-9926-8a771dee91d5','ตะแกรงเหล็กสำเร็จรูป 4mm 20*20','เมช','ตร.ม.',2480.790,10.000,NULL,'-','2026-06-23 17:19:53.32+00','D1-012-42020',NULL,true);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('be42e074-1556-4fe1-a0a9-c161d05454bf','เหล็กเส้นกลม 12 มม. RB 12','เหล็กเส้น','เมตร',1000.000,50.000,NULL,'-','2026-05-28 19:26:17.927+00','D1-009-012',NULL,true);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('bf60a51f-7fd8-4d98-8a05-468f669d4c53','ลวดเหล็ก(ขด) 2.8 มม.','ลวด','กก.',5923.497,10.000,NULL,'-','2026-06-23 17:20:09.166+00','D1-007-028',NULL,true);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('cf0c0771-0659-4cce-bdfa-1081a9a78eed','ลวด PC-Wire 5 มม.','ลวด','กก.',6050.704,10.000,NULL,'-','2026-06-23 17:20:26.55+00','D1-003-005',0.1540,true);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('d0484bc9-3c7d-4b8f-811b-4ea6dcf8f860','DB 16 MM(SD40)','เหล็กเส้น','เมตร',3973.500,50.000,NULL,'-','2026-06-23 17:15:20.517+00','D1-010-D16',NULL,true);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('ee811c16-649e-4107-8f4f-81660f474b21','DB 25 MM(SD40)','เหล็กเส้น','เมตร',5000.000,50.000,NULL,'-','2026-06-23 17:15:33.306+00','D1-010-D25',NULL,true);
INSERT INTO public.raw_materials (id, name, category, unit, qty_on_hand, min_stock, cost_per_unit, supplier, updated_at, material_code, weight_per_meter, is_active) VALUES ('f4b00c84-ebb8-4a94-85b8-ed41c34a1c6f','ลวดเหล็ก(ขด) 2.0 มม.','ลวด','กก.',3884.499,10.000,NULL,'-','2026-06-23 17:20:14.267+00','D1-007-020',0.23,true);

-- เปิด trigger กลับ
SET session_replication_role = 'origin';

-- ตรวจสอบจำนวนข้อมูล
SELECT COUNT(*) AS total_raw_materials FROM public.raw_materials;
