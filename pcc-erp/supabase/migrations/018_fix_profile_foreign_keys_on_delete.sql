-- =====================================================
-- Migration 018: Fix Foreign Key constraints on profiles(id)
-- Allow CASCADE / SET NULL when deleting user profiles
-- =====================================================

-- 1. production_plans
ALTER TABLE public.production_plans DROP CONSTRAINT IF EXISTS production_plans_created_by_fkey;
ALTER TABLE public.production_plans ADD CONSTRAINT production_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. production_orders
ALTER TABLE public.production_orders DROP CONSTRAINT IF EXISTS production_orders_confirmed_by_fkey;
ALTER TABLE public.production_orders ADD CONSTRAINT production_orders_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. job_orders
ALTER TABLE public.job_orders DROP CONSTRAINT IF EXISTS job_orders_worker_id_fkey;
ALTER TABLE public.job_orders ADD CONSTRAINT job_orders_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 4. demolding_records
ALTER TABLE public.demolding_records DROP CONSTRAINT IF EXISTS demolding_records_worker_id_fkey;
ALTER TABLE public.demolding_records ADD CONSTRAINT demolding_records_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 5. fg_inventory
ALTER TABLE public.fg_inventory DROP CONSTRAINT IF EXISTS fg_inventory_last_updated_by_fkey;
ALTER TABLE public.fg_inventory ADD CONSTRAINT fg_inventory_last_updated_by_fkey FOREIGN KEY (last_updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 6. activity_logs
ALTER TABLE public.activity_logs DROP CONSTRAINT IF EXISTS activity_logs_user_id_fkey;
ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 7. plan_materials
ALTER TABLE public.plan_materials DROP CONSTRAINT IF EXISTS plan_materials_dispensed_by_fkey;
ALTER TABLE public.plan_materials ADD CONSTRAINT plan_materials_dispensed_by_fkey FOREIGN KEY (dispensed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 8. concrete_orders requested_by
ALTER TABLE public.concrete_orders DROP CONSTRAINT IF EXISTS concrete_orders_requested_by_fkey;
ALTER TABLE public.concrete_orders ADD CONSTRAINT concrete_orders_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 9. concrete_orders supplied_by
ALTER TABLE public.concrete_orders DROP CONSTRAINT IF EXISTS concrete_orders_supplied_by_fkey;
ALTER TABLE public.concrete_orders ADD CONSTRAINT concrete_orders_supplied_by_fkey FOREIGN KEY (supplied_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 10. qc_inspections
ALTER TABLE public.qc_inspections DROP CONSTRAINT IF EXISTS qc_inspections_qc_id_fkey;
ALTER TABLE public.qc_inspections ADD CONSTRAINT qc_inspections_qc_id_fkey FOREIGN KEY (qc_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 11. fg_receipts
ALTER TABLE public.fg_receipts DROP CONSTRAINT IF EXISTS fg_receipts_warehouse_id_fkey;
ALTER TABLE public.fg_receipts ADD CONSTRAINT fg_receipts_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
