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
 * QC เริ่มการบ่มคอนกรีต
 */
export async function startCuring(jobOrderId: string, photoUrl: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const now = new Date().toISOString()

  // Fetch the current job to check if cast_at is already set
  const { data: job } = await supabase
    .from('job_orders')
    .select('cast_at')
    .eq('id', jobOrderId)
    .single()

  const curingStartAt = job?.cast_at || now

  const { error } = await supabase.from('job_orders').update({
    status: 'curing',
    cast_at: curingStartAt,
    photo_cast_url: photoUrl
  }).eq('id', jobOrderId)

  if (error) throw new Error(error.message)

  // Upsert qc_inspections
  const { data: existing } = await supabase.from('qc_inspections').select('id').eq('job_order_id', jobOrderId).maybeSingle()
  if (existing) {
    await supabase.from('qc_inspections').update({ qc_id: user.id, pour_ok: true, pour_inspected_at: now }).eq('id', existing.id)
  } else {
    await supabase.from('qc_inspections').insert({ job_order_id: jobOrderId, qc_id: user.id, pour_ok: true, pour_inspected_at: now })
  }

  revalidatePath('/qc-inspect')
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
  photoUrl?: string,
  defectBreakdown?: { reason: string; qty: number }[]
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const now = new Date().toISOString()
  const primaryReason = defectReason || (defectBreakdown && defectBreakdown[0]?.reason) || null

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
        defect_reason: primaryReason,
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
        defect_reason: primaryReason,
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
      status: 'demolded',
      demolded_at: now,
    })
    .eq('id', jobOrderId)

  if (jobErr) throw new Error(jobErr.message)

  // 1. Get job order details for inventory
  const { data: job } = await supabase.from('job_orders').select('plan_item:production_plan_items(product:products(id, name))').eq('id', jobOrderId).single()

  // 2. Insert into demolding_records
  const { data: record, error: recError } = await supabase.from('demolding_records').insert({
    job_order_id: jobOrderId,
    worker_id: user.id, // Using QC user ID here
    qty_good: demoldQtyGood,
    qty_defect: demoldQtyDefect,
    defect_reason: primaryReason,
    photo_url: photoUrl ?? null
  }).select().single()

  if (recError) throw new Error(recError.message)

  // 2.5 Save detailed defect breakdown list to job_order_defects
  await supabase.from('job_order_defects').delete().eq('job_order_id', jobOrderId)
  if (defectBreakdown && defectBreakdown.length > 0) {
    const inserts = defectBreakdown
      .filter(item => item.qty > 0 && item.reason)
      .map(item => ({
        job_order_id: jobOrderId,
        defect_reason: item.reason as any,
        qty: item.qty
      }))
    if (inserts.length > 0) {
      const { error: err } = await supabase.from('job_order_defects').insert(inserts)
      if (err) throw new Error(err.message)
    }
  }

  // 3. Update fg_inventory — plan_item is an array from Supabase join
  const planItem = Array.isArray(job?.plan_item) ? job.plan_item[0] : job?.plan_item
  const product = Array.isArray(planItem?.product) ? planItem.product[0] : planItem?.product
  const productId = product?.id
  if (productId && demoldQtyGood > 0) {
    const { data: existingFg } = await supabase.from('fg_inventory').select('id, qty').eq('product_id', productId).single()
    if (existingFg) {
      await supabase.from('fg_inventory').update({ qty: existingFg.qty + demoldQtyGood, updated_at: now, last_updated_by: user.id }).eq('id', existingFg.id)
    } else {
      await supabase.from('fg_inventory').insert({ product_id: productId, qty: demoldQtyGood, last_updated_by: user.id })
    }
  }

  // 4. Activity Log
  await supabase.from('activity_logs').insert({
    user_id: user.id,
    action_type: 'ถอดแบบ & QC (Mobile)',
    entity_type: 'demolding_record',
    entity_id: record?.id,
    detail: `${product?.name} | ดี ${demoldQtyGood} / เสีย ${demoldQtyDefect}`,
  })

  revalidatePath('/qc-inspect')
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
        product:products(id, name, code, category, unit, size)
      ),
      worker:profiles!job_orders_worker_id_fkey(full_name),
      qc_inspection:qc_inspections(*),
      defect_breakdowns:job_order_defects(*)
    `)
    .in('status', ['concrete_ordered', 'casting', 'curing', 'ready_demold', 'demolded'])
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

/**
 * [TESTING] เร่งเวลาการบ่ม (ลด cast_at ไป 21 ชั่วโมง)
 */
export async function fastForwardCuring(jobOrderId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const pastDate = new Date(Date.now() - 21 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase.from('job_orders').update({
    cast_at: pastDate
  }).eq('id', jobOrderId)

  if (error) throw new Error(error.message)
  revalidatePath('/qc-inspect')
}
