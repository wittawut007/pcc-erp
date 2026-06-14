'use server'

import { createClient } from '@/lib/supabase/server'

export interface SidebarBadgeCounts {
  productionOrder: number // ใบสั่งผลิต
  jobOrders: number       // คิวงานเทคอนกรีต
  demolding: number       // งานตัดยก
  material: number        // เบิกจ่ายวัตถุดิบ
  concrete: number        // คิวผสมคอนกรีต
  fgInventory: number     // สินค้าพร้อมขาย
}

const EMPTY_COUNTS: SidebarBadgeCounts = {
  productionOrder: 0,
  jobOrders: 0,
  demolding: 0,
  material: 0,
  concrete: 0,
  fgInventory: 0,
}

/**
 * นับ distinct production_orders โดยนับจาก array ที่ดึงมา
 * (Supabase JS client ไม่รองรับ COUNT(DISTINCT) โดยตรง)
 */
function countDistinctPO(data: Array<{ order_id?: string | null }> | null): number {
  if (!data || data.length === 0) return 0
  const ids = new Set(data.map(r => r.order_id).filter(Boolean))
  return ids.size
}

/**
 * ดึงจำนวน production_orders (PO) ที่ "กำลังดำเนินการ" ในแต่ละขั้นตอน
 * นับเป็น "ใบสั่งผลิต PO" เสมอ ไม่ใช่จำนวนรายการสินค้า
 */
export async function getSidebarBadgeCounts(): Promise<SidebarBadgeCounts> {
  try {
    const supabase = await createClient()

    const [
      productionOrderRes,
      jobOrdersRes,
      demoldingRes,
      materialRes,
      concreteRes,
      fgInventoryRes,
    ] = await Promise.all([

      // 1. ใบสั่งผลิต
      // นับ production_orders ที่ยังไม่ erp_synced
      supabase
        .from('production_orders')
        .select('id')
        .neq('status', 'erp_synced'),

      // 2. คิวงานเทคอนกรีต
      // นับ distinct PO ที่มี job_orders อยู่ในสถานะ active
      // job_orders.order_id = production_orders.id
      supabase
        .from('job_orders')
        .select('order_id, production_order:production_orders!job_orders_order_id_fkey(status)')
        .in('status', ['pending', 'concrete_ordered', 'casting', 'curing', 'ready_demold']),

      // 3. งานตัดยก
      // นับ distinct PO ที่มี job_orders รอตัดยก/กำลังบ่ม
      supabase
        .from('job_orders')
        .select('order_id, production_order:production_orders!job_orders_order_id_fkey(status)')
        .in('status', ['ready_demold', 'curing']),

      // 4. เบิกจ่ายวัตถุดิบ
      // นับ distinct PO ผ่าน production_plans ที่มี plan_materials ค้างอยู่
      // plan_materials → plan_id → production_plans → production_orders
      supabase
        .from('plan_materials')
        .select('plan:production_plans!inner(id, status, production_orders(id, status))')
        .in('status', ['pending', 'partial']),

      // 5. คิวผสมคอนกรีต
      // ดึง concrete_orders ที่รอดำเนินการ (status = 'requested') พร้อม rounds เพื่อใช้นับรอบที่ค้างอยู่
      supabase
        .from('concrete_orders')
        .select('id, rounds:concrete_rounds(status)')
        .eq('status', 'requested'),

      // 6. สินค้าพร้อมขาย
      // นับ production_orders ที่ยังไม่ erp_synced แต่มี job_orders ที่ถอดแบบแล้ว
      supabase
        .from('production_orders')
        .select('id, job_orders!inner(status, demolding_records!inner(id))')
        .neq('status', 'erp_synced'),
    ])

    // ── 1. ใบสั่งผลิต — count PO โดยตรง ──
    const productionOrderCount = productionOrderRes.data?.length ?? 0

    // ── 2. คิวงานเทคอนกรีต — distinct PO ที่ไม่ erp_synced ──
    const jobOrdersData = jobOrdersRes.data ?? []
    const jobOrdersFiltered = jobOrdersData.filter(
      (j: any) => j.production_order?.status !== 'erp_synced'
    )
    const jobOrdersCount = countDistinctPO(
      jobOrdersFiltered.map((j: any) => ({ order_id: j.order_id }))
    )

    // ── 3. งานตัดยก — distinct PO ที่ไม่ erp_synced ──
    const demoldingData = demoldingRes.data ?? []
    const demoldingFiltered = demoldingData.filter(
      (j: any) => j.production_order?.status !== 'erp_synced'
    )
    const demoldingCount = countDistinctPO(
      demoldingFiltered.map((j: any) => ({ order_id: j.order_id }))
    )

    // ── 4. เบิกจ่ายวัตถุดิบ — distinct PO ผ่าน plan ที่มีวัตถุดิบค้าง ──
    const materialData = materialRes.data ?? []
    const materialPoIds = new Set<string>()
    for (const row of materialData) {
      const plan = (row as any).plan
      if (!plan) continue
      // เฉพาะ plan ที่ confirmed หรือ completed
      if (plan.status !== 'confirmed' && plan.status !== 'completed') continue
      const orders: Array<{ id: string; status: string }> = plan.production_orders ?? []
      for (const po of orders) {
        if (po.status !== 'erp_synced') {
          materialPoIds.add(po.id)
        }
      }
    }
    const materialCount = materialPoIds.size

    // ── 5. คิวผสมคอนกรีต — นับจำนวนรอบคอนกรีตที่ยังค้างอยู่ (status = 'pending') ──
    const concreteOrders = concreteRes.data ?? []
    let concreteCount = 0
    for (const order of concreteOrders) {
      const rounds = order.rounds ?? []
      const pendingRounds = rounds.filter((r: any) => r.status === 'pending')
      concreteCount += pendingRounds.length
    }

    // ── 6. สินค้าพร้อมขาย — count PO โดยตรง ──
    const fgInventoryCount = fgInventoryRes.data?.length ?? 0

    return {
      productionOrder: productionOrderCount,
      jobOrders: jobOrdersCount,
      demolding: demoldingCount,
      material: materialCount,
      concrete: concreteCount,
      fgInventory: fgInventoryCount,
    }
  } catch (error) {
    console.error('[getSidebarBadgeCounts] error:', error)
    return EMPTY_COUNTS
  }
}
