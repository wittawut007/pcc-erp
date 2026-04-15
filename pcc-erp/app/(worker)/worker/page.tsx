export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import WorkerClient from './WorkerClient'

export default async function WorkerPage() {
  const supabase = await createClient()

  // Fetch only active job orders relevant for casting and demolding
  const { data: jobOrders } = await supabase
    .from('job_orders')
    .select(`
      id, bed, status, qty_target, qty_cast, expected_demold_at,
      plan_item:production_plan_items(
        product:products(id, code, name, category, unit)
      )
    `)
    .in('status', ['pending', 'ready_demold', 'curing', 'casting'])

  // Also fetch defect reasons from the same constants or hardcode in client
  
  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column', boxShadow: '0 0 20px rgba(0,0,0,0.05)' }}>
        <WorkerClient jobOrders={(jobOrders as any) ?? []} />
      </div>
    </div>
  )
}
