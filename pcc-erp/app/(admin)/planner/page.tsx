export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import PlannerClient from './PlannerClient'
import { createClient } from '@/lib/supabase/server'

export default async function PlannerPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: products } = await supabase
    .from('products')
    .select('id, code, name, category, concrete_per_unit, unit')
    .eq('is_active', true)
    .order('category')

  const { data: todayPlan } = await supabase
    .from('production_plans')
    .select('*, items:production_plan_items(*, product:products(*))')
    .eq('plan_date', today)
    .single()

  const { data: rawMaterials } = await supabase
    .from('raw_materials')
    .select('name, qty_on_hand, unit, min_stock')
    .order('category')

  return (
    <>
      <Header title="แผนการผลิต" subtitle={`วันที่ ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`} />
      <PlannerClient
        products={products ?? []}
        todayPlan={todayPlan ?? null}
        rawMaterials={rawMaterials ?? []}
        today={today}
      />
    </>
  )
}
