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
      ),
      production_orders(order_number)
    `)
    .eq('id', planId)
    .single()

  if (error || !plan) {
    notFound()
  }

  // Fetch BOM items for the products in this plan to support fallback BOM codes
  const productIds = (plan.items ?? []).map((item: any) => item.product_id).filter(Boolean)
  let productBoms: any[] = []
  if (productIds.length > 0) {
    const { data: boms } = await supabase
      .from('product_bom_items')
      .select(`
        product_id,
        sort_order,
        raw_materials (
          material_code,
          name
        )
      `)
      .in('product_id', productIds)
      .order('sort_order', { ascending: true })
    productBoms = boms ?? []
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

  // Get real order number from production_orders relation, fallback if not found
  const po = plan.production_orders && (plan.production_orders as any)[0]
  const orderNumber = po?.order_number || `PO-${plan.plan_date.replace(/-/g, '')}-001`

  // Map plan items to the shape used by print client
  const items = (plan.items ?? []).map((item: any) => {
    const p = item.product || {}
    const wireVal = p.wire_per_unit || p.length || 0;
    
    // Resolve BOM code with fallback from product_bom_items
    let bomCode = p.bom_code
    if (!bomCode && productBoms.length > 0) {
      const bomsForProduct = productBoms.filter((b: any) => b.product_id === item.product_id)
      if (bomsForProduct.length > 0) {
        const names = bomsForProduct
          .map((b: any) => b.raw_materials?.name || b.raw_materials?.material_code)
          .filter(Boolean)
        const uniqueNames = Array.from(new Set(names))
        if (uniqueNames.length > 0) {
          bomCode = uniqueNames.join(', ')
        }
      }
    }

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
      bomCode: bomCode || null,
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
