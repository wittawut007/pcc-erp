-- ============================================================
-- PCC POSTENSION ERP - Migration 008: QC Multiple Defect Reasons
-- ============================================================
-- Create a new table to store detailed defect reasons and quantities for each job order.

CREATE TABLE IF NOT EXISTS job_order_defects (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_order_id   UUID REFERENCES job_orders(id) ON DELETE CASCADE NOT NULL,
  defect_reason  defect_reason NOT NULL, -- Enum 'crack' | 'chip' | 'honeycomb' | 'other'
  qty            INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE job_order_defects ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY "Authenticated read job_order_defects" 
  ON job_order_defects FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated insert job_order_defects" 
  ON job_order_defects FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated update job_order_defects" 
  ON job_order_defects FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated delete job_order_defects" 
  ON job_order_defects FOR DELETE USING (auth.role() = 'authenticated');
