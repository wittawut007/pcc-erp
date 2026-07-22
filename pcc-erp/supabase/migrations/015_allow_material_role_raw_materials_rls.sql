-- ==============================================================================
-- Migration: 015_allow_material_role_raw_materials_rls.sql
-- Description: Allow 'material' and 'warehouse' roles to manage raw_materials
-- Applied: 2026-07-22
-- ==============================================================================

DROP POLICY IF EXISTS "Admins and planners manage raw materials" ON public.raw_materials;
DROP POLICY IF EXISTS "Admins, planners, material, and warehouse manage raw materials" ON public.raw_materials;

CREATE POLICY "Admins, planners, material, and warehouse manage raw materials" ON public.raw_materials
FOR ALL TO authenticated
USING (public.get_auth_user_role() IN ('admin', 'planner', 'material', 'warehouse'))
WITH CHECK (public.get_auth_user_role() IN ('admin', 'planner', 'material', 'warehouse'));
