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
    <div className="min-h-screen bg-slate-50 flex justify-center w-full">
      <div className="w-full max-w-[480px] bg-white min-h-screen flex flex-col shadow-[0_0_40px_rgba(0,0,0,0.05)] relative">
        <WorkerClient jobOrders={(jobOrders as any) ?? []} />
      </div>
    </div>
  )
}
