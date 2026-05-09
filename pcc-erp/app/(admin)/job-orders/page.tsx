export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import JobOrdersClient from './JobOrdersClient'
import { createClient } from '@/lib/supabase/server'

export default async function JobOrdersPage() {
  const supabase = await createClient()

  const today = new Date().toISOString().split('T')[0]

  const { data: jobOrders } = await supabase
    .from('job_orders')
    .select(`
      *,
      plan_item:production_plan_items!inner(
        qty_target, bed,
        product:products(id, code, name, category, unit),
        plan:production_plans!inner(plan_date)
      ),
      worker:profiles(full_name, employee_code)
    `)
    .eq('plan_item.plan.plan_date', today)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <>
      <Header title="คิวงานเทคอนกรีต" subtitle="ติดตามสถานะการเทและบ่มคอนกรีตทุกโรงผลิต" />
      <JobOrdersClient jobOrders={jobOrders ?? []} workers={[]} />
    </>
  )
}
