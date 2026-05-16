const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function run() {
  const { data, error } = await supabase
    .from('job_orders')
    .select(`
      *,
      plan_item:production_plan_items(
        product:products(id, code, name, category, unit),
        plan:production_plans(id, plan_date, production_order_code)
      ),
      worker:profiles(full_name)
    `)
    .in('status', ['ready_demold', 'curing'])
    .order('expected_demold_at', { ascending: true })

  console.log('Error:', error)
  console.log('Data count:', data?.length)
  if (data && data.length > 0) {
    console.log('First item plan_item:', JSON.stringify(data[0].plan_item, null, 2))
  }
}

run()
