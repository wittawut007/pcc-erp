-- ==============================================================================
-- Migration: 014_stricter_role_based_rls_policies.sql
-- Description: Replace overly permissive 'authenticated' write policies with strict role checks
-- Applied: 2026-07-21
-- ==============================================================================

-- Helper function to check current user's profile role safely
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 1. Tighten write permissions on master data (products, raw_materials) to Admin/Planner
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Admins and planners manage products" ON public.products
FOR ALL TO authenticated
USING (public.get_auth_user_role() IN ('admin', 'planner'))
WITH CHECK (public.get_auth_user_role() IN ('admin', 'planner'));

DROP POLICY IF EXISTS "Authenticated users can manage" ON public.raw_materials;
CREATE POLICY "Admins and planners manage raw materials" ON public.raw_materials
FOR ALL TO authenticated
USING (public.get_auth_user_role() IN ('admin', 'planner'))
WITH CHECK (public.get_auth_user_role() IN ('admin', 'planner'));

-- 2. Tighten production_plans write permissions to Admin/Planner
DROP POLICY IF EXISTS "Authenticated users can insert" ON public.production_plans;
DROP POLICY IF EXISTS "Authenticated users can update" ON public.production_plans;

CREATE POLICY "Admins and planners write production_plans" ON public.production_plans
FOR ALL TO authenticated
USING (public.get_auth_user_role() IN ('admin', 'planner'))
WITH CHECK (public.get_auth_user_role() IN ('admin', 'planner'));

-- 3. Tighten activity_logs insert to authenticated users (read restricted to admin)
DROP POLICY IF EXISTS "Authenticated users can read" ON public.activity_logs;
CREATE POLICY "Admins read activity logs" ON public.activity_logs
FOR SELECT TO authenticated
USING (public.get_auth_user_role() = 'admin');
