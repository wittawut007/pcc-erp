-- =====================================================
-- Migration 020: Add missing columns to concrete_orders
-- =====================================================

ALTER TABLE public.concrete_orders
  ADD COLUMN IF NOT EXISTS bed TEXT,
  ADD COLUMN IF NOT EXISTS round_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_qty_requested NUMERIC(10,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS production_order_id UUID REFERENCES public.production_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS concrete_group TEXT;
