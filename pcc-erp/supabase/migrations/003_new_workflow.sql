-- ============================================================
-- PCC POSTENTION ERP - Migration 003: New Workflow & Roles
-- ============================================================
-- Adds: material, concrete, warehouse roles
-- Adds: plan_materials, concrete_orders, qc_inspections, fg_receipts tables
-- Updates: job_orders, profiles columns
-- ============================================================

-- ─── 1. ADD NEW USER ROLES ────────────────────────────────────
-- เพิ่ม Role ใหม่ใน Enum (additive เท่านั้น)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'material';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'concrete';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'warehouse';

-- ─── 2. ADD NEW JOB STATUSES ─────────────────────────────────
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'rebar_prep';
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'concrete_ordered';

-- ─── 3. ADD worker_token TO PROFILES (ถ้ายังไม่มี) ────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS worker_token TEXT UNIQUE;

-- ─── 4. ADD COLUMNS TO JOB ORDERS ────────────────────────────
ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS rebar_prepared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS concrete_requested_at TIMESTAMPTZ;

-- ─── 5. TABLE: plan_materials ─────────────────────────────────
-- วัตถุดิบที่ Planner ระบุว่าต้องใช้ในแต่ละแผนการผลิต
CREATE TABLE IF NOT EXISTS plan_materials (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  plan_id           UUID REFERENCES production_plans(id) ON DELETE CASCADE NOT NULL,
  raw_material_id   UUID REFERENCES raw_materials(id) NOT NULL,
  qty_required      NUMERIC(12,3) NOT NULL DEFAULT 0,
  qty_dispensed     NUMERIC(12,3) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'dispensed' | 'partial'
  notes             TEXT,
  dispensed_by      UUID REFERENCES profiles(id),
  dispensed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan_id, raw_material_id)
);

-- ─── 6. TABLE: concrete_orders ───────────────────────────────
-- คิวการสั่งคอนกรีตจาก Worker ไปยัง Concrete Staff
CREATE TABLE IF NOT EXISTS concrete_orders (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_order_id    UUID REFERENCES job_orders(id) NOT NULL,
  requested_by    UUID REFERENCES profiles(id) NOT NULL,
  qty_requested   NUMERIC(8,3) NOT NULL DEFAULT 0, -- หน่วย: m³
  mix_ratio       TEXT,                             -- อัตราส่วนผสม เช่น '1:2:4'
  status          TEXT NOT NULL DEFAULT 'requested', -- 'requested' | 'supplied' | 'cancelled'
  notes           TEXT,
  supplied_by     UUID REFERENCES profiles(id),
  supplied_at     TIMESTAMPTZ,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 7. TABLE: qc_inspections ────────────────────────────────
-- บันทึกการตรวจสอบคุณภาพโดย QC (แยกออกจาก demolding_records)
CREATE TABLE IF NOT EXISTS qc_inspections (
  id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_order_id          UUID REFERENCES job_orders(id) NOT NULL,
  qc_id                 UUID REFERENCES profiles(id) NOT NULL,
  -- Step A: ตรวจการเทคอนกรีต
  pour_ok               BOOLEAN,
  pour_notes            TEXT,
  pour_inspected_at     TIMESTAMPTZ,
  -- Step B: ตรวจการถอดแบบ/ตัดยก
  demold_qty_good       INTEGER NOT NULL DEFAULT 0,
  demold_qty_defect     INTEGER NOT NULL DEFAULT 0,
  defect_reason         defect_reason,              -- 'crack'|'chip'|'honeycomb'|'other'
  defect_detail         TEXT,
  photo_url             TEXT,
  demold_inspected_at   TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 8. TABLE: fg_receipts ───────────────────────────────────
-- บันทึกการรับสินค้าเข้าคลัง FG โดย Warehouse Staff
CREATE TABLE IF NOT EXISTS fg_receipts (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_order_id    UUID REFERENCES job_orders(id) NOT NULL,
  product_id      UUID REFERENCES products(id) NOT NULL,
  warehouse_id    UUID REFERENCES profiles(id) NOT NULL,
  qty_good        INTEGER NOT NULL DEFAULT 0,
  qty_defect      INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  confirmed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 9. ROW LEVEL SECURITY ───────────────────────────────────
ALTER TABLE plan_materials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE concrete_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_inspections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_receipts      ENABLE ROW LEVEL SECURITY;

-- plan_materials
CREATE POLICY "Authenticated read plan_materials"
  ON plan_materials FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated insert plan_materials"
  ON plan_materials FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update plan_materials"
  ON plan_materials FOR UPDATE USING (auth.role() = 'authenticated');

-- concrete_orders
CREATE POLICY "Authenticated read concrete_orders"
  ON concrete_orders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated insert concrete_orders"
  ON concrete_orders FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update concrete_orders"
  ON concrete_orders FOR UPDATE USING (auth.role() = 'authenticated');

-- qc_inspections
CREATE POLICY "Authenticated read qc_inspections"
  ON qc_inspections FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated insert qc_inspections"
  ON qc_inspections FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update qc_inspections"
  ON qc_inspections FOR UPDATE USING (auth.role() = 'authenticated');

-- fg_receipts
CREATE POLICY "Authenticated read fg_receipts"
  ON fg_receipts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated insert fg_receipts"
  ON fg_receipts FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ─── 10. INDEXES ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_plan_materials_plan_id    ON plan_materials(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_materials_status     ON plan_materials(status);
CREATE INDEX IF NOT EXISTS idx_concrete_orders_status    ON concrete_orders(status);
CREATE INDEX IF NOT EXISTS idx_concrete_orders_job       ON concrete_orders(job_order_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_job        ON qc_inspections(job_order_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_qc         ON qc_inspections(qc_id);
CREATE INDEX IF NOT EXISTS idx_fg_receipts_job           ON fg_receipts(job_order_id);
CREATE INDEX IF NOT EXISTS idx_fg_receipts_warehouse     ON fg_receipts(warehouse_id);
