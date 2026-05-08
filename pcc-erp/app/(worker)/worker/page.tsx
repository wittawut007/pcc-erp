export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import WorkerClient from './WorkerClient'

export default async function WorkerPage() {
  const supabase = await createClient()

  // Get all plans and check if their materials are fully dispensed
  const { data: plans } = await supabase
    .from('production_plans')
    .select(`
      id,
      materials:plan_materials(
        id, status, qty_required, qty_dispensed,
        raw_material:raw_materials(id, name, category, unit, weight_per_meter)
      )
    `)

  const validPlanIds = plans?.filter(p => {
    if (!p.materials || p.materials.length === 0) return true;
    return p.materials.every((m: any) => m.status === 'dispensed');
  }).map(p => p.id) || []

  // Build a map: planId -> dispensed materials summary
  const planMaterialsMap: Record<string, { name: string; qty: number; unit: string }[]> = {}
  plans?.forEach((p: any) => {
    if (!validPlanIds.includes(p.id)) return;
    planMaterialsMap[p.id] = (p.materials || []).map((m: any) => ({
      name: m.raw_material?.name || '',
      qty: m.qty_dispensed || m.qty_required || 0,
      unit: m.raw_material?.unit || '',
    })).filter((m: any) => m.name)
  })

  const { data: planItems } = await supabase
    .from('production_plan_items')
    .select('id, plan_id')
    .in('plan_id', validPlanIds.length > 0 ? validPlanIds : ['dummy'])

  const planItemIds = planItems?.map(i => i.id) || []

  // Build planItemId -> planId map for material lookup
  const planItemToPlanMap: Record<string, string> = {}
  planItems?.forEach((i: any) => { planItemToPlanMap[i.id] = i.plan_id })

  // Fetch active job orders for plans with fully dispensed materials
  const { data: jobOrders } = await supabase
    .from('job_orders')
    .select(`
      id, bed, status, qty_target, qty_cast, expected_demold_at, plan_item_id,
      plan_item:production_plan_items(
        id, plan_id,
        product:products(id, code, name, category, size, unit, concrete_per_unit)
      )
    `)
    .in('status', ['pending', 'ready_demold', 'curing', 'casting'])
    .in('plan_item_id', planItemIds.length > 0 ? planItemIds : ['dummy'])
  
  return (
    <div className="min-h-screen bg-slate-50 flex justify-center w-full">
      <div className="w-full max-w-[480px] bg-white min-h-screen flex flex-col shadow-[0_0_40px_rgba(0,0,0,0.05)] relative">
        <WorkerClient
          jobOrders={(jobOrders as any) ?? []}
          planMaterialsMap={planMaterialsMap}
          planItemToPlanMap={planItemToPlanMap}
        />
      </div>
    </div>
  )
}
