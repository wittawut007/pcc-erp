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

