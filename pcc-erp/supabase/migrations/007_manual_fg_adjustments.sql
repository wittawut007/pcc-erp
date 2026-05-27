-- Migration 007: Allow custom order number prefixes (e.g. ADJ- for manual adjustments)
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  date_str TEXT;
  seq INTEGER;
  p_date DATE;
BEGIN
  -- If order_number is already set and does not start with 'PO-', preserve it
  IF NEW.order_number IS NOT NULL AND NEW.order_number != '' AND NOT (NEW.order_number LIKE 'PO-%') THEN
    RETURN NEW;
  END IF;

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
