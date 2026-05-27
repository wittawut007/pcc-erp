'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveErpReference(orderId: string, erpReference: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('production_orders')
    .update({ 
      erp_reference: erpReference,
      status: 'erp_synced' 
    })
    .eq('id', orderId)

  if (error) throw new Error(error.message)

  revalidatePath('/inventory/fg')
  return { success: true }
}

export interface ManualFgItem {
  productId: string
  qty: number
  bed: string
}

export async function createManualFgOrder(
  items: ManualFgItem[],
  notes?: string
) {
  if (!items || items.length === 0) throw new Error('กรุณาระบุรายการสินค้า')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const now = new Date().toISOString()
  const todayStr = now.split('T')[0]
  const datePart = todayStr.replace(/-/g, '')

  // Generate sequence for ADJ-YYYYMMDD-XXX
  const { count } = await supabase
    .from('production_orders')
    .select('*', { count: 'exact', head: true })
    .like('order_number', `ADJ-${datePart}-%`)

  const seq = String((count || 0) + 1).padStart(3, '0')
  const orderNumber = `ADJ-${datePart}-${seq}`

  const totalQty = items.reduce((sum, item) => sum + item.qty, 0)

  // 1. Create a dummy production plan
  const { data: plan, error: planErr } = await supabase
    .from('production_plans')
    .insert({
      plan_date: todayStr,
      created_by: user.id,
      status: 'confirmed',
      total_qty: totalQty,
    })
    .select()
    .single()

  if (planErr) throw new Error('Failed to create production plan: ' + planErr.message)

  // 2. Create a production order with status 'active' and custom order number prefix
  const { data: order, error: orderErr } = await supabase
    .from('production_orders')
    .insert({
      order_number: orderNumber,
      plan_id: plan.id,
      confirmed_by: user.id,
      status: 'active'
    })
    .select()
    .single()

  if (orderErr) throw new Error('Failed to create production order: ' + orderErr.message)

  // Loop through items to create plan items, job orders, demolding records, and update fg_inventory
  for (const item of items) {
    // 3. Create a dummy production plan item
    const { data: planItem, error: itemErr } = await supabase
      .from('production_plan_items')
      .insert({
        plan_id: plan.id,
        product_id: item.productId,
        bed: item.bed,
        qty_target: item.qty,
        status: 'demolded',
      })
      .select()
      .single()

    if (itemErr) throw new Error('Failed to create production plan item: ' + itemErr.message)

    // 4. Create a job order with status 'demolded'
    const { data: job, error: jobErr } = await supabase
      .from('job_orders')
      .insert({
        order_id: order.id,
        plan_item_id: planItem.id,
        worker_id: user.id,
        bed: item.bed,
        qty_target: item.qty,
        qty_cast: item.qty,
        status: 'demolded',
        started_at: now,
        cast_at: now,
        demolded_at: now,
      })
      .select()
      .single()

    if (jobErr) throw new Error('Failed to create job order: ' + jobErr.message)

    // 5. Create a demolding record
    const { error: demoldErr } = await supabase
      .from('demolding_records')
      .insert({
        job_order_id: job.id,
        worker_id: user.id,
        qty_good: item.qty,
        qty_defect: 0,
        defect_detail: notes ?? null,
      })

    if (demoldErr) throw new Error('Failed to create demolding record: ' + demoldErr.message)

    // 6. Update/insert fg_inventory
    const { data: existingFg } = await supabase
      .from('fg_inventory')
      .select('id, qty')
      .eq('product_id', item.productId)
      .maybeSingle()

    if (existingFg) {
      const { error: invErr } = await supabase
        .from('fg_inventory')
        .update({
          qty: existingFg.qty + item.qty,
          last_updated_by: user.id,
          updated_at: now,
        })
        .eq('id', existingFg.id)
      if (invErr) throw new Error(invErr.message)
    } else {
      const { error: invErr } = await supabase
        .from('fg_inventory')
        .insert({
          product_id: item.productId,
          qty: item.qty,
          last_updated_by: user.id,
          updated_at: now,
        })
      if (invErr) throw new Error(invErr.message)
    }
  }

  // 7. Activity Log
  const detailsList = items.map(item => `Product ID: ${item.productId}, Qty: ${item.qty}, Bed: ${item.bed}`).join(' | ')
  await supabase.from('activity_logs').insert({
    user_id: user.id,
    action_type: 'ปรับสต็อก FG',
    entity_type: 'fg_inventory',
    entity_id: order.id,
    detail: `เพิ่มสินค้าใหม่โดยอ้อม (หลายรายการ): ${orderNumber} | รายการ: [${detailsList}] | ${notes ?? ''}`,
  })

  revalidatePath('/inventory/fg')
  revalidatePath('/dashboard')

  // Fetch full details of the newly created order to return to client
  const { data: fullOrder } = await supabase
    .from('production_orders')
    .select(`
      id,
      order_number,
      status,
      erp_reference,
      created_at,
      plan:production_plans(plan_date),
      job_orders(
        id,
        status,
        qty_target,
        qty_cast,
        demolding_records(qty_good, qty_defect),
        plan_item:production_plan_items(
          product:products(id, code, name, category, unit, size)
        )
      )
    `)
    .eq('id', order.id)
    .single()

  return fullOrder
}

