-- Migration 024: Fix generate_order_number() trigger
-- Problem: Trigger used COUNT(*)+1 which breaks when POs have gaps (e.g. a PO was deleted)
--          causing duplicate key violations.
-- Fix: Use MAX(seq)+1 instead of COUNT(*)+1 so the next number is always after the highest existing one.

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  date_str TEXT;
  seq      INTEGER;
  p_date   DATE;
BEGIN
  -- If order_number is already set and does not start with 'PO-', preserve it (e.g. ADJ-...)
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

  -- Use MAX seq+1 instead of COUNT+1 to handle gaps in sequence (deleted POs)
  SELECT COALESCE(
    MAX(CAST(SPLIT_PART(order_number, '-', 3) AS INTEGER)),
    0
  ) + 1
  INTO seq
  FROM production_orders
  WHERE order_number LIKE 'PO-' || date_str || '-%'
    AND order_number ~ '^PO-\d{8}-\d{3}$';

  NEW.order_number := 'PO-' || date_str || '-' || LPAD(seq::TEXT, 3, '0');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
