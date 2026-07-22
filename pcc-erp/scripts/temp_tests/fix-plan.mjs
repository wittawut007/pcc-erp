import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function main() {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('production_plans')
    .update({ status: 'draft' })
    .eq('plan_date', today)
  console.log('Update result:', data, error)
  const { data: jobOrderDelete } = await supabase.from('job_orders').delete().gte('created_at', today)
}
main()
