import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: pm, error } = await supabase
    .from('plan_materials')
    .select(`
      id,
      status,
      plan_id,
      qty_required,
      plan:production_plans!inner(id, plan_date, status)
    `)
    // .in('plan.status', ['confirmed', 'in_progress'])
  
  console.log("Without filter:", pm?.length, "records")

  const { data: pm2, error: err2 } = await supabase
    .from('plan_materials')
    .select(`
      id,
      status,
      plan_id,
      qty_required,
      plan:production_plans!inner(id, plan_date, status)
    `)
    .in('plan.status', ['confirmed', 'in_progress'])
    
  console.log("With plan.status filter:", pm2?.length, "records")
  if (err2) console.error("Filter error:", err2)

  const { data: pm3, error: err3 } = await supabase
    .from('plan_materials')
    .select(`
      id,
      status,
      plan_id,
      qty_required,
      production_plans!inner(id, plan_date, status)
    `)
    .in('production_plans.status', ['confirmed', 'in_progress'])
    
  console.log("With production_plans.status filter:", pm3?.length, "records")
  if (err3) console.error("Filter error 3:", err3)
  
  const { data: plans } = await supabase.from('production_plans').select('id, status, plan_date')
  console.log("Plans:", plans)
}

run()
