export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import JobOrdersClient from './JobOrdersClient'
import { createClient } from '@/lib/supabase/server'

const JOB_SELECT = `
  *,
  plan_item:production_plan_items!inner(
    id, qty_target, bed,
    product:products(id, code, name, category, unit),
    plan:production_plans!inner(id, plan_date, created_at, status)
  ),
  production_order:production_orders(order_number, status),
  worker:profiles(full_name, employee_code),
  qc_inspection:qc_inspections(pour_ok, demold_qty_good, inspector:profiles!qc_inspections_qc_id_fkey(full_name)),
  concrete_orders(
    id, requested_at, status, notes,
    requester:profiles!concrete_orders_requested_by_fkey(full_name)
  )
`

// สถานะที่ถือว่า "ยังดำเนินการอยู่" — แสดงใน tab คิวงานรออยู่
const ACTIVE_STATUSES = ['pending', 'concrete_ordered', 'casting', 'curing', 'ready_demold']

// สถานะที่ถือว่า "เสร็จสิ้น" — แสดงใน tab ย้อนหลัง
const HISTORY_STATUSES = ['demolded', 'cancelled']

export default async function JobOrdersPage() {
  const supabase = await createClient()

  let userRole: string | undefined = undefined
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    userRole = profile?.role
  }

  // ─── คิวงานรออยู่ ─────────────────────
  const { data: activeRaw } = await supabase
    .from('job_orders')
    .select(JOB_SELECT)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })

  // ─── ย้อนหลัง ─────────────────────────────────────
  const { data: historyRaw } = await supabase
    .from('job_orders')
    .select(JOB_SELECT)
    .in('status', HISTORY_STATUSES)
    .order('created_at', { ascending: false })
    .limit(300)

  const rawActive = activeRaw ?? []
  const rawHistory = historyRaw ?? []

  // jobs ที่ยังไม่เสร็จ ต้องอยู่ใน queue เสมอ ยืนยันตาม production_order.status !== 'erp_synced'
  const activeJobOrders = rawActive.filter(
    (j: any) => j.production_order?.status !== 'erp_synced'
  )
  const syncedActive = rawActive.filter(
    (j: any) => j.production_order?.status === 'erp_synced'
  )

  const historyJobOrders = [...syncedActive, ...rawHistory].sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )



  return (
    <>
      <Header title="คิวงานเทคอนกรีต" subtitle="ติดตามสถานะการเทและบ่มคอนกรีตทุกโรงผลิต" />
      <JobOrdersClient
        jobOrders={activeJobOrders}
        historyJobOrders={historyJobOrders}
        workers={[]}
        userRole={userRole}
      />
    </>
  )
}

