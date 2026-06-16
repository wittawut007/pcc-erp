'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { calculateConcreteRounds } from '@/lib/concrete-utils'

/**
 * Worker สั่งคอนกรีต — สร้าง concrete_order + concrete_rounds และอัปเดต job_order status
 * (ตอนนี้ถูกเรียกจาก WorkerClient โดยตรงผ่าน supabase client แล้ว ฟังก์ชันนี้ยังคงไว้เพื่อ compatibility)
 */
export async function requestConcrete(
  jobOrderId: string,
  qtyRequested: number,
  mixRatio?: string,
  notes?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const roundData = calculateConcreteRounds(qtyRequested)
  const roundCount = roundData.length
  const now = new Date().toISOString()

  // Insert concrete order
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

  // อัปเดต job_order → concrete_ordered (ไม่ใช่ casting รอ QC)
  const { error: jobErr } = await supabase
    .from('job_orders')
    .update({
      status: 'concrete_ordered',
      concrete_requested_at: now,
      cast_at: null,
      worker_id: user.id,
    })
    .eq('id', jobOrderId)

  if (jobErr) throw new Error(jobErr.message)

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

    // Fetch the order details to find associated jobs (by job_order_id or bed)
    const { data: order } = await supabase
      .from('concrete_orders')
      .select('bed, job_order_id')
      .eq('id', round.concrete_order_id)
      .single()

    if (order) {
      if (order.job_order_id) {
        await supabase
          .from('job_orders')
          .update({ cast_at: nowStr, worker_id: user.id })
          .eq('id', order.job_order_id)
      }
      if (order.bed) {
        await supabase
          .from('job_orders')
          .update({ cast_at: nowStr, worker_id: user.id })
          .eq('bed', order.bed)
          .eq('status', 'concrete_ordered')
      }
    }
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
      bed,
      production_order_id,
      requested_by_profile:profiles!concrete_orders_requested_by_fkey(full_name, employee_code),
      job_order:job_orders(
        id, bed, qty_target, order_id,
        production_order:production_orders(status),
        plan_item:production_plan_items(
          product:products(name, code, concrete_per_unit, concrete_group)
        )
      ),
      rounds:concrete_rounds(
        id, round_number, qty_per_round, status, supplied_at,
        supplier:profiles(full_name)
      )
    `)
    .eq('status', 'requested')
    .order('requested_at', { ascending: true })

  if (error) throw new Error(error.message)

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
    .eq('status', 'concrete_ordered')

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
    let bedJobs: any[] = []

    // Priority 1: use production_order_id stored directly in concrete_orders (new records)
    if (concreteOrder.production_order_id && concreteOrder.bed) {
      const key = `${concreteOrder.production_order_id}-${concreteOrder.bed}`
      bedJobs = jobsByPoAndBed[key] || []
    }
    // Priority 2: use order_id from linked job_order (for records that have job_order_id but not production_order_id)
    else if (jo?.order_id && concreteOrder.bed) {
      const key = `${jo.order_id}-${concreteOrder.bed}`
      bedJobs = jobsByPoAndBed[key] || []
    }
    // Fallback: bed only (for very old records)
    else if (concreteOrder.bed) {
      bedJobs = jobsByBedOnly[String(concreteOrder.bed)] || []
    }

    return {
      ...order,
      bed_jobs: bedJobs,
      rounds: (order.rounds ?? []).sort((a: { round_number: number }, b: { round_number: number }) => a.round_number - b.round_number),
    }
  })
}

/**
 * ดึงประวัติการจ่ายคอนกรีตตามวันที่
 */
export async function getConcreteHistoryByDate(date: string) {
  const supabase = await createClient()
  const dateStart = `${date}T00:00:00.000Z`
  const dateEnd = `${date}T23:59:59.999Z`

  const { data, error } = await supabase
    .from('concrete_orders')
    .select(`
      *,
      bed,
      requested_by_profile:profiles!concrete_orders_requested_by_fkey(full_name),
      supplied_by_profile:profiles!concrete_orders_supplied_by_fkey(full_name),
      job_order:job_orders(
        bed,
        plan_item:production_plan_items(
          product:products(name, concrete_per_unit, concrete_group)
        )
      ),
      rounds:concrete_rounds(
        id, round_number, qty_per_round, status, supplied_at,
        supplier:profiles(full_name)
      )
    `)
    .gte('requested_at', dateStart)
    .lte('requested_at', dateEnd)
    .order('requested_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map(order => ({
    ...order,
    rounds: (order.rounds ?? []).sort((a: { round_number: number }, b: { round_number: number }) => a.round_number - b.round_number),
  }))
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
  if (profile?.role !== 'admin') {
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
  };

  if (jobOrderId) {
    await adminClient.from('job_orders').update(resetPayload).eq('id', jobOrderId)
  } else if (bed) {
    await adminClient.from('job_orders').update(resetPayload)
    .eq('bed', bed)
    .in('status', ['concrete_ordered', 'casting', 'curing', 'ready_demold'])
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
  if (profile?.role !== 'admin') throw new Error('Only admins can reset job orders')

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
    // Just reset the job
    await adminClient.from('job_orders').update({
      status: 'pending',
      cast_at: null,
      qty_cast: null,
      concrete_requested_at: null,
      photo_ready_url: null,
    }).in('status', ['concrete_ordered', 'casting', 'curing', 'ready_demold']).eq('bed', bed)
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

  revalidatePath('/worker')
  revalidatePath('/concrete')
}
