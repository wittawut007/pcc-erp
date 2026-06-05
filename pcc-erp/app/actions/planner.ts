'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function clearOldPlanData(planId: string) {
  const { createClient: createServiceClient } = await import('@supabase/supabase-js')
  const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  
  // Safe deletion: delete job_orders first to avoid FK violations
  const { data: oldItems } = await supabase.from('production_plan_items').select('id').eq('plan_id', planId)
  if (oldItems && oldItems.length > 0) {
    const itemIds = oldItems.map(i => i.id)
    await supabase.from('job_orders').delete().in('plan_item_id', itemIds)
  }
  
  await supabase.from('production_plan_items').delete().eq('plan_id', planId)
  await supabase.from('plan_materials').delete().eq('plan_id', planId)
}

export async function deleteProductionPlan(planId: string) {
  try {
    const supabase = await createClient()

    // Get auth to ensure caller is actually admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') throw new Error('Forbidden: Only admin can delete plans')

    // Find the production_orders for this plan
    const { data: orders } = await supabase
      .from('production_orders')
      .select('id')
      .eq('plan_id', planId)

    const orderIds = orders?.map(o => o.id) || []

    // 1. Delete Job Orders
    if (orderIds.length > 0) {
      const { error: joError } = await supabase
        .from('job_orders')
        .delete()
        .in('order_id', orderIds)
      
      if (joError) {
        if (joError.code === '23503') { // Foreign key constraint violation
          throw new Error('ไม่สามารถลบแผนได้ เนื่องจากรายการนี้ได้ถูกดำเนินการส่งมอบไปยังขั้นตอนอื่นแล้ว')
        }
        throw joError
      }
    }

    // 2. Delete Production Orders
    if (orderIds.length > 0) {
      const { error: poError } = await supabase
        .from('production_orders')
        .delete()
        .in('id', orderIds)
        
      if (poError) throw poError
    }

    // 3. Delete Production Plan Items
    const { error: ppiError } = await supabase
      .from('production_plan_items')
      .delete()
      .eq('plan_id', planId)
      
    if (ppiError) throw ppiError

    // 4. Delete Production Plan
    const { error: ppError } = await supabase
      .from('production_plans')
      .delete()
      .eq('id', planId)
      
    if (ppError) throw ppError

    revalidatePath('/production-order')
    revalidatePath('/planner')
    return { success: true }
  } catch (err: any) {
    console.error('deleteProductionPlan error:', err)
    return { success: false, error: err.message || 'Failed to delete plan' }
  }
}

export async function getProductionOrderPrintData(planId: string) {
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
    console.error('Fetch plan error:', error)
    throw new Error('ไม่พบข้อมูลแผนการผลิต')
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

  return {
    orderNumber,
    date: dateStr,
    time: timeStr,
    userFullName,
    items,
    planId,
    status: plan.status,
  }
}

