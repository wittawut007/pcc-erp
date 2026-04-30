export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import DemoldingClient from './DemoldingClient'
import { createClient } from '@/lib/supabase/server'

export default async function DemoldingPage() {
  const supabase = await createClient()

  const { data: readyJobs } = await supabase
    .from('job_orders')
    .select(`
      *,
      plan_item:production_plan_items(
        product:products(id, code, name, category, unit)
      ),
      worker:profiles(full_name)
    `)
    .in('status', ['ready_demold', 'curing'])
    .order('expected_demold_at', { ascending: true })

  const { data: recentDemolding } = await supabase
    .from('demolding_records')
    .select(`
      *,
      job_order:job_orders(
        bed,
        plan_item:production_plan_items(product:products(name, unit))
      ),
      worker:profiles(full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: workers } = await supabase
    .from('profiles')
    .select('id, full_name, employee_code')
    .eq('is_active', true)
    .order('full_name')

  return (
    <>
      <Header title="งานตัดยก & ตรวจสอบ" subtitle="บันทึกจำนวนชิ้นดีและของเสียหลังตัดยก & ตรวจสอบ" />
      <DemoldingClient readyJobs={readyJobs ?? []} recentDemolding={recentDemolding ?? []} workers={workers ?? []} />
    </>
  )
}
