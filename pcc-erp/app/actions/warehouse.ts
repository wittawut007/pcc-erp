'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * ดึงรายการที่รอรับเข้าคลัง FG (QC ผ่านแล้ว)
 */
export async function getPendingFGItems() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('job_orders')
    .select(`
      *,
      production_order:production_orders(status),
      plan_item:production_plan_items(
        bed,
        product:products(id, name, code, category, unit)
      ),
      qc_inspection:qc_inspections(
        demold_qty_good,
        demold_qty_defect,
        defect_reason,
        demold_inspected_at,
        qc:profiles!qc_inspections_qc_id_fkey(full_name)
      )
    `)
    .eq('status', 'qc_passed')
    .order('demolded_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).filter((item: any) => item.production_order?.status !== 'erp_synced')
}

/**
 * Warehouse Staff ยืนยันรับสินค้าเข้าคลัง FG
 * - บันทึก fg_receipts
 * - อัปเดต fg_inventory.qty
 * - เปลี่ยน job_order status → completed
 */
export async function confirmFGReceipt(
  jobOrderId: string,
  productId: string,
  qtyGood: number,
  qtyDefect: number,
  notes?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const now = new Date().toISOString()

  // Insert fg_receipts
  const { error: receiptErr } = await supabase
    .from('fg_receipts')
    .insert({
      job_order_id: jobOrderId,
      product_id: productId,
      warehouse_id: user.id,
      qty_good: qtyGood,
      qty_defect: qtyDefect,
      notes: notes ?? null,
      confirmed_at: now,
    })

  if (receiptErr) throw new Error(receiptErr.message)

  // อัปเดต fg_inventory (upsert)
  const { data: existing } = await supabase
    .from('fg_inventory')
    .select('id, qty')
    .eq('product_id', productId)
    .maybeSingle()

  if (existing) {
    const { error: invErr } = await supabase
      .from('fg_inventory')
      .update({
        qty: existing.qty + qtyGood,
        last_updated_by: user.id,
        updated_at: now,
      })
      .eq('id', existing.id)
    if (invErr) throw new Error(invErr.message)
  } else {
    const { error: invErr } = await supabase
      .from('fg_inventory')
      .insert({
        product_id: productId,
        qty: qtyGood,
        last_updated_by: user.id,
        updated_at: now,
      })
    if (invErr) throw new Error(invErr.message)
  }

  // อัปเดต job_order → completed
  const { error: jobErr } = await supabase
    .from('job_orders')
    .update({ status: 'completed' })
    .eq('id', jobOrderId)

  if (jobErr) throw new Error(jobErr.message)

  // Log action
  try {
    const { data: product } = await supabase.from('products').select('name, code').eq('id', productId).single()
    const { data: job } = await supabase.from('job_orders').select('production_order(order_number)').eq('id', jobOrderId).single()
    const poCode = (job?.production_order as any)?.order_number ?? '-'
    const detailText = `รับสินค้าเข้าคลัง FG: ${product?.name ?? 'ไม่ระบุ'} (${product?.code ?? '-'}) | จำนวนดี: ${qtyGood} ชิ้น / เสีย: ${qtyDefect} ชิ้น (ใบสั่งผลิต: ${poCode})${notes ? ' | หมายเหตุ: ' + notes : ''}`

    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action_type: 'รับสินค้า FG (FG In)',
      entity_type: 'fg_receipt',
      entity_id: jobOrderId,
      detail: detailText,
    })
  } catch (err) {
    console.error('Failed to log confirmFGReceipt activity:', err)
  }

  revalidatePath('/inventory/fg')
  revalidatePath('/dashboard')
}

/**
 * ดึงประวัติการรับสินค้าเข้าคลังวันนี้
 */
export async function getTodayFGReceipts() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('fg_receipts')
    .select(`
      *,
      product:products(name, code, category, unit),
      warehouse:profiles!fg_receipts_warehouse_id_fkey(full_name)
    `)
    .gte('confirmed_at', today)
    .order('confirmed_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}
