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
      items:production_plan_items(id)
    `)
    .order('plan_date', { ascending: false })
    .limit(60)

  return (
    <>
      <Header title="ใบสั่งผลิต (Production Orders)" subtitle="รายการสั่งผลิตทั้งหมด — คลิกเพื่อดูรายละเอียดและพิมพ์ใบสั่งผลิต" />
      <ProductionOrdersClient plans={plans ?? []} />
    </>
  )
}
