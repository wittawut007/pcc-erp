export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import JobOrdersClient from './JobOrdersClient'
import { createClient } from '@/lib/supabase/server'

export default async function JobOrdersPage() {
  const supabase = await createClient()

  const { data: jobOrders } = await supabase
    .from('job_orders')
    .select(`
      *,
      plan_item:production_plan_items(
        qty_target, bed,
        product:products(id, code, name, category, unit)
      ),
      worker:profiles(full_name, employee_code)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  const { data: workers } = await supabase
    .from('profiles')
    .select('id, full_name, employee_code')
    .eq('is_active', true)
    .in('role', ['worker', 'admin', 'planner'])
    .order('full_name')

  return (
    <>
      <Header title="คิวงานเทคอนกรีต" subtitle="ติดตามสถานะการเทและบ่มคอนกรีตทุกแท่น" />
      <JobOrdersClient jobOrders={jobOrders ?? []} workers={workers ?? []} />
    </>
  )
}
