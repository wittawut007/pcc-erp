'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { calculateConcreteRounds } from '@/lib/concrete-utils'
import { logError } from '@/lib/logger'

/**
 * Worker สั่งคอนกรีต — สร้าง concrete_order + concrete_rounds และอัปเดต job_order status
 * รองรับ two-phase production: phase = 'counterfort' | 'stem' | 'main'
 */
export async function requestConcrete(
  jobOrderId: string,
  qtyRequested: number,
  mixRatio?: string,
  notes?: string,
  phase: 'counterfort' | 'stem' | 'main' = 'main'
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // ตรวจสอบว่ามีการอัปโหลดรูปถ่ายเตรียมการก่อนสั่งคอนกรีตหรือไม่
  const { data: targetJob } = await supabase
    .from('job_orders')
    .select('photo_ready_url')
    .eq('id', jobOrderId)
    .single()

  if (!targetJob?.photo_ready_url) {
    throw new Error('ไม่สามารถสั่งคอนกรีตได้ เนื่องจากยังไม่มีการอัปโหลดรูปถ่ายเตรียมการก่อนสั่งคอนกรีต')
  }

  const roundData = calculateConcreteRounds(qtyRequested)
  const roundCount = roundData.length
  const now = new Date().toISOString()

  // กำหนด job_status ตาม phase
  const newJobStatus =
    phase === 'counterfort' ? 'counterfort_ordered'
    : phase === 'stem'      ? 'stem_ordered'
    : 'concrete_ordered'

  // Insert concrete order พร้อมบันทึก phase
  const { data: order, error: orderErr } = await supabase
    .from('concrete_orders')
    .insert({
      job_order_id: jobOrderId,
      requested_by: user.id,
      qty_requested: qtyRequested,
      total_qty_requested: qtyRequested,
      round_count: roundCount,
      mix_ratio: mixRatio ?? null,
      notes: notes ?? null,
      phase,
      status: 'requested',
      requested_at: now,
    })
    .select('id')
    .single()

  if (orderErr || !order) throw new Error(orderErr?.message ?? 'สร้าง concrete_order ไม่สำเร็จ')

  // Insert concrete_rounds
  const rounds = roundData.map((qty, i) => ({
    concrete_order_id: order.id,
    round_number: i + 1,
    qty_per_round: qty,
    status: 'pending',
  }))
  const { error: roundsErr } = await supabase.from('concrete_rounds').insert(rounds)
  if (roundsErr) throw new Error(roundsErr.message)

  // อัปเดต job_order → status ตาม phase
  const { error: jobErr } = await supabase
    .from('job_orders')
    .update({
      status: newJobStatus,
      concrete_requested_at: now,
      cast_at: null,
      worker_id: user.id,
    })
    .eq('id', jobOrderId)

  if (jobErr) throw new Error(jobErr.message)

  // Log action
  try {
    const { data: job } = await supabase
      .from('job_orders')
      .select('bed, qty_target, plan_item(product(name))')
      .eq('id', jobOrderId)
      .single()
    const planItem = job?.plan_item as any
    const product = planItem?.product as any
    const productName = product?.name ?? 'ไม่ระบุ'
    const detailText = `โรงผลิต ${job?.bed || '-'} | สั่งคอนกรีตจำนวน ${qtyRequested} Q สำหรับผลิต ${productName} (เฟส: ${phase === 'counterfort' ? 'CF' : phase === 'stem' ? 'STEM' : 'ปกติ'})`

    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action_type: 'สั่งคอนกรีต (Mobile)',
      entity_type: 'concrete_order',
      entity_id: order.id,
      detail: detailText,
    })
  } catch (err) {
    await logError({ action: 'requestConcrete/activityLog', error: err, context: { jobOrderId } })
  }

  revalidatePath('/worker')
  revalidatePath('/concrete')
}

/**
 * Worker สั่งคอนกรีตแบบ bed-group — สร้าง concrete_order 1 รายการต่อ 1 bed
 * รองรับการสั่งหลาย job_orders ในโรงผลิตเดียวกันพร้อมกัน
 * รูปถ่ายต้อง upload เสร็จก่อน แล้วส่ง photoUrl มา (Client ทำ upload ก่อน)
 */
export async function requestConcreteByBed(payload: {
  bed: string
  jobOrders: Array<{
    id: string
    photoUrl: string
    qtyTarget: number
    concretePerUnit: number
  }>
  concreteGroup: string | null
  productionOrderId: string | null
  notes: string | null
  extraQty: number
}) {
  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { bed, jobOrders, concreteGroup, productionOrderId, notes, extraQty } = payload

  if (jobOrders.length === 0) throw new Error('ไม่มีรายการงานในโรงผลิตนี้')

  const now = new Date().toISOString()

  // อัปเดต job_orders ทุก job ในโรง
  for (const job of jobOrders) {
    if (!job.photoUrl) {
      throw new Error(`กรุณาถ่ายภาพเตรียมงานก่อนสั่งคอนกรีต (Job ID: ${job.id})`)
    }
    const { error: jobErr } = await supabase
      .from('job_orders')
      .update({
        status: 'concrete_ordered',
        cast_at: null,
        qty_cast: job.qtyTarget,
        photo_ready_url: job.photoUrl,
        worker_id: user.id,
        concrete_requested_at: now,
      })
      .eq('id', job.id)
    if (jobErr) throw new Error(`อัปเดตสถานะงานไม่สำเร็จ: ${jobErr.message}`)
  }

  // คำนวณปริมาณคอนกรีตรวม
  const calculatedQty = jobOrders.reduce((sum, j) => sum + j.concretePerUnit * j.qtyTarget, 0)
  const finalQty = calculatedQty + (extraQty || 0)

  const roundData = calculateConcreteRounds(calculatedQty)
  if (extraQty > 0 && roundData.length > 0) {
    roundData[roundData.length - 1] = Number((roundData[roundData.length - 1] + extraQty).toFixed(2))
  }
  const roundCount = roundData.length

  const noteText = extraQty > 0
    ? `สั่งเพิ่มจากที่ระบบคำนวณให้ (คำนวณ: ${calculatedQty.toFixed(2)} คิว, สั่งเพิ่ม: ${extraQty.toFixed(2)} คิว)${notes ? ' | ' + notes : ''}`
    : notes ?? null

  // ใช้ Admin client เพื่อ bypass PostgREST schema cache สำหรับ bed column (enum type bed_name)
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('concrete_orders')
    .insert({
      bed,
      job_order_id: jobOrders[0]?.id ?? null,
      production_order_id: productionOrderId,
      requested_by: user.id,
      qty_requested: finalQty,
      total_qty_requested: finalQty,
      round_count: roundCount,
      status: 'requested',
      concrete_group: concreteGroup,
      phase: 'main',
      notes: noteText,
      requested_at: now,
    })
    .select('id')
    .single()

  if (orderErr || !order) throw new Error(orderErr?.message ?? 'สร้างคำสั่งคอนกรีตไม่สำเร็จ')

  const rounds = roundData.map((qty, i) => ({
    concrete_order_id: order.id,
    round_number: i + 1,
    qty_per_round: qty,
    status: 'pending',
  }))
  const { error: roundsErr } = await supabaseAdmin.from('concrete_rounds').insert(rounds)
  if (roundsErr) throw new Error(roundsErr.message)

  try {
    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action_type: 'สั่งคอนกรีต (Worker)',
      entity_type: 'concrete_order',
      entity_id: order.id,
      detail: `ส่งคำสั่งคอนกรีตโรงผลิต ${bed} จำนวน ${finalQty.toFixed(2)} Q (${roundCount} รอบ)${noteText ? ' | ' + noteText : ''}`,
    })
  } catch (err) {
    await logError({ action: 'requestConcreteByBed/activityLog', error: err, context: { bed } })
  }

  revalidatePath('/worker')
  revalidatePath('/concrete')
}


/**
 * Concrete Staff ยืนยันจ่ายคอนกรีต 1 รอบ
 */
export async function supplyConcreteRound(roundId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // ดึงข้อมูลรอบ
  const { data: round, error: fetchErr } = await supabase
    .from('concrete_rounds')
    .select('id, status, round_number, concrete_order_id')
    .eq('id', roundId)
    .single()

  if (fetchErr || !round) throw new Error('ไม่พบข้อมูลรอบคอนกรีต')
  if (round.status !== 'pending') throw new Error('รอบนี้จ่ายไปแล้ว')

  // ตรวจสอบว่ารอบก่อนหน้า received ครบแล้ว (Handshake mechanism)
  if (round.round_number > 1) {
    const { data: prevRound } = await supabase
      .from('concrete_rounds')
      .select('status')
      .eq('concrete_order_id', round.concrete_order_id)
      .eq('round_number', round.round_number - 1)
      .single()
    if (prevRound?.status !== 'received') throw new Error('ต้องรอให้พนักงานหน้างานกดยืนยันรับรอบก่อนหน้าก่อน')
  }

  const now = new Date().toISOString()

  // อัปเดตรอบนี้
  const { error: updateErr } = await supabase
    .from('concrete_rounds')
    .update({ status: 'supplied', supplied_by: user.id, supplied_at: now })
    .eq('id', roundId)

  if (updateErr) throw new Error(updateErr.message)

  // ตรวจสอบว่าครบทุกรอบหรือยัง
  const { data: allRounds } = await supabase
    .from('concrete_rounds')
    .select('status')
    .eq('concrete_order_id', round.concrete_order_id)

  const allSupplied = allRounds?.every(r => r.status === 'supplied' || r.status === 'received') ?? false

  if (allSupplied) {
    // อัปเดต concrete_order → supplied
    await supabase
      .from('concrete_orders')
      .update({ status: 'supplied', supplied_by: user.id, supplied_at: now })
      .eq('id', round.concrete_order_id)
  }

  // Log action
  try {
    const { data: roundDetails } = await supabase
      .from('concrete_rounds')
      .select('round_number, qty_per_round, concrete_order_id')
      .eq('id', roundId)
      .single()

    let bedName = '-'
    let productName = 'ไม่ระบุ'

    if (roundDetails?.concrete_order_id) {
      const { data: orderData } = await supabase
        .from('concrete_orders')
        .select('*, job_order:job_orders(bed, plan_item:production_plan_items(product:products(name)))')
        .eq('id', roundDetails.concrete_order_id)
        .single()

      const jobObj = Array.isArray((orderData as any)?.job_order) ? (orderData as any)?.job_order[0] : (orderData as any)?.job_order
      bedName = (orderData as any)?.bed || jobObj?.bed || '-'
      const planItemObj = Array.isArray(jobObj?.plan_item) ? jobObj?.plan_item[0] : jobObj?.plan_item
      const productObj = Array.isArray(planItemObj?.product) ? planItemObj?.product[0] : planItemObj?.product
      productName = productObj?.name || 'ไม่ระบุ'
    }

    const detailText = `จ่ายคอนกรีตรอบที่ ${roundDetails?.round_number || 1} จำนวน ${roundDetails?.qty_per_round || 0} Q ไปยังโรงผลิต ${bedName} (สินค้า: ${productName})`
    
    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action_type: 'จ่ายคอนกรีต',
      entity_type: 'concrete_round',
      entity_id: roundId,
      detail: detailText,
    })
  } catch (err) {
    await logError({ action: 'supplyConcreteRound/activityLog', error: err, context: { roundId } })
  }

  revalidatePath('/concrete')
  revalidatePath('/worker')
}

/**
 * Worker ยืนยันรับคอนกรีต 1 รอบ (Handshake)
 */
export async function receiveConcreteRound(roundId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: round, error: fetchErr } = await supabase
    .from('concrete_rounds')
    .select('id, status, round_number, concrete_order_id')
    .eq('id', roundId)
    .single()

  if (fetchErr || !round) throw new Error('ไม่พบข้อมูลรอบคอนกรีต')
  if (round.status !== 'supplied') throw new Error('รอบนี้ยังไม่ได้ถูกส่งมา หรือรับไปแล้ว')

  const { error: updateErr } = await supabase
    .from('concrete_rounds')
    .update({ status: 'received' })
    .eq('id', roundId)

  if (updateErr) throw new Error(updateErr.message)

  // Check if all rounds for this concrete order have been received
  const { data: allRounds } = await supabase
    .from('concrete_rounds')
    .select('status')
    .eq('concrete_order_id', round.concrete_order_id)

  const allReceived = allRounds?.every(r => r.status === 'received') ?? false

  if (allReceived) {
    const nowStr = new Date().toISOString()
    
    // Update concrete_orders status to 'received'
    await supabase
      .from('concrete_orders')
      .update({ status: 'received' })
      .eq('id', round.concrete_order_id)

    // Fetch the order details พร้อม phase เพื่อกำหนด job status ที่ถูกต้อง
    const { data: order } = await supabase
      .from('concrete_orders')
      .select('bed, job_order_id, phase')
      .eq('id', round.concrete_order_id)
      .single()

    if (order) {
      const concretePhase = (order as any).phase ?? 'main'

      // กำหนด status ที่ job_order ควรได้รับหลังคอนกรีตรับครบ
      // two-phase: ให้รักษาสถานะเป็น counterfort_ordered / stem_ordered ไว้ เพื่อให้ QC มาตรวจสอบการเทและกดเริ่มบ่มในหน้าจอของ QC เอง
      // ปกติ: concrete_ordered → ไม่เปลี่ยน (QC จะเปลี่ยนเอง)
      const castPayload: Record<string, any> = { worker_id: user.id }
      if (concretePhase === 'counterfort') {
        castPayload.counterfort_cast_at = nowStr
      } else if (concretePhase === 'stem') {
        castPayload.stem_cast_at = nowStr
      } else {
        castPayload.cast_at = nowStr
      }

      if (order.job_order_id) {
        await supabase
          .from('job_orders')
          .update(castPayload)
          .eq('id', order.job_order_id)
      }
      if (order.bed) {
        const matchStatus = concretePhase === 'counterfort' ? 'counterfort_ordered'
          : concretePhase === 'stem' ? 'stem_ordered'
          : 'concrete_ordered'
        await supabase
          .from('job_orders')
          .update(castPayload)
          .eq('bed', order.bed)
          .eq('status', matchStatus)
      }
    }
  }

  // Log action
  try {
    const { data: roundDetails } = await supabase
      .from('concrete_rounds')
      .select('round_number, qty_per_round, concrete_order_id')
      .eq('id', roundId)
      .single()

    let bedName = '-'
    let productName = 'ไม่ระบุ'

    if (roundDetails?.concrete_order_id) {
      const { data: orderData } = await supabase
        .from('concrete_orders')
        .select('*, job_order:job_orders(bed, plan_item:production_plan_items(product:products(name)))')
        .eq('id', roundDetails.concrete_order_id)
        .single()

      const jobObj = Array.isArray((orderData as any)?.job_order) ? (orderData as any)?.job_order[0] : (orderData as any)?.job_order
      bedName = (orderData as any)?.bed || jobObj?.bed || '-'
      const planItemObj = Array.isArray(jobObj?.plan_item) ? jobObj?.plan_item[0] : jobObj?.plan_item
      const productObj = Array.isArray(planItemObj?.product) ? planItemObj?.product[0] : planItemObj?.product
      productName = productObj?.name || 'ไม่ระบุ'
    }

    const detailText = `ยืนยันรับคอนกรีตรอบที่ ${roundDetails?.round_number || 1} จำนวน ${roundDetails?.qty_per_round || 0} Q ที่โรงผลิต ${bedName} (สินค้า: ${productName})`

    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action_type: 'รับคอนกรีต',
      entity_type: 'concrete_round',
      entity_id: roundId,
      detail: detailText,
    })
  } catch (err) {
    await logError({ action: 'receiveConcreteRound/activityLog', error: err, context: { roundId } })
  }

  revalidatePath('/worker')
  revalidatePath('/concrete')
}

/**
 * ดึงคิวคอนกรีตที่รอดำเนินการ (สำหรับ Concrete Staff)
 * จัดกลุ่มตาม concrete_order พร้อม rounds
 */
export async function getPendingConcreteOrders() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('concrete_orders')
    .select(`
      *,
      requested_by_profile:profiles!concrete_orders_requested_by_fkey(full_name, employee_code),
      job_order:job_orders(
        id, bed, qty_target, order_id,
        production_order:production_orders(order_number, status),
        plan_item:production_plan_items(
          product:products(name, code, concrete_per_unit, concrete_group)
        )
      )
    `)
    .eq('status', 'requested')
    .order('requested_at', { ascending: true })

  if (error) throw new Error(error.message)

  // Fetch concrete_rounds separately to avoid PostgREST schema cache relationship resolution issues
  const orderIds = (data ?? []).map(o => o.id)
  let roundsMap: Record<string, any[]> = {}
  if (orderIds.length > 0) {
    const chunkSize = 50
    for (let i = 0; i < orderIds.length; i += chunkSize) {
      const chunk = orderIds.slice(i, i + chunkSize)
      const { data: roundsData } = await supabase
        .from('concrete_rounds')
        .select(`
          id, concrete_order_id, round_number, qty_per_round, status, supplied_at,
          supplier:profiles(full_name)
        `)
        .in('concrete_order_id', chunk)

      if (roundsData) {
        roundsData.forEach(r => {
          if (!roundsMap[r.concrete_order_id]) roundsMap[r.concrete_order_id] = []
          roundsMap[r.concrete_order_id].push(r)
        })
      }
    }
  }

  // Fetch all jobs currently waiting for concrete to attach production details
  const { data: jobOrders } = await supabase
    .from('job_orders')
    .select(`
      id, bed, qty_target, status, order_id,
      production_order:production_orders(order_number, status),
      plan_item:production_plan_items(
        product:products(id, name, code, size, unit, concrete_group)
      )
    `)
    .in('status', ['concrete_ordered', 'counterfort_ordered', 'stem_ordered'])

  // Group job orders by PO ID and Bed (primary key: production_order_id + bed)
  const jobsByPoAndBed: Record<string, any[]> = {}
  jobOrders?.forEach(job => {
    if (job.order_id && job.bed) {
      const key = `${job.order_id}-${job.bed}`
      if (!jobsByPoAndBed[key]) jobsByPoAndBed[key] = []
      jobsByPoAndBed[key].push(job)
    }
  })

  // Group job orders by bed only (fallback for older orders with null production_order_id)
  const jobsByBedOnly: Record<string, any[]> = {}
  jobOrders?.forEach(job => {
    if (job.bed) {
      if (!jobsByBedOnly[job.bed]) jobsByBedOnly[job.bed] = []
      jobsByBedOnly[job.bed].push(job)
    }
  })

  // Filter out orders where production_order.status is 'erp_synced'
  const activeOrders = (data ?? []).filter(order => {
    return (order.job_order as any)?.production_order?.status !== 'erp_synced'
  })

  // Sort rounds by round_number and attach bed_jobs
  return activeOrders.map(order => {
    const concreteOrder = order as any
    const jo = concreteOrder.job_order
    const bed = concreteOrder.bed || jo?.bed || null
    const productionOrderId = concreteOrder.production_order_id || jo?.order_id || null

    let bedJobs: any[] = []

    if (productionOrderId && bed) {
      const key = `${productionOrderId}-${bed}`
      bedJobs = jobsByPoAndBed[key] || []
    } else if (bed) {
      bedJobs = jobsByBedOnly[String(bed)] || []
    }

    const rounds = roundsMap[order.id] || []

    return {
      ...order,
      bed: bed,
      bed_jobs: bedJobs,
      rounds: rounds.sort((a: { round_number: number }, b: { round_number: number }) => a.round_number - b.round_number),
    }
  })
}

/**
 * ดึงประวัติการจ่ายคอนกรีตตามวันที่
 */
export async function getConcreteHistoryByDate(date?: string, dateTo?: string) {
  const supabase = await createClient()

  let query = supabase
    .from('concrete_orders')
    .select(`
      *,
      requested_by_profile:profiles!concrete_orders_requested_by_fkey(full_name),
      supplied_by_profile:profiles!concrete_orders_supplied_by_fkey(full_name),
      job_order:job_orders(
        bed,
        plan_item:production_plan_items(
          product:products(name, concrete_per_unit, concrete_group)
        )
      )
    `)
    .order('requested_at', { ascending: false })

  if (date) {
    const dateStart = `${date}T00:00:00.000Z`
    const dateEnd = `${dateTo || date}T23:59:59.999Z`
    query = query.gte('requested_at', dateStart).lte('requested_at', dateEnd)
  }

  const { data, error } = await query.limit(200)

  if (error) throw new Error(error.message)

  const orderIds = (data ?? []).map(o => o.id)
  let roundsMap: Record<string, any[]> = {}
  if (orderIds.length > 0) {
    const chunkSize = 50
    for (let i = 0; i < orderIds.length; i += chunkSize) {
      const chunk = orderIds.slice(i, i + chunkSize)
      const { data: roundsData } = await supabase
        .from('concrete_rounds')
        .select(`
          id, concrete_order_id, round_number, qty_per_round, status, supplied_at,
          supplier:profiles(full_name)
        `)
        .in('concrete_order_id', chunk)

      if (roundsData) {
        roundsData.forEach(r => {
          if (!roundsMap[r.concrete_order_id]) roundsMap[r.concrete_order_id] = []
          roundsMap[r.concrete_order_id].push(r)
        })
      }
    }
  }

  return (data ?? []).map(order => {
    const rounds = roundsMap[order.id] || []
    const jo = (order as any).job_order
    return {
      ...order,
      bed: (order as any).bed || jo?.bed || null,
      rounds: rounds.sort((a: { round_number: number }, b: { round_number: number }) => a.round_number - b.round_number),
    }
  })
}

/**
 * ดึงประวัติการจ่ายคอนกรีตวันนี้ (compat)
 */
export async function getTodayConcreteHistory() {
  const today = new Date().toISOString().split('T')[0]
  return getConcreteHistoryByDate(today)
}

/**
 * ลบคำสั่งคอนกรีต (สำหรับ Admin)
 * และคืนค่าสถานะ job_orders ให้กลับไปเป็น pending
 */
export async function deleteConcreteOrder(orderId: string, bed: string | null, jobOrderId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Check admin role
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
    throw new Error('Only admins can delete concrete orders')
  }

  const adminClient = createAdminClient()

  // Delete rounds first (foreign key constraint)
  await adminClient.from('concrete_rounds').delete().eq('concrete_order_id', orderId)
  
  // Delete the order
  const { error: deleteErr } = await adminClient.from('concrete_orders').delete().eq('id', orderId)
  if (deleteErr) throw new Error(deleteErr.message)

  // Revert job_order status
  const resetPayload = {
    status: 'pending',
    cast_at: null,
    qty_cast: null,
    concrete_requested_at: null,
    photo_ready_url: null,
    counterfort_cast_at: null,
    counterfort_cured_at: null,
    stem_cast_at: null,
    stem_cured_at: null,
    photo_counterfort_url: null,
    photo_stem_url: null,
  };

  if (jobOrderId) {
    await adminClient.from('job_orders').update(resetPayload).eq('id', jobOrderId)
  } else if (bed) {
    await adminClient.from('job_orders').update(resetPayload)
    .eq('bed', bed)
    .in('status', ['concrete_ordered', 'casting', 'curing', 'ready_demold', 'counterfort_ordered', 'counterfort_curing', 'stem_ordered', 'stem_curing'])
  }

  revalidatePath('/concrete')
  revalidatePath('/worker')
  revalidatePath('/job-orders')
}

/**
 * รีเซ็ตสถานะ Job Order และลบคำสั่งคอนกรีตที่เกี่ยวข้อง (สำหรับ Admin)
 */
export async function resetJobOrder(jobId: string, bed: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') throw new Error('Only admins can reset job orders')

  const adminClient = createAdminClient()

  // Find concrete order for this bed
  const { data: orders } = await adminClient.from('concrete_orders')
    .select('id')
    .eq('bed', bed)
    .order('requested_at', { ascending: false })
    .limit(1)

  if (orders && orders.length > 0) {
    // If there is an order, delete it (this will also reset the jobs via deleteConcreteOrder logic)
    await deleteConcreteOrder(orders[0].id, bed, null)
  } else {
    await adminClient.from('job_orders').update({
      status: 'pending',
      cast_at: null,
      qty_cast: null,
      concrete_requested_at: null,
      photo_ready_url: null,
      counterfort_cast_at: null,
      counterfort_cured_at: null,
      stem_cast_at: null,
      stem_cured_at: null,
      photo_counterfort_url: null,
      photo_stem_url: null,
    }).in('status', ['concrete_ordered', 'casting', 'curing', 'ready_demold', 'counterfort_ordered', 'counterfort_curing', 'stem_ordered', 'stem_curing']).eq('bed', bed)
  }
  
  revalidatePath('/job-orders')
  revalidatePath('/concrete')
  revalidatePath('/worker')
}

/**
 * ปรับเปลี่ยนปริมาณคอนกรีตของรอบสุดท้าย (รอบ pending) 
 * และทำการคำนวณยอดรวม total_qty_requested ในคำสั่งซื้อใหม่
 */
export async function adjustLastRoundQty(lastRoundId: string, newQty: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  if (newQty <= 0) throw new Error('ปริมาณคอนกรีตต้องมากกว่า 0 คิว')

  // 1. ตรวจสอบข้อมูลรอบคอนกรีตที่จะปรับปรุง
  const { data: round, error: fetchErr } = await supabase
    .from('concrete_rounds')
    .select('id, status, concrete_order_id, round_number')
    .eq('id', lastRoundId)
    .single()

  if (fetchErr || !round) throw new Error('ไม่พบข้อมูลรอบคอนกรีต')
  if (round.status !== 'pending') throw new Error('ไม่สามารถปรับยอดรอบนี้ได้เนื่องจากอยู่ระหว่างจัดส่งหรือส่งแล้ว')

  // 2. อัปเดตปริมาณคอนกรีตในรอบสุดท้าย (concrete_rounds)
  const { error: updateRoundErr } = await supabase
    .from('concrete_rounds')
    .update({ qty_per_round: Number(newQty.toFixed(2)) })
    .eq('id', lastRoundId)

  if (updateRoundErr) throw new Error('ไม่สามารถอัปเดตยอดรอบปูนได้: ' + updateRoundErr.message)

  // 3. ดึงรายการรอบปูนทั้งหมดของ order นี้มาบวกยอดรวมใหม่
  const { data: allRounds, error: roundsErr } = await supabase
    .from('concrete_rounds')
    .select('qty_per_round')
    .eq('concrete_order_id', round.concrete_order_id)

  if (roundsErr || !allRounds) throw new Error('ไม่สามารถคำนวณยอดรวมรอบปูนใหม่ได้')

  const newTotalQty = allRounds.reduce((sum, r) => sum + r.qty_per_round, 0)

  // 4. อัปเดตยอดรวมในตาราง concrete_orders
  const { error: updateOrderErr } = await supabase
    .from('concrete_orders')
    .update({ total_qty_requested: Number(newTotalQty.toFixed(2)) })
    .eq('id', round.concrete_order_id)

  if (updateOrderErr) throw new Error('ไม่สามารถอัปเดตยอดรวมคำสั่งซื้อได้: ' + updateOrderErr.message)

  try {
    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action_type: 'ปรับปริมาณคอนกรีตรอบสุดท้าย',
      entity_type: 'concrete_round',
      entity_id: lastRoundId,
      detail: `ปรับปริมาณคอนกรีตรอบที่ ${round.round_number} เป็น ${newQty.toFixed(2)} Q (ยอดรวมคำสั่งใหม่: ${newTotalQty.toFixed(2)} Q)`,
    })
  } catch (err) {
    await logError({ action: 'adjustLastRoundQty/activityLog', error: err, context: { lastRoundId } })
  }

  revalidatePath('/worker')
  revalidatePath('/concrete')
}
