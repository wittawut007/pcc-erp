'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * QC ยืนยันการเทคอนกรีต (Pour Inspection)
 */
export async function inspectPour(
  jobOrderId: string,
  pourOk: boolean,
  pourNotes?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const now = new Date().toISOString()

  // Upsert qc_inspection (อาจมีอยู่แล้วหากตรวจรอบก่อน)
  const { data: existing } = await supabase
    .from('qc_inspections')
    .select('id')
    .eq('job_order_id', jobOrderId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('qc_inspections')
      .update({
        qc_id: user.id,
        pour_ok: pourOk,
        pour_notes: pourNotes ?? null,
        pour_inspected_at: now,
      })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('qc_inspections')
      .insert({
        job_order_id: jobOrderId,
        qc_id: user.id,
        pour_ok: pourOk,
        pour_notes: pourNotes ?? null,
        pour_inspected_at: now,
      })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/qc')
}

/**
 * QC บันทึกผลการตรวจสอบการถอดแบบ (Demold Inspection)
 * - บันทึกจำนวนดี/เสีย สาเหตุ ภาพถ่าย
 * - เปลี่ยน job_order status → qc_passed
 */
export async function recordDemoldInspection(
  jobOrderId: string,
  demoldQtyGood: number,
  demoldQtyDefect: number,
  defectReason?: string,
  defectDetail?: string,
  photoUrl?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const now = new Date().toISOString()

  // Upsert qc_inspection
  const { data: existing } = await supabase
    .from('qc_inspections')
    .select('id')
    .eq('job_order_id', jobOrderId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('qc_inspections')
      .update({
        qc_id: user.id,
        demold_qty_good: demoldQtyGood,
        demold_qty_defect: demoldQtyDefect,
        defect_reason: defectReason ?? null,
        defect_detail: defectDetail ?? null,
        photo_url: photoUrl ?? null,
        demold_inspected_at: now,
      })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('qc_inspections')
      .insert({
        job_order_id: jobOrderId,
        qc_id: user.id,
        demold_qty_good: demoldQtyGood,
        demold_qty_defect: demoldQtyDefect,
        defect_reason: defectReason ?? null,
        defect_detail: defectDetail ?? null,
        photo_url: photoUrl ?? null,
        demold_inspected_at: now,
      })
    if (error) throw new Error(error.message)
  }

  // อัปเดต job_order status → qc_passed
  const { error: jobErr } = await supabase
    .from('job_orders')
    .update({
      status: 'qc_passed',
      demolded_at: now,
    })
    .eq('id', jobOrderId)

  if (jobErr) throw new Error(jobErr.message)

  revalidatePath('/qc')
  revalidatePath('/inventory/fg')
}

/**
 * ดึงรายการงานที่ QC ต้องตรวจ (สำหรับ QC Mobile)
 */
export async function getQCJobOrders() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('job_orders')
    .select(`
      *,
      plan_item:production_plan_items(
        bed,
        product:products(name, code, category)
      ),
      worker:profiles!job_orders_worker_id_fkey(full_name),
      qc_inspection:qc_inspections(*)
    `)
    .in('status', ['casting', 'curing', 'ready_demold', 'demolded'])
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}
