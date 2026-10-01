'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logError } from '@/lib/logger'
import { receiveCounterfortToStock, deductCounterfortStock } from './component'


/**
 * QC ยืนยันการเทคอนกรีต (Pour Inspection)
 * phase: 'main' | 'counterfort' | 'stem'
 * - main/counterfort: บันทึกใน qc_inspections.counterfort_pour_ok (or pour_ok สำหรับ main)
 * - stem: บันทึกใน qc_inspections.stem_pour_ok
 */
export async function inspectPour(
  jobOrderId: string,
  pourOk: boolean,
  pourNotes?: string,
  phase: 'main' | 'counterfort' | 'stem' = 'main'
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const now = new Date().toISOString()

  // กำหนด field ที่จะ update ตาม phase
  const phaseFields: Record<string, any> = { qc_id: user.id }
  if (phase === 'stem') {
    phaseFields.stem_pour_ok = pourOk
    phaseFields.stem_pour_notes = pourNotes ?? null
    phaseFields.stem_inspected_at = now
  } else {
    // 'counterfort' หรือ 'main' — ใช้ counterfort_pour_ok และ pour_ok ร่วมกัน
    phaseFields.counterfort_pour_ok = pourOk
    phaseFields.counterfort_pour_notes = pourNotes ?? null
    phaseFields.counterfort_inspected_at = now
    phaseFields.pour_ok = pourOk
    phaseFields.pour_notes = pourNotes ?? null
    phaseFields.pour_inspected_at = now
  }

  // Upsert qc_inspection (อาจมีอยู่แล้วหากตรวจรอบก่อน)
  const { data: existing } = await supabase
    .from('qc_inspections')
    .select('id')
    .eq('job_order_id', jobOrderId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('qc_inspections')
      .update(phaseFields)
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('qc_inspections')
      .insert({ job_order_id: jobOrderId, ...phaseFields })
    if (error) throw new Error(error.message)
  }

  // Log action
  try {
    const { data: job } = await supabase
      .from('job_orders')
      .select('bed, plan_item(product(name))')
      .eq('id', jobOrderId)
      .single()
    const planItem = job?.plan_item as any
    const product = planItem?.product as any
    const detailText = `ตรวจการเทคอนกรีตโรงผลิต ${job?.bed || '-'} | ผลตรวจ: ${pourOk ? 'ผ่าน (OK)' : 'ไม่ผ่าน (FAIL)'} (สินค้า: ${product?.name ?? 'ไม่ระบุ'}, เฟส: ${phase === 'counterfort' ? 'CF' : phase === 'stem' ? 'STEM' : 'ปกติ'})${pourNotes ? ' | หมายเหตุ: ' + pourNotes : ''}`

    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action_type: 'เทคอนกรีต',
      entity_type: 'job_order',
      entity_id: jobOrderId,
      detail: detailText,
    })
  } catch (err) {
    await logError({ action: 'inspectPour/activityLog', error: err, context: { jobOrderId, phase } })
  }

  revalidatePath('/qc')
  revalidatePath('/qc-inspect')
}

/**
 * QC เริ่มการบ่มคอนกรีต
 * phase: 'main' | 'counterfort' | 'stem'
 * - counterfort: บันทึก counterfort_cast_at และ status = counterfort_curing
 * - stem: บันทึก stem_cast_at และ status = stem_curing
 * - main: ใช้ cast_at เดิม
 */
export async function startCuring(jobOrderId: string, photoUrl: string, phase: 'main' | 'counterfort' | 'stem' = 'main') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Check if job order has preparation photo before allowing curing
  const { data: targetJob } = await supabase
    .from('job_orders')
    .select('cast_at, photo_ready_url, photo_counterfort_url')
    .eq('id', jobOrderId)
    .single()

  const hasPrepPhoto = phase === 'stem' 
    ? (!!targetJob?.photo_counterfort_url || !!targetJob?.photo_ready_url)
    : !!targetJob?.photo_ready_url

  if (!hasPrepPhoto) {
    throw new Error('ไม่สามารถบันทึกเริ่มบ่มได้ เนื่องจากยังไม่มีการอัปโหลดรูปถ่ายเตรียมการก่อนสั่งคอนกรีต กรุณาแจ้งพนักงานอัปโหลดรูปถ่ายก่อน')
  }

  const now = new Date().toISOString()

  // กำหนด payload ตาม phase
  let jobUpdatePayload: Record<string, any>
  if (phase === 'counterfort') {
    jobUpdatePayload = {
      status: 'counterfort_curing',
      counterfort_cast_at: now,
      photo_counterfort_url: photoUrl,
    }
  } else if (phase === 'stem') {
    jobUpdatePayload = {
      status: 'stem_curing',
      stem_cast_at: now,
      photo_stem_url: photoUrl,
    }
  } else {
    // main flow (เดิม)
    jobUpdatePayload = {
      status: 'curing',
      cast_at: targetJob?.cast_at || now,
      photo_cast_url: photoUrl,
    }
  }

  const { error } = await supabase.from('job_orders').update(jobUpdatePayload).eq('id', jobOrderId)
  if (error) throw new Error(error.message)

  // Upsert qc_inspections ตาม phase
  const { data: existing } = await supabase.from('qc_inspections').select('id').eq('job_order_id', jobOrderId).maybeSingle()
  const qcPhaseFields: Record<string, any> = { qc_id: user.id }
  if (phase === 'stem') {
    qcPhaseFields.stem_pour_ok = true
    qcPhaseFields.stem_inspected_at = now
  } else {
    qcPhaseFields.counterfort_pour_ok = true
    qcPhaseFields.counterfort_inspected_at = now
    qcPhaseFields.pour_ok = true
    qcPhaseFields.pour_inspected_at = now
  }

  if (existing) {
    await supabase.from('qc_inspections').update(qcPhaseFields).eq('id', existing.id)
  } else {
    await supabase.from('qc_inspections').insert({ job_order_id: jobOrderId, ...qcPhaseFields })
  }

  // Log action
  try {
    const { data: job } = await supabase
      .from('job_orders')
      .select('bed, plan_item(product(name))')
      .eq('id', jobOrderId)
      .single()
    const planItem = job?.plan_item as any
    const product = planItem?.product as any
    const detailText = `เริ่มกระบวนการบ่มปูนโรงผลิต ${job?.bed || '-'} | บันทึกภาพถ่าย (สินค้า: ${product?.name ?? 'ไม่ระบุ'}, เฟส: ${phase === 'counterfort' ? 'CF' : phase === 'stem' ? 'STEM' : 'ปกติ'})`

    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action_type: 'เริ่มการบ่ม',
      entity_type: 'job_order',
      entity_id: jobOrderId,
      detail: detailText,
    })
  } catch (err) {
    await logError({ action: 'startCuring/activityLog', error: err, context: { jobOrderId, phase } })
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
  const { data: job } = await supabase.from('job_orders').select('job_type, plan_item:production_plan_items(product:products(id, name, code, category, counterfort_material_id, counterfort_qty_per_unit))').eq('id', jobOrderId).single()


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

  // 3. Update fg_inventory or raw_materials SFG stock — plan_item is an array from Supabase join
  const planItem = Array.isArray(job?.plan_item) ? job.plan_item[0] : job?.plan_item
  const product = Array.isArray(planItem?.product) ? planItem.product[0] : planItem?.product
  const productId = product?.id
  if (productId && demoldQtyGood > 0) {
    const isComponent = (job as any)?.job_type === 'component' || product?.category?.includes('Counterfort') || product?.category?.includes('SFG') || product?.code?.startsWith('CF-')
    if (isComponent) {
      let cfMaterialId = product?.counterfort_material_id
      if (!cfMaterialId && product) {
        const { data: sfgByCode } = await supabase
          .from('raw_materials')
          .select('id')
          .eq('category', 'ชิ้นส่วน SFG')
          .eq('material_code', product.code)
          .maybeSingle()

        if (sfgByCode?.id) {
          cfMaterialId = sfgByCode.id
        } else {
          const { data: sfgByName } = await supabase
            .from('raw_materials')
            .select('id')
            .eq('category', 'ชิ้นส่วน SFG')
            .eq('name', product.name)
            .maybeSingle()
          if (sfgByName?.id) cfMaterialId = sfgByName.id
        }
      }

      if (cfMaterialId) {
        await receiveCounterfortToStock(cfMaterialId, demoldQtyGood, jobOrderId)
      }
    } else {
      const { data: existingFg } = await supabase.from('fg_inventory').select('id, qty').eq('product_id', productId).maybeSingle()
      if (existingFg) {
        await supabase.from('fg_inventory').update({ qty: existingFg.qty + demoldQtyGood, updated_at: now, last_updated_by: user.id }).eq('id', existingFg.id)
      } else {
        await supabase.from('fg_inventory').insert({ product_id: productId, qty: demoldQtyGood, last_updated_by: user.id })
      }

      // 3.1 ตัดเบิก Counterfort SFG ออกจากคลัง raw_materials ถ้าสินค้านี้ผูกชิ้นส่วน Counterfort ไว้
      const cfMaterialId = product?.counterfort_material_id
      const cfQtyPerUnit = product?.counterfort_qty_per_unit ?? 0
      if (cfMaterialId && cfQtyPerUnit > 0) {
        const totalCfToDeduct = demoldQtyGood * cfQtyPerUnit
        try {
          await deductCounterfortStock(cfMaterialId, totalCfToDeduct, jobOrderId)
        } catch (err) {
          console.error('Failed to deduct counterfort stock:', err)
          await logError({ action: 'saveDemoldingRecord/deductCounterfortStock', error: err, context: { cfMaterialId, totalCfToDeduct, jobOrderId } })
        }
      }
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
 * รองรับทั้ง job_type = 'fg' และ 'component' (Counterfort)
 */
export async function getQCJobOrders() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('job_orders')
    .select(`
      *,
      plan_item:production_plan_items(
        bed,
        product:products(
          id, name, code, category, unit, size,
          concrete_per_unit, counterfort_material_id
        )
      ),
      worker:profiles!job_orders_worker_id_fkey(full_name),
      qc_inspection:qc_inspections(
        *,
        pour_ok,
        pour_notes,
        pour_inspected_at
      ),
      defect_breakdowns:job_order_defects(*),
      production_order:production_orders(order_number, status)
    `)
    .in('status', [
      'concrete_ordered', 'casting', 'curing', 'ready_demold',
      'counterfort_ordered', 'counterfort_curing', 'stem_ordered', 'stem_curing'
    ])
    .in('job_type', ['fg', 'component'])
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

  const { data: job } = await supabase.from('job_orders').select('status').eq('id', jobOrderId).single()
  const pastDate = new Date(Date.now() - 21 * 60 * 60 * 1000).toISOString()
  
  const updatePayload: Record<string, any> = {}
  if (job?.status === 'counterfort_curing') {
    updatePayload.counterfort_cast_at = pastDate
  } else if (job?.status === 'stem_curing') {
    updatePayload.stem_cast_at = pastDate
  } else {
    updatePayload.cast_at = pastDate
  }

  const { error } = await supabase.from('job_orders').update(updatePayload).eq('id', jobOrderId)

  if (error) throw new Error(error.message)
  revalidatePath('/qc-inspect')
}
