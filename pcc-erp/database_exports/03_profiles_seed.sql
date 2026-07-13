-- =====================================================
-- PCC POSTENTION ERP - Profiles (Users) Data Export
-- Generated: 2026-07-08
-- Table: public.profiles (7 rows)
-- ⚠️ หมายเหตุ: profiles.id เชื่อมกับ auth.users ของ Supabase
--    ในระบบใหม่ต้องสร้าง auth users ก่อน แล้วค่อย insert profiles
--    หรือถ้าระบบใหม่ไม่ใช้ Supabase Auth ให้ตัดคอลัมน์ id ออก
-- =====================================================

-- ปิด trigger ชั่วคราวเพื่อเพิ่มประสิทธิภาพ
SET session_replication_role = 'replica';

-- ลบข้อมูลเก่า (ถ้าต้องการ reset ก่อน import)
-- TRUNCATE TABLE public.profiles CASCADE;

-- สร้าง ENUM type สำหรับ role (ถ้ายังไม่มีในระบบปลายทาง)
-- DO $$ BEGIN
--   CREATE TYPE user_role AS ENUM ('admin','planner','worker','qc','material','concrete','warehouse');
-- EXCEPTION WHEN duplicate_object THEN NULL;
-- END $$;

INSERT INTO public.profiles (id, email, full_name, role, employee_code, avatar_url, is_active, created_at, worker_token) VALUES ('ffeb9a9d-ff3e-43a3-98c8-3665ebe70d5d','somchai.admin@pcc-erp.local','สมชาย วงศ์เจริญ','admin','EMP-001','https://ywogqmduwvjwzpgwfhhl.supabase.co/storage/v1/object/public/avatars/ffeb9a9d-ff3e-43a3-98c8-3665ebe70d5d.png',true,'2026-05-23 17:48:34.277996+00',NULL);
INSERT INTO public.profiles (id, email, full_name, role, employee_code, avatar_url, is_active, created_at, worker_token) VALUES ('99880daa-6815-4e9a-8261-15dbaa4bcf74','wiphada.plan@pcc-erp.local','วิภาดา ศิริพงษ์','planner','EMP-002','https://ywogqmduwvjwzpgwfhhl.supabase.co/storage/v1/object/public/avatars/99880daa-6815-4e9a-8261-15dbaa4bcf74.png',true,'2026-05-23 17:48:34.277996+00',NULL);
INSERT INTO public.profiles (id, email, full_name, role, employee_code, avatar_url, is_active, created_at, worker_token) VALUES ('003a2d4e-8f72-44a9-bcfb-a5c1ca38ce62','prasit.work@pcc-erp.local','ประสิทธิ์ บุญมา','worker','EMP-003','https://ywogqmduwvjwzpgwfhhl.supabase.co/storage/v1/object/public/avatars/003a2d4e-8f72-44a9-bcfb-a5c1ca38ce62.png',true,'2026-05-23 17:48:34.277996+00',NULL);
INSERT INTO public.profiles (id, email, full_name, role, employee_code, avatar_url, is_active, created_at, worker_token) VALUES ('3068553c-fc29-4b47-875a-5bffaa3e22ab','nongnuch.qc@pcc-erp.local','นงนุช เพชรงาม','qc','EMP-004','https://ywogqmduwvjwzpgwfhhl.supabase.co/storage/v1/object/public/avatars/3068553c-fc29-4b47-875a-5bffaa3e22ab.png',true,'2026-05-23 17:48:34.277996+00',NULL);
INSERT INTO public.profiles (id, email, full_name, role, employee_code, avatar_url, is_active, created_at, worker_token) VALUES ('52ccfa65-3dc6-40db-858b-2a2c4a78a1fa','thanakorn.mat@pcc-erp.local','ธนากร อินทร์ทอง','material','EMP-005','https://ywogqmduwvjwzpgwfhhl.supabase.co/storage/v1/object/public/avatars/52ccfa65-3dc6-40db-858b-2a2c4a78a1fa.png',true,'2026-05-23 17:48:34.277996+00',NULL);
INSERT INTO public.profiles (id, email, full_name, role, employee_code, avatar_url, is_active, created_at, worker_token) VALUES ('afde0c12-394f-4234-acdd-d3ec6928ce0b','rattana.conc@pcc-erp.local','รัตนา คำหอม','concrete','EMP-006','https://ywogqmduwvjwzpgwfhhl.supabase.co/storage/v1/object/public/avatars/afde0c12-394f-4234-acdd-d3ec6928ce0b.png',true,'2026-05-23 17:48:34.277996+00',NULL);
INSERT INTO public.profiles (id, email, full_name, role, employee_code, avatar_url, is_active, created_at, worker_token) VALUES ('3c461f5e-b3c8-4850-b28a-f89010c980eb','ekkachai.ware@pcc-erp.local','เอกชัย พรมดี','warehouse','EMP-007','https://ywogqmduwvjwzpgwfhhl.supabase.co/storage/v1/object/public/avatars/3c461f5e-b3c8-4850-b28a-f89010c980eb.png',true,'2026-05-23 17:48:34.277996+00',NULL);

-- เปิด trigger กลับ
SET session_replication_role = 'origin';

-- ตรวจสอบจำนวนข้อมูล
SELECT id, email, full_name, role, employee_code, is_active FROM public.profiles ORDER BY employee_code;
