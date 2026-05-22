-- Migration 004: Allow multiple plans per day and generate sequential POs
ALTER TABLE production_plans DROP CONSTRAINT IF EXISTS production_plans_plan_date_key;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  date_str TEXT;
  seq INTEGER;
  p_date DATE;
BEGIN
  -- Get plan_date from the referenced production_plans row
  SELECT plan_date INTO p_date FROM production_plans WHERE id = NEW.plan_id;
  
  -- Fallback to current date if plan_date is not found
  IF p_date IS NULL THEN
    p_date := CURRENT_DATE;
  END IF;
  
  -- Format as YYYYMMDD
  date_str := TO_CHAR(p_date, 'YYYYMMDD');
  
  -- Find the count of production orders for this date to determine sequence
  SELECT COALESCE(COUNT(*), 0) + 1 INTO seq
  FROM production_orders
  WHERE order_number LIKE 'PO-' || date_str || '-%';
  
  NEW.order_number := 'PO-' || date_str || '-' || LPAD(seq::TEXT, 3, '0');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
