import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  console.log('Testing insert...')
  const { data, error } = await supabase
    .from('concrete_orders')
    .insert({
      job_order_id: '3421ad92-abd6-4193-96bd-488ba320de8e', // One of the jobs
      requested_by: '2578f524-9787-41cb-a3e8-c2e66fe39ae5', // User ID from logs
      qty_requested: 5,
      total_qty_requested: 5,
      round_count: 5,
      status: 'requested',
      requested_at: new Date().toISOString()
    })
    .select('id')
    .single()
    
  if (error) {
    console.error('Insert error:', error)
  } else {
    console.log('Insert success:', data)
    // Cleanup
    await supabase.from('concrete_orders').delete().eq('id', data.id)
  }
}
test()
