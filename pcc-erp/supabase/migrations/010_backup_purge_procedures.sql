-- Migration: 010_backup_purge_procedures.sql
-- Description: Create functions to fetch production photo metadata and clear photo URLs in DB.

-- 1. Function to fetch metadata of photos within a date range
CREATE OR REPLACE FUNCTION get_production_photos_meta(start_date DATE, end_date DATE)
RETURNS TABLE (
  job_order_id UUID,
  plan_date DATE,
  bed TEXT,
  product_name TEXT,
  product_code TEXT,
  photo_type TEXT,
  file_url TEXT,
  storage_path TEXT
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  -- photo_ready_url from job_orders
  SELECT 
    jo.id AS job_order_id,
    p.plan_date,
    jo.bed::TEXT,
    prod.name AS product_name,
    prod.code AS product_code,
    'ready'::TEXT AS photo_type,
    jo.photo_ready_url AS file_url,
    split_part(jo.photo_ready_url, '/public/job_photos/', 2) AS storage_path
  FROM job_orders jo
  JOIN production_plan_items ppi ON jo.plan_item_id = ppi.id
  JOIN production_plans p ON ppi.plan_id = p.id
  JOIN products prod ON ppi.product_id = prod.id
  WHERE p.plan_date >= start_date AND p.plan_date <= end_date
    AND jo.photo_ready_url IS NOT NULL AND jo.photo_ready_url <> ''

  UNION ALL

  -- photo_cast_url from job_orders
  SELECT 
    jo.id AS job_order_id,
    p.plan_date,
    jo.bed::TEXT,
    prod.name AS product_name,
    prod.code AS product_code,
    'cast'::TEXT AS photo_type,
    jo.photo_cast_url AS file_url,
    split_part(jo.photo_cast_url, '/public/job_photos/', 2) AS storage_path
  FROM job_orders jo
  JOIN production_plan_items ppi ON jo.plan_item_id = ppi.id
  JOIN production_plans p ON ppi.plan_id = p.id
  JOIN products prod ON ppi.product_id = prod.id
  WHERE p.plan_date >= start_date AND p.plan_date <= end_date
    AND jo.photo_cast_url IS NOT NULL AND jo.photo_cast_url <> ''

  UNION ALL

  -- photo_url from demolding_records
  SELECT 
    jo.id AS job_order_id,
    p.plan_date,
    jo.bed::TEXT,
    prod.name AS product_name,
    prod.code AS product_code,
    'demold'::TEXT AS photo_type,
    dr.photo_url AS file_url,
    split_part(dr.photo_url, '/public/job_photos/', 2) AS storage_path
  FROM demolding_records dr
  JOIN job_orders jo ON dr.job_order_id = jo.id
  JOIN production_plan_items ppi ON jo.plan_item_id = ppi.id
  JOIN production_plans p ON ppi.plan_id = p.id
  JOIN products prod ON ppi.product_id = prod.id
  WHERE p.plan_date >= start_date AND p.plan_date <= end_date
    AND dr.photo_url IS NOT NULL AND dr.photo_url <> ''

  UNION ALL

  -- photo_url from qc_inspections
  SELECT 
    jo.id AS job_order_id,
    p.plan_date,
    jo.bed::TEXT,
    prod.name AS product_name,
    prod.code AS product_code,
    'qc'::TEXT AS photo_type,
    qc.photo_url AS file_url,
    split_part(qc.photo_url, '/public/job_photos/', 2) AS storage_path
  FROM qc_inspections qc
  JOIN job_orders jo ON qc.job_order_id = jo.id
  JOIN production_plan_items ppi ON jo.plan_item_id = ppi.id
  JOIN production_plans p ON ppi.plan_id = p.id
  JOIN products prod ON ppi.product_id = prod.id
  WHERE p.plan_date >= start_date AND p.plan_date <= end_date
    AND qc.photo_url IS NOT NULL AND qc.photo_url <> ''
  ORDER BY plan_date, bed, job_order_id, photo_type;
END;
$$ LANGUAGE plpgsql;

-- 2. Function to purge photo URLs in DB within a date range
CREATE OR REPLACE FUNCTION purge_production_photos(start_date DATE, end_date DATE)
RETURNS jsonb
SECURITY DEFINER
AS $$
DECLARE
  job_orders_ready_updated INT := 0;
  job_orders_cast_updated INT := 0;
  demold_updated INT := 0;
  qc_updated INT := 0;
  result jsonb;
BEGIN
  -- Update photo_ready_url in job_orders
  WITH target_jobs AS (
    SELECT jo.id
    FROM job_orders jo
    JOIN production_plan_items ppi ON jo.plan_item_id = ppi.id
    JOIN production_plans p ON ppi.plan_id = p.id
    WHERE p.plan_date >= start_date AND p.plan_date <= end_date
      AND jo.photo_ready_url IS NOT NULL AND jo.photo_ready_url <> ''
  )
  UPDATE job_orders
  SET photo_ready_url = NULL
  WHERE id IN (SELECT id FROM target_jobs);
  GET DIAGNOSTICS job_orders_ready_updated = ROW_COUNT;

  -- Update photo_cast_url in job_orders
  WITH target_jobs AS (
    SELECT jo.id
    FROM job_orders jo
    JOIN production_plan_items ppi ON jo.plan_item_id = ppi.id
    JOIN production_plans p ON ppi.plan_id = p.id
    WHERE p.plan_date >= start_date AND p.plan_date <= end_date
      AND jo.photo_cast_url IS NOT NULL AND jo.photo_cast_url <> ''
  )
  UPDATE job_orders
  SET photo_cast_url = NULL
  WHERE id IN (SELECT id FROM target_jobs);
  GET DIAGNOSTICS job_orders_cast_updated = ROW_COUNT;

  -- Update photo_url in demolding_records
  WITH target_demold AS (
    SELECT dr.id
    FROM demolding_records dr
    JOIN job_orders jo ON dr.job_order_id = jo.id
    JOIN production_plan_items ppi ON jo.plan_item_id = ppi.id
    JOIN production_plans p ON ppi.plan_id = p.id
    WHERE p.plan_date >= start_date AND p.plan_date <= end_date
      AND dr.photo_url IS NOT NULL AND dr.photo_url <> ''
  )
  UPDATE demolding_records
  SET photo_url = NULL
  WHERE id IN (SELECT id FROM target_demold);
  GET DIAGNOSTICS demold_updated = ROW_COUNT;

  -- Update photo_url in qc_inspections
  WITH target_qc AS (
    SELECT qc.id
    FROM qc_inspections qc
    JOIN job_orders jo ON qc.job_order_id = jo.id
    JOIN production_plan_items ppi ON jo.plan_item_id = ppi.id
    JOIN production_plans p ON ppi.plan_id = p.id
    WHERE p.plan_date >= start_date AND p.plan_date <= end_date
      AND qc.photo_url IS NOT NULL AND qc.photo_url <> ''
  )
  UPDATE qc_inspections
  SET photo_url = NULL
  WHERE id IN (SELECT id FROM target_qc);
  GET DIAGNOSTICS qc_updated = ROW_COUNT;

  -- Combine stats into JSON result
  result := jsonb_build_object(
    'job_orders_ready_cleared', job_orders_ready_updated,
    'job_orders_cast_cleared', job_orders_cast_updated,
    'demold_records_cleared', demold_updated,
    'qc_inspections_cleared', qc_updated,
    'total_references_cleared', job_orders_ready_updated + job_orders_cast_updated + demold_updated + qc_updated
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Secure the functions: Revoke execution rights from public and grant to service_role/postgres only.
REVOKE EXECUTE ON FUNCTION get_production_photos_meta(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_production_photos_meta(DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION get_production_photos_meta(DATE, DATE) TO postgres;

REVOKE EXECUTE ON FUNCTION purge_production_photos(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_production_photos(DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION purge_production_photos(DATE, DATE) TO postgres;
