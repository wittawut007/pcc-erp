export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FgPrintClient from './FgPrintClient'

interface PageProps {
  params: Promise<{ orderId: string }>
}

export default async function FgPrintPage({ params }: PageProps) {
  const { orderId } = await params
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
    notFound()
  }

  // Handle plan object/array mapping and fetch actual materials
  const planObj = Array.isArray(order.plan) ? order.plan[0] : order.plan
  const planId = planObj?.id
  const totalConcrete = planObj?.total_concrete ? parseFloat(planObj.total_concrete as any) : 0

  let planMaterials: any[] = []
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
      planMaterials = pmData.map((m: any) => ({
        id: m.id,
        qtyRequired: m.qty_required ? parseFloat(m.qty_required) : 0,
        qtyDispensed: m.qty_dispensed ? parseFloat(m.qty_dispensed) : 0,
        status: m.status,
        notes: m.notes,
        rawMaterial: m.raw_material ? {
          id: m.raw_material.id,
          name: m.raw_material.name,
          category: m.raw_material.category,
          unit: m.raw_material.unit,
          materialCode: m.raw_material.material_code,
          weightPerMeter: m.raw_material.weight_per_meter ? parseFloat(m.raw_material.weight_per_meter) : null,
        } : null,
      }))
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
  const items = (order.job_orders ?? []).map((job: any) => {
    const p = job.plan_item?.product || {}
    const records = Array.isArray(job.demolding_records) ? job.demolding_records : [job.demolding_records].filter(Boolean)
    const qtyGood = records.reduce((s: number, r: any) => s + (r?.qty_good || 0), 0)
    const qtyDefect = records.reduce((s: number, r: any) => s + (r?.qty_defect || 0), 0)
    
    // Group defect reasons and details
    const defectDetails = records
      .map((r: any) => {
        if (!r?.qty_defect) return null
        const reasonStr = r.defect_reason ? translateDefectReason(r.defect_reason) : ''
        const detailStr = r.defect_detail ? `(${r.defect_detail})` : ''
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
      bomItems: (p.product_bom_items ?? []).map((bom: any) => {
        const rm = bom.raw_materials || {}
        return {
          id: bom.id,
          qtyPerUnit: bom.qty_per_unit ? parseFloat(bom.qty_per_unit) : 0,
          materialName: rm.name ?? '',
          materialCategory: rm.category ?? '',
          materialUnit: rm.unit ?? '',
          materialCode: rm.material_code ?? null,
          weightPerMeter: rm.weight_per_meter ? parseFloat(rm.weight_per_meter) : null,
        }
      })
    }
  })

  const confirmedByRaw = order.confirmed_by
  const confirmedBy = (
    Array.isArray(confirmedByRaw)
      ? confirmedByRaw[0]?.full_name
      : (confirmedByRaw as any)?.full_name
  ) || 'ผู้ดูแลระบบ (Admin)'

  return (
    <FgPrintClient
      orderNumber={order.order_number}
      planDateStr={dateStr}
      printDateStr={printDateStr}
      printTimeStr={printTimeStr}
      confirmedBy={confirmedBy}
      items={items}
      erpReference={order.erp_reference}
      status={order.status}
      totalConcrete={totalConcrete}
      planMaterials={planMaterials}
    />
  )
}

function translateDefectReason(reason: string): string {
  const mapping: Record<string, string> = {
    crack: 'แตก / ร้าว',
    chip: 'บิ่น / มุมหัก',
    honeycomb: 'Honeycomb',
    other: 'อื่นๆ',
  }
  return mapping[reason] || reason
}
