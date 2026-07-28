export const dynamic = 'force-dynamic'

import WorkerClient from './WorkerClient'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function WorkerPage() {
  const supabaseAdmin = createAdminClient()

  // 1. Get all plans and their materials (รวม status ของวัตถุดิบแต่ละรายการ)
  const { data: plans } = await supabaseAdmin
    .from('production_plans')
    .select(`
      id,
      materials:plan_materials(
        id, status, qty_required, qty_dispensed,
        raw_material:raw_materials(id, name, category, unit, weight_per_meter)
      )
    `)

  // Build a map: planId -> materials summary (สำหรับแสดงรายการวัตถุดิบใน worker)
  const planMaterialsMap: Record<string, { name: string; qty: number; unit: string }[]> = {}
  plans?.forEach((p: any) => {
    planMaterialsMap[p.id] = (p.materials || []).map((m: any) => ({
      name: m.raw_material?.name || 'Unknown Material',
      qty: m.qty_dispensed || m.qty_required || 0,
      unit: m.raw_material?.unit || '',
    }))
  })

  // Build a map: planId -> วัตถุดิบถูกจ่ายครบหรือยัง
  // กฎ: ถ้าแผนไม่มี plan_materials เลย → ถือว่าไม่ต้องการวัตถุดิบ → ผ่าน (true)
  //     ถ้ามี plan_materials → ทุกรายการต้อง status === 'dispensed' จึงจะถือว่าพร้อม
  const planMaterialDispensedMap: Record<string, boolean> = {}
  plans?.forEach((p: any) => {
    const materials = p.materials || []
    if (materials.length === 0) {
      planMaterialDispensedMap[p.id] = true
    } else {
      planMaterialDispensedMap[p.id] = materials.every((m: any) => m.status === 'dispensed')
    }
  })

  // 2. Fetch plan items mapping
  const { data: planItems } = await supabaseAdmin
    .from('production_plan_items')
    .select('id, plan_id')

  const planItemToPlanMap: Record<string, string> = {}
  planItems?.forEach((i: any) => { planItemToPlanMap[i.id] = i.plan_id })

  // 3. Fetch active job orders (status: pending เท่านั้น)
  const { data: jobOrders } = await supabaseAdmin
    .from('job_orders')
    .select(`
      id, bed, status, qty_target, qty_cast, expected_demold_at, plan_item_id, order_id,
      cast_at, job_type,
      production_order:production_orders(order_number, status),
      plan_item:production_plan_items(
        id, plan_id,
        product:products(
          id, code, name, category, size, unit,
          concrete_per_unit, wire_per_unit, mesh_per_unit, rebar_per_unit, concrete_group,
          counterfort_material_id, counterfort_qty_per_unit
        )
      )
    `)
    .eq('status', 'pending')
    .in('job_type', ['fg', 'component'])
    .order('created_at', { ascending: false })

  const activeJobOrders = (jobOrders as any)?.filter(
    (j: any) => j.production_order?.status !== 'erp_synced' && j.production_order?.status !== 'cancelled'
  ) || []

  // 4. Fetch BOM items for all products in active jobs
  const productIds = Array.from(new Set(
    activeJobOrders
      .map((j: any) => j.plan_item?.product?.id)
      .filter(Boolean)
  )) as string[]

  const productBomByPhase: Record<string, { name: string; phase: string; qty_per_unit: number }[]> = {}
  if (productIds.length > 0) {
    const { data: bomItems } = await supabaseAdmin
      .from('product_bom_items')
      .select('product_id, phase, qty_per_unit, raw_material:raw_materials(name, category, unit)')
      .in('product_id', productIds)

    bomItems?.forEach((b: any) => {
      if (!productBomByPhase[b.product_id]) productBomByPhase[b.product_id] = []
      productBomByPhase[b.product_id].push({
        name: b.raw_material?.name || '',
        phase: b.phase || 'all',
        qty_per_unit: Number(b.qty_per_unit) || 0,
      })
    })
  }

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center w-full">
      <div className="w-full max-w-[480px] bg-white min-h-screen flex flex-col shadow-[0_0_40px_rgba(0,0,0,0.05)] relative">
        <WorkerClient
          jobOrders={activeJobOrders}
          planMaterialsMap={planMaterialsMap}
          planItemToPlanMap={planItemToPlanMap}
          productBomByPhase={productBomByPhase}
          planMaterialDispensedMap={planMaterialDispensedMap}
        />
      </div>
    </div>
  )
}
