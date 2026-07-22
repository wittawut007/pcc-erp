const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')

dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

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

const ACTIVE_STATUSES = ['pending', 'concrete_ordered', 'casting', 'curing', 'ready_demold']
const HISTORY_STATUSES = ['demolded', 'cancelled']

async function run() {
  const { data: activeRaw, error: activeErr } = await supabase
    .from('job_orders')
    .select(JOB_SELECT)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })

  const { data: historyRaw, error: historyErr } = await supabase
    .from('job_orders')
    .select(JOB_SELECT)
    .in('status', HISTORY_STATUSES)
    .order('created_at', { ascending: false })
    .limit(300)

  if (activeErr) console.error('Active query error:', activeErr)
  if (historyErr) console.error('History query error:', historyErr)

  console.log('--- ACTIVE JOBS FOR PO-20260522-001 or 002 ---')
  const activeJobs = activeRaw || []
  const po1Active = activeJobs.filter(j => j.production_order?.order_number?.includes('PO-20260522-001'))
  const po2Active = activeJobs.filter(j => j.production_order?.order_number?.includes('PO-20260522-002'))
  
  console.log('PO-001 active count:', po1Active.length)
  po1Active.forEach(j => {
    console.log(`- Job ID: ${j.id}, Bed: ${j.bed}, Status: ${j.status}, Target: ${j.qty_target}`)
  })
  
  console.log('PO-002 active count:', po2Active.length)
  po2Active.forEach(j => {
    console.log(`- Job ID: ${j.id}, Bed: ${j.bed}, Status: ${j.status}, Target: ${j.qty_target}`)
  })

  console.log('\n--- HISTORY JOBS FOR PO-20260522-001 or 002 ---')
  const historyJobs = historyRaw || []
  const po1History = historyJobs.filter(j => j.production_order?.order_number?.includes('PO-20260522-001'))
  const po2History = historyJobs.filter(j => j.production_order?.order_number?.includes('PO-20260522-002'))

  console.log('PO-001 history count:', po1History.length)
  po1History.forEach(j => {
    console.log(`- Job ID: ${j.id}, Bed: ${j.bed}, Status: ${j.status}, Target: ${j.qty_target}`)
  })

  console.log('PO-002 history count:', po2History.length)
  po2History.forEach(j => {
    console.log(`- Job ID: ${j.id}, Bed: ${j.bed}, Status: ${j.status}, Target: ${j.qty_target}`)
  })
}

run()
