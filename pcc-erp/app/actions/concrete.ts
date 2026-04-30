'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Worker สั่งคอนกรีต — สร้าง concrete_order และอัปเดต job_order status
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

  // Insert concrete order
  const { error: orderErr } = await supabase
    .from('concrete_orders')
    .insert({
      job_order_id: jobOrderId,
      requested_by: user.id,
      qty_requested: qtyRequested,
      mix_ratio: mixRatio ?? null,
      notes: notes ?? null,
      status: 'requested',
      requested_at: new Date().toISOString(),
    })

  if (orderErr) throw new Error(orderErr.message)

  // อัปเดต job_order status และ timestamp
  const { error: jobErr } = await supabase
    .from('job_orders')
    .update({
      status: 'concrete_ordered',
      concrete_requested_at: new Date().toISOString(),
    })
    .eq('id', jobOrderId)

  if (jobErr) throw new Error(jobErr.message)

  revalidatePath('/worker')
  revalidatePath('/concrete')
}

/**
 * Concrete Staff ยืนยันจ่ายคอนกรีต — อัปเดต concrete_order และ job_order
 */
export async function supplyConcreteOrder(concreteOrderId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // ดึงข้อมูล concrete_order เพื่อได้ job_order_id
  const { data: order, error: fetchErr } = await supabase
    .from('concrete_orders')
    .select('job_order_id, status')
    .eq('id', concreteOrderId)
    .single()

  if (fetchErr || !order) throw new Error('ไม่พบคำสั่งคอนกรีต')
  if (order.status !== 'requested') throw new Error('คำสั่งนี้ดำเนินการแล้ว')

  // อัปเดต concrete_order
  const { error: updateErr } = await supabase
    .from('concrete_orders')
    .update({
      status: 'supplied',
      supplied_by: user.id,
      supplied_at: new Date().toISOString(),
    })
    .eq('id', concreteOrderId)

  if (updateErr) throw new Error(updateErr.message)

  // อัปเดต job_order → casting
  const { error: jobErr } = await supabase
    .from('job_orders')
    .update({
      status: 'casting',
      started_at: new Date().toISOString(),
    })
    .eq('id', order.job_order_id)

  if (jobErr) throw new Error(jobErr.message)

  revalidatePath('/concrete')
  revalidatePath('/worker')
  revalidatePath('/job-orders')
}

/**
 * ดึงคิวคอนกรีตที่รอดำเนินการ (สำหรับ Concrete Staff)
 */
export async function getPendingConcreteOrders() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('concrete_orders')
    .select(`
      *,
      requested_by_profile:profiles!concrete_orders_requested_by_fkey(full_name, employee_code),
      job_order:job_orders(
        id, bed, qty_target,
        plan_item:production_plan_items(
          product:products(name, code)
        )
      )
    `)
    .eq('status', 'requested')
    .order('requested_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

/**
 * ดึงประวัติการจ่ายคอนกรีตวันนี้ (สำหรับ Concrete Staff)
 */
export async function getTodayConcreteHistory() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('concrete_orders')
    .select(`
      *,
      requested_by_profile:profiles!concrete_orders_requested_by_fkey(full_name),
      supplied_by_profile:profiles!concrete_orders_supplied_by_fkey(full_name),
      job_order:job_orders(
        bed,
        plan_item:production_plan_items(
          product:products(name)
        )
      )
    `)
    .gte('requested_at', today)
    .order('requested_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}
