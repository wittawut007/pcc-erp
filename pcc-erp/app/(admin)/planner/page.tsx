export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import PlannerClient from './PlannerClient'
import { createClient } from '@/lib/supabase/server'

export default async function PlannerPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: products } = await supabase
    .from('products')
    .select('id, code, name, category, size, concrete_per_unit, unit, bom_code, wip_code')
    .eq('is_active', true)
    .order('category')

  const { data: todayPlan } = await supabase
    .from('production_plans')
    .select('*, items:production_plan_items(*, product:products(*))')
    .eq('plan_date', today)
    .single()

  const { data: rawMaterials } = await supabase
    .from('raw_materials')
    .select('id, name, qty_on_hand, unit, min_stock')
    .order('category')

  const { data: wipInventory } = await supabase
    .from('wip_inventory')
    .select('product_id, qty_on_hand')

  // Fetch a generic active worker token for the QR code
  const { data: workerProfile } = await supabase
    .from('profiles')
    .select('worker_token')
    .eq('role', 'worker')
    .eq('is_active', true)
    .limit(1)
    .single()

  const workerToken = workerProfile?.worker_token || ''

  return (
    <>
      <Header 
        title="จัดการแผนการผลิตรายวัน (Planner)" 
        subtitle="จัดการตั้งค่าเป้าหมายการผลิตและตรวจสอบ (BOM) โครงเหล็ก" 
      />
      <PlannerClient
        products={products ?? []}
        todayPlan={todayPlan ?? null}
        rawMaterials={rawMaterials ?? []}
        wipInventory={wipInventory ?? []}
        today={today}
        workerToken={workerToken}
      />
    </>
  )
}
