-- =====================================================
-- Migration 021: Create concrete_rounds table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.concrete_rounds (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  concrete_order_id UUID REFERENCES public.concrete_orders(id) ON DELETE CASCADE NOT NULL,
  round_number INTEGER NOT NULL,
  qty_per_round NUMERIC(8,3) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  supplied_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  supplied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.concrete_rounds ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated read concrete_rounds"
  ON public.concrete_rounds FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated insert concrete_rounds"
  ON public.concrete_rounds FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated update concrete_rounds"
  ON public.concrete_rounds FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated delete concrete_rounds"
  ON public.concrete_rounds FOR DELETE USING (auth.role() = 'authenticated');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_concrete_rounds_order_id ON public.concrete_rounds(concrete_order_id);
