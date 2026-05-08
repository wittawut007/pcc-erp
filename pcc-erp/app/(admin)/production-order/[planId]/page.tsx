export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProductionOrderPrintClient from './ProductionOrderPrintClient'

interface PageProps {
  params: Promise<{ planId: string }>
}

export default async function ProductionOrderPrintPage({ params }: PageProps) {
  const { planId } = await params
  const supabase = await createClient()

  // Fetch the plan with all items and product details
  const { data: plan, error } = await supabase
    .from('production_plans')
    .select(`
      *,
      profile:profiles!production_plans_created_by_fkey(full_name, role),
      items:production_plan_items(
        *,
        product:products(id, code, name, size, category, unit, concrete_per_unit, bom_code, wire_per_unit, mesh_per_unit, rebar_per_unit, length)
      )
    `)
    .eq('id', planId)
    .single()

  if (error || !plan) {
    notFound()
  }

  // Fetch a generic worker token for QR code
  const { data: workerProfile } = await supabase
    .from('profiles')
    .select('worker_token')
    .eq('role', 'worker')
    .eq('is_active', true)
    .limit(1)
    .single()

  const workerToken = workerProfile?.worker_token || ''

  // Format date/time from plan_date
  const planDate = new Date(plan.plan_date)
  const createdAt = plan.created_at ? new Date(plan.created_at) : planDate

  const dateStr = createdAt.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const timeStr = createdAt.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })

  // Build order number from plan_date
  const datePart = plan.plan_date.replace(/-/g, '')
  const orderNumber = `PO-${datePart}-001`

  // Map plan items to the shape used by print client
  const items = (plan.items ?? []).map((item: any) => {
    const p = item.product || {}
    const wireVal = p.wire_per_unit || p.length || 0;
    return {
      id: item.id,
      productId: item.product_id,
      productCode: p.code ?? '',
      productName: p.name ?? '',
      size: p.size ?? '',
      category: p.category ?? '',
      unit: p.unit ?? 'ชิ้น',
      bed: item.bed,
      qty: item.qty_target,
      concrete: (p.concrete_per_unit ?? 0) * item.qty_target,
      bomCode: p.bom_code,
      wire: wireVal * item.qty_target,
      mesh: (p.mesh_per_unit ?? 0) * item.qty_target,
      rebar: (p.rebar_per_unit ?? 0) * item.qty_target,
    }
  })

  const userFullName = plan.profile?.full_name || 'ผู้ดูแลระบบ (Admin)'

  return (
    <ProductionOrderPrintClient
      orderNumber={orderNumber}
      date={dateStr}
      time={timeStr}
      userFullName={userFullName}
      items={items}
      workerToken={workerToken}
      planId={planId}
      status={plan.status}
    />
  )
}
