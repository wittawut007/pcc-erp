export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import PlannerClient from './PlannerClient'
import { createClient } from '@/lib/supabase/server'

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; plan_id?: string }>
}) {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const params = await searchParams
  const selectedDate = params.date || today
  const editPlanId = params.plan_id || null

  const { data: products } = await supabase
    .from('products')
    .select('id, code, name, category, size, concrete_per_unit, unit, bom_code, wip_code, length, wire_per_unit, mesh_per_unit, rebar_per_unit')
    .eq('is_active', true)
    .order('category')

  const { data: rawMaterials } = await supabase
    .from('raw_materials')
    .select('id, material_code, name, qty_on_hand, unit, min_stock, weight_per_meter, category')
    .order('category')

  const { data: wipInventory } = await supabase
    .from('wip_inventory')
    .select('product_id, qty_on_hand')

  // Fetch recent plans (last 30 days) for the sidebar list
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data: recentPlans } = await supabase
    .from('production_plans')
    .select('id, plan_date, status, total_qty, total_concrete, production_orders(id, order_number, status)')
    .gte('plan_date', thirtyDaysAgo.toISOString().split('T')[0])
    .order('plan_date', { ascending: false })
    .order('created_at', { ascending: false })

  // Load specific plan if editing, else load by date (most recent for that date)
  let editingPlan: any = null
  if (editPlanId) {
    const { data } = await supabase
      .from('production_plans')
      .select('*, items:production_plan_items(*, product:products(*))')
      .eq('id', editPlanId)
      .single()
    editingPlan = data
  } else if (params.date) {
    // Load most-recent plan for that date if navigated by date
    const { data } = await supabase
      .from('production_plans')
      .select('*, items:production_plan_items(*, product:products(*))')
      .eq('plan_date', selectedDate)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    editingPlan = data
  }

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
        editingPlan={editingPlan ?? null}
        recentPlans={recentPlans ?? []}
        rawMaterials={rawMaterials ?? []}
        wipInventory={wipInventory ?? []}
        today={today}
        selectedDate={selectedDate}
        workerToken={workerToken}
      />
    </>
  )
}
