-- ============================================================
-- PCC POSTENTION ERP - Initial Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── ENUMS ───────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('admin', 'planner', 'worker', 'qc');
CREATE TYPE plan_status AS ENUM ('draft', 'confirmed', 'completed');
CREATE TYPE job_status AS ENUM ('pending', 'casting', 'curing', 'ready_demold', 'demolded', 'cancelled');
CREATE TYPE defect_reason AS ENUM ('crack', 'chip', 'honeycomb', 'other');
CREATE TYPE bed_name AS ENUM ('A', 'B', 'C', 'D', 'E', 'F');

-- ─── 1. PROFILES (ผู้ใช้งาน) ─────────────────────────────────
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'worker',
  employee_code TEXT UNIQUE,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'worker');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ─── 2. PRODUCTS (ข้อมูลสินค้า) ──────────────────────────────
CREATE TABLE products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  size TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'ชิ้น',
  concrete_per_unit NUMERIC(8,4) NOT NULL DEFAULT 0,
  bom_code TEXT,
  wip_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. PRODUCTION PLANS (แผนการผลิตรายวัน) ─────────────────
CREATE TABLE production_plans (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  plan_date DATE NOT NULL,
  created_by UUID REFERENCES profiles(id),
  status plan_status NOT NULL DEFAULT 'draft',
  total_qty INTEGER NOT NULL DEFAULT 0,
  total_concrete NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan_date)
);

-- ─── 4. PRODUCTION PLAN ITEMS (รายการในแผน) ─────────────────
CREATE TABLE production_plan_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  plan_id UUID REFERENCES production_plans(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  bed bed_name NOT NULL,
  qty_target INTEGER NOT NULL DEFAULT 1,
  status job_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 5. PRODUCTION ORDERS (ใบสั่งผลิต) ──────────────────────
CREATE TABLE production_orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  plan_id UUID REFERENCES production_plans(id) NOT NULL,
  confirmed_by UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  date_str TEXT;
  seq INTEGER;
BEGIN
  date_str := TO_CHAR(NOW(), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO seq
  FROM production_orders
  WHERE order_number LIKE 'PO-' || date_str || '%';
  NEW.order_number := 'PO-' || date_str || '-' || LPAD(seq::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_number
  BEFORE INSERT ON production_orders
  FOR EACH ROW EXECUTE PROCEDURE generate_order_number();

-- ─── 6. JOB ORDERS (คิวงานเทปูน) ────────────────────────────
CREATE TABLE job_orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES production_orders(id) NOT NULL,
  plan_item_id UUID REFERENCES production_plan_items(id) NOT NULL,
  worker_id UUID REFERENCES profiles(id),
  bed bed_name NOT NULL,
  qty_target INTEGER NOT NULL DEFAULT 1,
  qty_cast INTEGER NOT NULL DEFAULT 0,
  status job_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  cast_at TIMESTAMPTZ,
  expected_demold_at TIMESTAMPTZ,
  demolded_at TIMESTAMPTZ,
  photo_cast_url TEXT,
  photo_ready_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 7. DEMOLDING RECORDS (ถอดแบบ + QC) ─────────────────────
CREATE TABLE demolding_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_order_id UUID REFERENCES job_orders(id) NOT NULL,
  worker_id UUID REFERENCES profiles(id) NOT NULL,
  qty_good INTEGER NOT NULL DEFAULT 0,
  qty_defect INTEGER NOT NULL DEFAULT 0,
  defect_reason defect_reason,
  defect_detail TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 8. FG INVENTORY (คลังสินค้าพร้อมขาย) ──────────────────
CREATE TABLE fg_inventory (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_id UUID REFERENCES products(id) NOT NULL UNIQUE,
  qty INTEGER NOT NULL DEFAULT 0,
  last_updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 9. RAW MATERIALS (วัตถุดิบ) ─────────────────────────────
CREATE TABLE raw_materials (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  qty_on_hand NUMERIC(12,3) NOT NULL DEFAULT 0,
  min_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  cost_per_unit NUMERIC(10,2),
  supplier TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 10. WIP INVENTORY (โครงเหล็ก) ──────────────────────────
CREATE TABLE wip_inventory (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_id UUID REFERENCES products(id) NOT NULL UNIQUE,
  wip_code TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 11. ACTIVITY LOGS (ประวัติการทำงาน) ─────────────────────
CREATE TABLE activity_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE demolding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE wip_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all data
CREATE POLICY "Authenticated users can read" ON profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read" ON products FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read" ON production_plans FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read" ON production_plan_items FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read" ON production_orders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read" ON job_orders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read" ON demolding_records FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read" ON fg_inventory FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read" ON raw_materials FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read" ON wip_inventory FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read" ON activity_logs FOR SELECT USING (auth.role() = 'authenticated');

-- Authenticated users can write (role-based enforcement will be in app layer)
CREATE POLICY "Authenticated users can insert" ON production_plans FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update" ON production_plans FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert" ON production_plan_items FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert" ON production_orders FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert" ON job_orders FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update" ON job_orders FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert" ON demolding_records FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update" ON fg_inventory FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage" ON raw_materials FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage" ON wip_inventory FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert" ON activity_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can manage all profiles" ON profiles FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "Admins can manage products" ON products FOR ALL USING (auth.role() = 'authenticated');

-- ─── INDEXES ─────────────────────────────────────────────────
CREATE INDEX idx_production_plans_date ON production_plans(plan_date);
CREATE INDEX idx_plan_items_plan_id ON production_plan_items(plan_id);
CREATE INDEX idx_job_orders_status ON job_orders(status);
CREATE INDEX idx_job_orders_bed ON job_orders(bed);
CREATE INDEX idx_demolding_job_order ON demolding_records(job_order_id);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at DESC);

-- ─── SEED DATA (ข้อมูลตัวอย่างเริ่มต้น) ─────────────────────
INSERT INTO products (code, name, category, size, unit, concrete_per_unit, bom_code, wip_code) VALUES
  ('A13-050-0404', 'แผ่นพื้น PL50 4@4', 'A13 แผ่นพื้นตัน', '0.35x1.55 ม.', 'แผ่น', 0.05, 'BOM-PLK-3M', 'WIP-A13'),
  ('A30-PL-0.50x2.90m.', 'ผนังรั้วสำเร็จรูป ขนาด 0.50x2.90 ม.', 'A30 ผนังรั้วสำเร็จรูป', '0.50x2.90 ม.', 'แผ่น', 0.18, 'BOM-FNC-001', 'WIP-A30'),
  ('A35-FZC-C160', 'เสารั้ว 0.15x0.15 1.60 ม.', 'A35 รั้วสำเร็จรูป', '0.15x0.15 1.60 ม.', 'ต้น', 0.04, 'BOM-FZC-C160', 'WIP-A35'),
  ('A36-PAB2030-A', 'คานคอนกรีตสำเร็จรูป ขนาด 0.20x0.30 ม.', 'A36 เสา คาน บันได', '0.20x0.30 ม.', 'ท่อน', 0.15, 'BOM-PAB2030', 'WIP-A36'),
  ('A41-015-0200', 'เสาเข็ม .15x.15 2.00 ม.', 'A41 เสาเข็ม', '0.15x0.15 2.00 ม.', 'ต้น', 0.05, 'BOM-IP22-10', 'WIP-A41'),
  ('A42-RW-T1', 'กำแพงกันดิน Type 1', 'A42 กำแพงกันดิน', '2.0x1.5 ม.', 'ชิ้น', 0.20, 'BOM-RW-T1', 'WIP-A42');

INSERT INTO raw_materials (name, category, unit, qty_on_hand, min_stock, supplier) VALUES
  ('เหล็กเส้น DB12 (10m)', 'เหล็กเส้น', 'เส้น', 45, 100, 'บริษัท เหล็กไทย จำกัด'),
  ('ลวดอัดแรง PC Wire 4mm', 'ลวด', 'ม้วน', 8, 10, '-'),
  ('ลวดผูก (1kg)', 'ลวด', 'ม้วน', 30, 20, '-'),
  ('น้ำยาทาแบบ', 'น้ำยา', 'ถัง', 2, 5, '-'),
  ('เมชกำแพงกันดิน A', 'เมช', 'แผง', 5, 15, '-'),
  ('ปูนซีเมนต์ (50kg)', 'ปูน', 'ถุง', 200, 50, '-');
