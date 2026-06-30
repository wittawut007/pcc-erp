'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * ดึงรายการวัตถุดิบของแผนการผลิต
 */
export async function getPlanMaterials(planId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plan_materials')
    .select(`
      *,
      raw_material:raw_materials(*),
      dispensed_by_profile:profiles!plan_materials_dispensed_by_fkey(full_name)
    `)
    .eq('plan_id', planId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

/**
 * เพิ่ม/อัปเดตรายการวัตถุดิบในแผนการผลิต (โดย Planner)
 */
export async function upsertPlanMaterial(
  planId: string,
  rawMaterialId: string,
  qtyRequired: number,
  notes?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('plan_materials')
    .upsert({
      plan_id: planId,
      raw_material_id: rawMaterialId,
      qty_required: qtyRequired,
      notes: notes ?? null,
      status: 'pending',
    }, { onConflict: 'plan_id,raw_material_id' })

  if (error) throw new Error(error.message)
  revalidatePath('/planner')
  revalidatePath('/material')
}

/**
 * ลบรายการวัตถุดิบออกจากแผน (เฉพาะ Admin)
 */
export async function removePlanMaterial(planMaterialId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Unauthorized: Only admin can delete materials')

  const { createClient: createServiceClient } = await import('@supabase/supabase-js')
  const serviceClient = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { error } = await serviceClient
    .from('plan_materials')
    .delete()
    .eq('id', planMaterialId)

  if (error) throw new Error(error.message)
  revalidatePath('/planner')
  revalidatePath('/material')
}

/**
 * Material Staff ยืนยันจ่ายวัตถุดิบ
 * - อัปเดต qty_dispensed, status, dispensed_by, dispensed_at
 * - หักสต็อก raw_materials.qty_on_hand
 */
export async function dispenseMaterial(
  planMaterialId: string,
  qtyDispensed: number,
  receiverName?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // ดึงข้อมูลรายการ
  const { data: planMat, error: fetchErr } = await supabase
    .from('plan_materials')
    .select('*, raw_material:raw_materials(id, name, material_code, category, unit, qty_on_hand, weight_per_meter)')
    .eq('id', planMaterialId)
    .single()

  if (fetchErr || !planMat) throw new Error('ไม่พบรายการวัตถุดิบ')

  const rawMat = planMat.raw_material as {
    id: string
    name: string
    material_code: string | null
    category: string
    unit: string
    qty_on_hand: number
    weight_per_meter: number | null
  } | null
  const currentStock = rawMat?.qty_on_hand ?? 0
  
  // ใช้ weight_per_meter จากฐานข้อมูลโดยตรง แทนการ parse regex จาก name
  const isWire = rawMat?.category === 'ลวด' || rawMat?.category === 'Wire'
  const wireFactor = rawMat?.weight_per_meter ?? 0.0989
  
  let requiredTarget = planMat.qty_required;
  if (isWire && wireFactor) {
    requiredTarget = planMat.qty_required * wireFactor;
  }
  
  if (currentStock < qtyDispensed) {
    throw new Error(`สต็อกไม่เพียงพอ (ต้องการหัก ${qtyDispensed.toFixed(2)} หน่วย, มีอยู่ ${currentStock} หน่วย)`)
  }

  const newQtyDispensed = (planMat.qty_dispensed ?? 0) + qtyDispensed
  // We use - 0.01 to avoid floating point precision issues
  const newStatus = newQtyDispensed >= (requiredTarget - 0.01) ? 'dispensed' : 'partial'

  // อัปเดต plan_materials
  const { error: updateErr } = await supabase
    .from('plan_materials')
    .update({
      qty_dispensed: newQtyDispensed,
      status: newStatus,
      dispensed_by: user.id,
      dispensed_at: new Date().toISOString(),
      receiver_name: receiverName || null,
    })
    .eq('id', planMaterialId)

  if (updateErr) throw new Error(updateErr.message)

  // หักสต็อก raw_materials
  const { error: stockErr } = await supabase
    .from('raw_materials')
    .update({ qty_on_hand: currentStock - qtyDispensed })
    .eq('id', planMat.raw_material_id)

  if (stockErr) throw new Error(stockErr.message)

  // Log action
  try {
    const detailText = `จ่ายวัตถุดิบ: ${rawMat?.name ?? 'ไม่ระบุ'} (${rawMat?.material_code ?? '-'}) | จำนวน: ${qtyDispensed} ${rawMat?.unit} | ผู้รับ: ${receiverName || 'ไม่ระบุ'}`
    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action_type: 'เบิกวัตถุดิบ',
      entity_type: 'plan_material',
      entity_id: planMaterialId,
      detail: detailText,
    })
  } catch (err) {
    console.error('Failed to log dispenseMaterial activity:', err)
  }

  revalidatePath('/material')
  revalidatePath('/inventory/raw')
}

/**
 * ดึงรายการ Requisitions ที่ยังรอดำเนินการ (สำหรับ Material Staff)
 */
export async function getPendingRequisitions() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plan_materials')
    .select(`
      *,
      raw_material:raw_materials(id, name, material_code, unit, qty_on_hand, category, weight_per_meter),
      plan:production_plans!inner(id, plan_date, status, total_concrete, production_orders(order_number)),
      dispensed_by_profile:profiles!plan_materials_dispensed_by_fkey(full_name)
    `)
    .in('plan.status', ['confirmed', 'completed'])
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}


/**
 * ดึงข้อมูลสรุปการเบิกจ่ายวัตถุดิบทั้งหมด
 * สำหรับหน้า Summary พร้อม filter วันที่และหมวดหมู่
 */
export async function getMaterialSummary(params?: {
  dateFrom?: string
  dateTo?: string
  category?: string  // 'ลวด' | 'เหล็กเส้น' | 'เมช' | '' (all)
}) {
  const supabase = await createClient()

  let query = supabase
    .from('plan_materials')
    .select(`
      *,
      raw_material:raw_materials(id, name, category, unit, material_code, weight_per_meter),
      plan:production_plans!inner(
        id,
        plan_date,
        status,
        total_concrete,
        production_orders(
          id,
          order_number,
          status,
          job_orders(id, status)
        ),
        items:production_plan_items(
          id,
          qty_target,
          product:products(
            id,
            code,
            name,
            category,
            unit,
            size,
            concrete_per_unit,
            wire_per_unit,
            mesh_per_unit,
            rebar_per_unit,
            product_bom_items(
              qty_per_unit,
              raw_materials(id, name, material_code, unit)
            )
          )
        )
      ),
      dispensed_by_profile:profiles!plan_materials_dispensed_by_fkey(full_name)
    `)
    .order('created_at', { ascending: false })

  if (params?.dateFrom) {
    query = query.gte('plan.plan_date' as any, params.dateFrom)
  }
  if (params?.dateTo) {
    query = query.lte('plan.plan_date' as any, params.dateTo)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  // ถ้ากรองหมวดหมู่ ทำ filter ฝั่ง JS เพราะ nested filter บน Supabase ทำยาก
  let filtered = data ?? []
  if (params?.category && params.category !== '') {
    filtered = filtered.filter((r: any) => r.raw_material?.category === params!.category)
  }

  return filtered
}

/**
 * ดึงข้อมูลสรุปการใช้คอนกรีต
 * แยกตามหมวดหมู่สินค้า (A13/A30/A42...) และ plan.status (confirmed vs completed)
 * concrete_orders → job_orders → production_plan_items → products
 *                             → production_orders → production_plans
 */
export async function getConcreteSummary(params?: {
  dateFrom?: string
  dateTo?: string
}) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('concrete_orders')
    .select(`
      id,
      phase,
      qty_requested,
      status,
      mix_ratio,
      requested_at,
      job_order:job_orders!inner(
        id,
        plan_item:production_plan_items!inner(
          id,
          qty_target,
          product:products!inner(
            id,
            code,
            name,
            category,
            concrete_per_unit
          )
        ),
        production_order:production_orders!inner(
          id,
          plan_id,
          status,
          job_orders(id, status),
          plan:production_plans!inner(
            id,
            plan_date,
            status,
            total_concrete
          )
        )
      )
    `)
    .neq('status', 'cancelled')
    .order('requested_at', { ascending: false })

  if (error) throw new Error(error.message)

  let rows = data ?? []

  // Filter ตาม plan_date
  if (params?.dateFrom || params?.dateTo) {
    rows = rows.filter((r: any) => {
      const planDate = r.job_order?.production_order?.plan?.plan_date
      if (!planDate) return false
      if (params?.dateFrom && planDate < params.dateFrom) return false
      if (params?.dateTo   && planDate > params.dateTo)   return false
      return true
    })
  }

  return rows
}
