import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  const { data, error } = await supabase
    .from('qc_inspections')
    .select('qc:profiles!qc_inspections_qc_id_fkey(full_name)')
    .limit(1)
  console.log(error ? error : data)
}
run()
