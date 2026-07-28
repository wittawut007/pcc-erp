-- =====================================================
-- Migration 019: Add receiver_name column to plan_materials
-- =====================================================

ALTER TABLE public.plan_materials ADD COLUMN IF NOT EXISTS receiver_name TEXT;
