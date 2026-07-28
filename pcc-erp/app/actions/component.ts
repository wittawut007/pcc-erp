'use server'

/**
 * ============================================================
 * app/actions/component.ts
 * Server Actions สำหรับ Counterfort SFG Component Flow
 *
 * Flow:
 *  1. getCounterfortStock()       - ดึง stock SFG ทั้งหมด
 *  2. checkCounterfortStock()     - ตรวจ stock สำหรับ L-Wall plan
 *  3. receiveCounterfortToStock() - QC ผ่าน → เพิ่ม stock
 *  4. deductCounterfortStock()    - เริ่มผลิต L-Wall → ตัดเบิก stock
 * ============================================================
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logError } from '@/lib/logger'

// ─── Types ────────────────────────────────────────────────────

export interface CounterfortStockItem {
  id: string
  material_code: string | null
  name: string
  qty_on_hand: number
  min_stock: number
  unit: string
}

export interface StockCheckResult {
  productId: string
  productName: string
  cfMaterialId: string
  cfMaterialName: string
  cfMaterialCode: string | null
  qtyRequired: number   // CF ที่ต้องใช้ (counterfort_qty_per_unit × qty L-Wall)
  qtyAvailable: number  // CF ที่มีในคลัง
  sufficient: boolean   // true = เพียงพอ
}

// ─── 1. ดึง Stock Counterfort SFG ทั้งหมด ─────────────────────

export async function getCounterfortStock(): Promise<CounterfortStockItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('raw_materials')
    .select('id, material_code, name, qty_on_hand, min_stock, unit')
    .eq('category', 'ชิ้นส่วน SFG')
    .eq('is_active', true)
    .order('name')

  if (error) {
    await logError({ action: 'getCounterfortStock', error, context: {} })
    throw new Error(error.message)
  }

  return data ?? []
}

// ─── 2. ตรวจ Stock สำหรับสร้างแผนผลิต L-Wall ──────────────────
/**
 * รับ planItems: [{ productId, qty }] แล้ว return ผลการตรวจ stock
 * สำหรับสินค้า A42 ที่มี counterfort_material_id ผูกอยู่
 */
export async function checkCounterfortStock(
  planItems: { productId: string; qty: number }[]
): Promise<StockCheckResult[]> {
  const supabase = await createClient()

  // ดึงข้อมูล products ที่เกี่ยวข้อง
  const productIds = planItems.map(i => i.productId)
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('id, name, counterfort_material_id, counterfort_qty_per_unit')
    .in('id', productIds)
    .not('counterfort_material_id', 'is', null)

  if (prodError) throw new Error(prodError.message)
  if (!products || products.length === 0) return []

  // ดึง CF materials ที่เกี่ยวข้อง
  const cfMaterialIds = products.map(p => p.counterfort_material_id).filter(Boolean) as string[]
  const { data: cfMaterials, error: matError } = await supabase
    .from('raw_materials')
    .select('id, name, material_code, qty_on_hand')
    .in('id', cfMaterialIds)

  if (matError) throw new Error(matError.message)
  const cfMap = new Map((cfMaterials ?? []).map(m => [m.id, m]))

  const results: StockCheckResult[] = []
  for (const planItem of planItems) {
    const product = products.find(p => p.id === planItem.productId)
    if (!product || !product.counterfort_material_id) continue

    const cf = cfMap.get(product.counterfort_material_id)
    if (!cf) continue

    const qtyRequired = (product.counterfort_qty_per_unit ?? 0) * planItem.qty
    results.push({
      productId: product.id,
      productName: product.name,
      cfMaterialId: cf.id,
      cfMaterialName: cf.name,
      cfMaterialCode: cf.material_code,
      qtyRequired,
      qtyAvailable: cf.qty_on_hand,
      sufficient: cf.qty_on_hand >= qtyRequired,
    })
  }

  return results
}

// ─── 3. รับ Counterfort เข้าคลัง (เมื่อ QC ผ่าน) ─────────────
/**
 * เรียกหลังจาก QC อนุมัติงาน Counterfort Component
 * เพิ่ม qty_on_hand ของ Counterfort SFG ใน raw_materials
 */
export async function receiveCounterfortToStock(
  materialId: string,
  qtyGood: number,
  jobOrderId: string
): Promise<{ success: boolean; newQty: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // ตรวจสอบ material
  const { data: material, error: matError } = await supabase
    .from('raw_materials')
    .select('id, name, qty_on_hand, category')
    .eq('id', materialId)
    .single()

  if (matError || !material) throw new Error('ไม่พบข้อมูล Counterfort SFG ในระบบ')
  if (material.category !== 'ชิ้นส่วน SFG') throw new Error('วัตถุดิบที่ระบุไม่ใช่ประเภท Counterfort SFG')

  const newQty = material.qty_on_hand + qtyGood

  // อัปเดต stock
  const { error: updateError } = await supabase
    .from('raw_materials')
    .update({ qty_on_hand: newQty, updated_at: new Date().toISOString() })
    .eq('id', materialId)

  if (updateError) throw new Error(updateError.message)

  // Activity log
  try {
    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action_type: 'รับ Counterfort เข้าคลัง',
      entity_type: 'raw_material',
      entity_id: materialId,
      detail: `${material.name} | รับเข้า ${qtyGood} ชิ้น | คงเหลือ ${newQty} ชิ้น | Job: ${jobOrderId}`,
    })
  } catch (err) {
    await logError({ action: 'receiveCounterfortToStock/activityLog', error: err, context: { materialId, jobOrderId } })
  }

  revalidatePath('/inventory/component')
  revalidatePath('/inventory/raw')
  revalidatePath('/planner')

  return { success: true, newQty }
}

// ─── 4. ตัดเบิก Counterfort เมื่อเริ่มผลิต L-Wall ─────────────
/**
 * เรียกเมื่อ Worker เริ่มผลิต L-Wall (Stem phase)
 * ตัดเบิก CF ออกจาก raw_materials
 */
export async function deductCounterfortStock(
  materialId: string,
  qtyToDeduct: number,
  jobOrderId: string
): Promise<{ success: boolean; newQty: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // ตรวจสอบ material + stock
  const { data: material, error: matError } = await supabase
    .from('raw_materials')
    .select('id, name, qty_on_hand, category')
    .eq('id', materialId)
    .single()

  if (matError || !material) throw new Error('ไม่พบข้อมูล Counterfort SFG')
  if (material.category !== 'ชิ้นส่วน SFG') throw new Error('วัตถุดิบที่ระบุไม่ใช่ประเภท Counterfort SFG')
  const isInsufficient = material.qty_on_hand < qtyToDeduct
  const newQty = Math.max(0, material.qty_on_hand - qtyToDeduct)

  const { error: updateError } = await supabase
    .from('raw_materials')
    .update({ qty_on_hand: newQty, updated_at: new Date().toISOString() })
    .eq('id', materialId)

  if (updateError) throw new Error(updateError.message)

  // Activity log
  try {
    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action_type: 'เบิก Counterfort เข้าสาย',
      entity_type: 'raw_material',
      entity_id: materialId,
      detail: `${material.name} | เบิกออก ${qtyToDeduct} ชิ้น | คงเหลือ ${newQty} ชิ้น${isInsufficient ? ` (เตือน: Stock เดิม ${material.qty_on_hand} ไม่พอสำหรับการเบิก)` : ''} | Job: ${jobOrderId}`,
    })
  } catch (err) {
    await logError({ action: 'deductCounterfortStock/activityLog', error: err, context: { materialId, jobOrderId } })
  }

  revalidatePath('/inventory/component')
  revalidatePath('/inventory/raw')

  return { success: true, newQty }
}

// ─── 5. QC อนุมัติงาน Counterfort Component ───────────────────
/**
 * บันทึกผล QC ของ Job ประเภท component (Counterfort)
 * - ถ้าผ่าน: เรียก receiveCounterfortToStock + อัปเดต job_order status = demolded
 * - ถ้าไม่ผ่าน: อัปเดต status = cancelled + บันทึก defect
 */
export async function approveCounterfortComponent(
  jobOrderId: string,
  qtyGood: number,
  qtyDefect: number,
  defectReason?: string,
  defectDetail?: string
): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // ดึงข้อมูล job เพื่อหา counterfort_material_id
  const { data: job, error: jobError } = await supabase
    .from('job_orders')
    .select(`
      id, qty_target, job_type,
      plan_item:production_plan_items(
        qty_target,
        product:products(id, name, counterfort_material_id, counterfort_qty_per_unit)
      )
    `)
    .eq('id', jobOrderId)
    .single()

  if (jobError || !job) throw new Error('ไม่พบ Job Order')
  if (job.job_type !== 'component') throw new Error('Job นี้ไม่ใช่ประเภท Counterfort Component')

  const planItem = Array.isArray(job.plan_item) ? job.plan_item[0] : job.plan_item
  const product = Array.isArray(planItem?.product) ? planItem.product[0] : planItem?.product
  const cfMaterialId = product?.counterfort_material_id

  const now = new Date().toISOString()

  // บันทึก demolding_record
  await supabase.from('demolding_records').insert({
    job_order_id: jobOrderId,
    worker_id: user.id,
    qty_good: qtyGood,
    qty_defect: qtyDefect,
    defect_reason: defectReason ?? null,
    defect_detail: defectDetail ?? null,
  })

  // อัปเดต job_order status → demolded
  await supabase
    .from('job_orders')
    .update({ status: 'demolded', demolded_at: now })
    .eq('id', jobOrderId)

  // รับ CF ที่ผ่าน QC เข้าคลัง
  if (qtyGood > 0 && cfMaterialId) {
    await receiveCounterfortToStock(cfMaterialId, qtyGood, jobOrderId)
  }

  // Activity log
  try {
    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action_type: 'QC Counterfort Component',
      entity_type: 'job_order',
      entity_id: jobOrderId,
      detail: `${product?.name ?? 'Counterfort'} | ดี ${qtyGood} / เสีย ${qtyDefect} ชิ้น`,
    })
  } catch (err) {
    await logError({ action: 'approveCounterfortComponent/activityLog', error: err, context: { jobOrderId } })
  }

  revalidatePath('/job-orders')
  revalidatePath('/demolding')
  revalidatePath('/inventory/component')

  return { success: true }
}
