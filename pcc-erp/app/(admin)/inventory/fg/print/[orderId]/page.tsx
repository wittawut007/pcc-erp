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
      plan:production_plans(plan_date),
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
          product:products(id, code, name, category, unit, size)
        )
      )
    `)
    .eq('id', orderId)
    .single()

  if (error || !order) {
    console.error('Fetch order error:', error)
    notFound()
  }

  // Format date/time
  const planDate = order.plan?.[0]?.plan_date
    ? new Date(order.plan[0].plan_date)
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
      defectDetail: defectDetails || (qtyDefect > 0 ? 'ระบุเสีย (ไม่ระบุสาเหตุ)' : '-')
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
