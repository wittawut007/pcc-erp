export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import JobOrdersClient from './JobOrdersClient'
import { createClient } from '@/lib/supabase/server'

export default async function JobOrdersPage() {
  const supabase = await createClient()

  let userRole: string | undefined = undefined
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    userRole = profile?.role
  }

  // ดึงทุก job_orders (ไม่จำกัดวันที่) จัดกลุ่มตามใบสั่งผลิต
  const { data: jobOrders } = await supabase
    .from('job_orders')
    .select(`
      *,
      plan_item:production_plan_items!inner(
        id, qty_target, bed,
        product:products(id, code, name, category, unit),
        plan:production_plans!inner(id, plan_date, created_at, status)
      ),
      worker:profiles(full_name, employee_code),
      qc_inspection:qc_inspections(pour_ok, demold_qty_good, inspector:profiles!qc_inspections_qc_id_fkey(full_name)),
      concrete_orders(
        id, requested_at, status,
        requester:profiles!concrete_orders_requested_by_fkey(full_name)
      )
    `)
    .order('created_at', { ascending: false })

  return (
    <>
      <Header title="คิวงานเทคอนกรีต" subtitle="ติดตามสถานะการเทและบ่มคอนกรีตทุกโรงผลิต" />
      <JobOrdersClient jobOrders={jobOrders ?? []} workers={[]} userRole={userRole} />
    </>
  )
}
