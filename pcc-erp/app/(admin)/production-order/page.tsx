export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import { createClient } from '@/lib/supabase/server'
import ProductionOrdersClient from './ProductionOrdersClient'

export default async function ProductionOrdersPage() {
  const supabase = await createClient()

  const { data: plans } = await supabase
    .from('production_plans')
    .select(`
      id,
      plan_date,
      status,
      total_qty,
      total_concrete,
      created_at,
      profile:profiles!production_plans_created_by_fkey(full_name, role),
      items:production_plan_items(id),
      plan_materials(qty_dispensed),
      production_orders(status)
    `)
    .order('plan_date', { ascending: false })
    .limit(60)

  const { data: { user } } = await supabase.auth.getUser()
  let userRole = 'worker'
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    userRole = profile?.role || 'worker'
  }

  const computedPlans = plans?.map(p => {
    let computedStatus = p.status;
    const hasDispensed = p.plan_materials?.some((m: any) => (m.qty_dispensed || 0) > 0);
    const hasOrders = p.production_orders && p.production_orders.length > 0;
    const allOrdersFinished = hasOrders && p.production_orders.every((o: any) => o.status === 'erp_synced');

    if (allOrdersFinished) {
      computedStatus = 'completed';
    } else if (hasDispensed) {
      computedStatus = 'in_progress';
    }

    return { ...p, status: computedStatus };
  }) || [];

  return (
    <>
      <Header title="ใบสั่งผลิต (Production Orders)" subtitle="รายการสั่งผลิตทั้งหมด — คลิกเพื่อดูรายละเอียดและพิมพ์ใบสั่งผลิต" />
      <ProductionOrdersClient plans={computedPlans as any} userRole={userRole} />
    </>
  )
}
