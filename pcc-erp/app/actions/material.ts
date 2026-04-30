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
 * ลบรายการวัตถุดิบออกจากแผน (โดย Planner)
 */
export async function removePlanMaterial(planMaterialId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
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
  qtyDispensed: number
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // ดึงข้อมูลรายการ
  const { data: planMat, error: fetchErr } = await supabase
    .from('plan_materials')
    .select('*, raw_material:raw_materials(qty_on_hand)')
    .eq('id', planMaterialId)
    .single()

  if (fetchErr || !planMat) throw new Error('ไม่พบรายการวัตถุดิบ')

  const rawMat = planMat.raw_material as { qty_on_hand: number } | null
  const currentStock = rawMat?.qty_on_hand ?? 0
  if (currentStock < qtyDispensed) {
    throw new Error(`สต็อกไม่เพียงพอ (มีอยู่ ${currentStock} ${planMat.unit ?? ''})`)
  }

  const newQtyDispensed = (planMat.qty_dispensed ?? 0) + qtyDispensed
  const newStatus =
    newQtyDispensed >= planMat.qty_required ? 'dispensed' : 'partial'

  // อัปเดต plan_materials
  const { error: updateErr } = await supabase
    .from('plan_materials')
    .update({
      qty_dispensed: newQtyDispensed,
      status: newStatus,
      dispensed_by: user.id,
      dispensed_at: new Date().toISOString(),
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
      raw_material:raw_materials(id, name, unit, qty_on_hand),
      plan:production_plans(id, plan_date, status)
    `)
    .in('status', ['pending', 'partial'])
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}
