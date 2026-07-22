-- ==============================================================================
-- Migration: 013_enable_all_rls_and_policies.sql
-- Description: Enable Row Level Security (RLS) across all tables and add missing policies
-- Applied: 2026-07-21
-- ==============================================================================

-- 1. Enable RLS on all tables where RLS was previously disabled
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demolding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fg_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_bom_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wip_inventory ENABLE ROW LEVEL SECURITY;

-- 2. Add missing policy for product_bom_items
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_bom_items' AND policyname = 'allow_auth_all_bom_items'
  ) THEN
    CREATE POLICY "allow_auth_all_bom_items" ON public.product_bom_items
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
