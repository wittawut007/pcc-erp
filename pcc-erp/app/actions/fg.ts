'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { translateDefectReason } from '@/lib/utils/defects'
import type { FgPrintData, FgPrintItem, PrintBomItem, PrintPlanMaterial, MaterialStatus, OrderStatus } from '@/lib/types'

export async function saveErpReference(orderId: string, erpReference: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  const { data: order } = await supabase
    .from('production_orders')
    .select('order_number')
    .eq('id', orderId)
    .single()

  const { error } = await supabase
    .from('production_orders')
    .update({ 
      erp_reference: erpReference,
      status: 'erp_synced' 
    })
    .eq('id', orderId)

  if (error) throw new Error(error.message)

  if (user) {
    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action_type: 'ยืนยัน ERP (Warehouse)',
      entity_type: 'production_order',
      entity_id: orderId,
      detail: `อัปเดตหมายเลขอ้างอิง ERP (${erpReference}) สำหรับใบสั่งผลิต: ${order?.order_number ?? orderId} และยืนยันเข้าระบบสำเร็จ`,
    })
  }

  revalidatePath('/inventory/fg')
  revalidatePath('/dashboard')
  return { success: true }
}

export interface ManualFgItem {
  productId: string
  qty: number
  bed: string
}

export interface ManualFgMaterialDeduction {
  rawMaterialId: string
  qtyToDeduct: number
}

export async function getManualFgFormData() {
  const supabase = await createClient()

  const [rawMaterialsRes, bomItemsRes] = await Promise.all([
    supabase.from('raw_materials').select('id, name, category, unit, qty_on_hand, weight_per_meter, material_code').order('name'),
    supabase.from('product_bom_items').select('product_id, raw_material_id, qty_per_unit')
  ])

  return {
    rawMaterials: rawMaterialsRes.data || [],
    bomItems: bomItemsRes.data || []
  }
}

export async function createManualFgOrder(
  items: ManualFgItem[],
  notes?: string,
  materialDeductions?: ManualFgMaterialDeduction[]
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

  // 6.5 Deduct materials from raw_materials and record plan_materials if provided
  if (materialDeductions && materialDeductions.length > 0) {
    for (const mat of materialDeductions) {
      if (!mat.rawMaterialId || mat.qtyToDeduct <= 0) continue

      // Save to plan_materials
      const { error: pmErr } = await supabase
        .from('plan_materials')
        .insert({
          plan_id: plan.id,
          raw_material_id: mat.rawMaterialId,
          qty_required: mat.qtyToDeduct,
          qty_dispensed: mat.qtyToDeduct,
          status: 'dispensed',
          dispensed_by: user.id,
          dispensed_at: now,
        })
      if (pmErr) throw new Error('บันทึก plan_materials ล้มเหลว: ' + pmErr.message)

      // Fetch current raw_materials stock
      const { data: rawMat } = await supabase
        .from('raw_materials')
        .select('id, qty_on_hand, name')
        .eq('id', mat.rawMaterialId)
        .single()

      if (rawMat) {
        const newStock = Math.max(0, (rawMat.qty_on_hand || 0) - mat.qtyToDeduct)
        const { error: rmErr } = await supabase
          .from('raw_materials')
          .update({ qty_on_hand: newStock })
          .eq('id', mat.rawMaterialId)

        if (rmErr) throw new Error('หักสต็อกวัตถุดิบล้มเหลว: ' + rmErr.message)

        // Log material deduction action
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action_type: 'หักสต็อกวัตถุดิบ (ปรับเพิ่ม FG นอกแผน)',
          entity_type: 'raw_material',
          entity_id: mat.rawMaterialId,
          detail: `หักสต็อก ${rawMat.name}: ${mat.qtyToDeduct} หน่วย (อ้างอิงใบสั่งสินค้า: ${orderNumber})`,
        })
      }
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
  revalidatePath('/inventory/raw')
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

export async function getFgPrintData(orderId: string) {
  const supabase = await createClient()

  // Fetch the production order with all details
  const { data: order, error } = await supabase
    .from('production_orders')
    .select(`
      id,
      order_number,
      status,
      erp_reference,
      created_at,
      confirmed_by:profiles(full_name, role),
      plan:production_plans(id, plan_date, total_concrete),
      job_orders(
        id,
        bed,
        qty_target,
        qty_cast,
        status,
        demolding_records(
          id,
          qty_good,
          qty_defect,
          defect_reason,
          defect_detail
        ),
        plan_item:production_plan_items(
          product:products(
            id,
            code,
            name,
            category,
            unit,
            size,
            concrete_per_unit,
            wire_per_unit,
            rebar_per_unit,
            mesh_per_unit,
            length,
            product_bom_items(
              id,
              qty_per_unit,
              raw_materials(
                id,
                name,
                category,
                unit,
                material_code,
                weight_per_meter
              )
            )
          )
        )
      )
    `)
    .eq('id', orderId)
    .single()

  if (error || !order) {
    console.error('Fetch order error:', error)
    throw new Error('ไม่พบใบสั่งผลิต')
  }

  // Handle plan object/array mapping and fetch actual materials
  const planObj = Array.isArray(order.plan) ? order.plan[0] : order.plan
  const planId = planObj?.id
  const totalConcrete = planObj?.total_concrete ? parseFloat(String(planObj.total_concrete)) : 0

  let planMaterials: PrintPlanMaterial[] = []
  if (planId) {
    const { data: pmData, error: pmErr } = await supabase
      .from('plan_materials')
      .select(`
        id,
        plan_id,
        raw_material_id,
        qty_required,
        qty_dispensed,
        status,
        notes,
        raw_material:raw_materials(
          id,
          name,
          category,
          unit,
          material_code,
          weight_per_meter
        )
      `)
      .eq('plan_id', planId)
    
    if (!pmErr && pmData) {
      planMaterials = pmData.map((m) => {
        const rm = Array.isArray(m.raw_material) ? m.raw_material[0] : m.raw_material
        return {
          id: m.id,
          qtyRequired: m.qty_required ? parseFloat(String(m.qty_required)) : 0,
          qtyDispensed: m.qty_dispensed ? parseFloat(String(m.qty_dispensed)) : 0,
          status: (m.status ?? 'pending') as import('@/lib/types').MaterialStatus,
          notes: m.notes ?? null,
          rawMaterial: rm ? {
            id: rm.id,
            name: rm.name,
            category: rm.category,
            unit: rm.unit,
            materialCode: rm.material_code ?? null,
            weightPerMeter: rm.weight_per_meter ? parseFloat(String(rm.weight_per_meter)) : null,
          } : null,
        }
      })
    }
  }

  // Format date/time
  const planDate = planObj?.plan_date
    ? new Date(planObj.plan_date)
    : new Date(order.created_at)
  
  const dateStr = planDate.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const printTimeStr = new Date().toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })
  
  const printDateStr = new Date().toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  // Format items
  const items: FgPrintItem[] = (order.job_orders ?? []).map((job) => {
    const planItem = Array.isArray(job.plan_item) ? job.plan_item[0] : job.plan_item
    const p = (Array.isArray(planItem?.product) ? planItem.product[0] : planItem?.product) ?? {}
    const records = Array.isArray(job.demolding_records) ? job.demolding_records : [job.demolding_records].filter(Boolean)
    const qtyGood = records.reduce((s: number, r) => s + ((r as { qty_good?: number })?.qty_good || 0), 0)
    const qtyDefect = records.reduce((s: number, r) => s + ((r as { qty_defect?: number })?.qty_defect || 0), 0)
    
    // Group defect reasons and details
    const defectDetails = records
      .map((r) => {
        const record = r as { qty_defect?: number; defect_reason?: string; defect_detail?: string }
        if (!record?.qty_defect) return null
        const reasonStr = record.defect_reason ? translateDefectReason(record.defect_reason) : ''
        const detailStr = record.defect_detail ? `(${record.defect_detail})` : ''
        return [reasonStr, detailStr].filter(Boolean).join(' ')
      })
      .filter(Boolean)
      .join(', ')

    return {
      id: job.id,
      productCode: p.code ?? '',
      productName: p.name ?? '',
      size: p.size ?? '',
      category: p.category ?? 'อื่นๆ',
      unit: p.unit ?? 'ชิ้น',
      bed: job.bed,
      qtyTarget: job.qty_target || 0,
      qtyGood,
      qtyDefect,
      defectDetail: defectDetails || (qtyDefect > 0 ? 'ระบุเสีย (ไม่ระบุสาเหตุ)' : '-'),
      concretePerUnit: p.concrete_per_unit ? parseFloat(p.concrete_per_unit) : 0,
      wirePerUnit: p.wire_per_unit ? parseFloat(p.wire_per_unit) : 0,
      rebarPerUnit: p.rebar_per_unit ? parseFloat(p.rebar_per_unit) : 0,
      meshPerUnit: p.mesh_per_unit ? parseFloat(p.mesh_per_unit) : 0,
      length: p.length ? parseFloat(p.length) : 0,
      bomItems: ((p as { product_bom_items?: Array<{ id: string; qty_per_unit?: number; raw_materials?: { name?: string; category?: string; unit?: string; material_code?: string | null; weight_per_meter?: number | null } }> }).product_bom_items ?? []).map((bom): PrintBomItem => {
        const rm = bom.raw_materials || {}
        return {
          id: bom.id,
          qtyPerUnit: bom.qty_per_unit ? parseFloat(String(bom.qty_per_unit)) : 0,
          materialName: rm.name ?? '',
          materialCategory: rm.category ?? '',
          materialUnit: rm.unit ?? '',
          materialCode: rm.material_code ?? null,
          weightPerMeter: rm.weight_per_meter ? parseFloat(String(rm.weight_per_meter)) : null,
        }
      })
    }
  })

  const confirmedByRaw = order.confirmed_by
  type ConfirmedByProfile = { full_name?: string | null }
  const confirmedBy = (
    Array.isArray(confirmedByRaw)
      ? (confirmedByRaw[0] as ConfirmedByProfile)?.full_name
      : (confirmedByRaw as ConfirmedByProfile | null)?.full_name
  ) || 'ผู้ดูแลระบบ (Admin)'

  return {
    orderNumber: order.order_number,
    planDateStr: dateStr,
    printDateStr,
    printTimeStr,
    confirmedBy,
    items,
    erpReference: order.erp_reference,
    status: order.status,
    totalConcrete,
    planMaterials,
  }
}

