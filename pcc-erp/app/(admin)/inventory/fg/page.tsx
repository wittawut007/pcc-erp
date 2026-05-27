export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import FgInventoryClient from './FgInventoryClient'
import { createClient } from '@/lib/supabase/server'

export default async function FgInventoryPage() {
  const supabase = await createClient()

  // Fetch production orders that have demolded jobs or are completed
  const { data: productionOrders } = await supabase
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
    .order('created_at', { ascending: false })

  // Fetch active products list for manual adjustments
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('category')
    .order('code')

  return (
    <>
      <Header title="ยืนยันการผลิต (FG / ERP)" subtitle="ตรวจสอบใบสั่งผลิตและอัปเดตหมายเลขอ้างอิงระบบกลาง" />
      <FgInventoryClient productionOrders={productionOrders ?? []} products={products ?? []} />
    </>
  )
}
