import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function checkDb() {
  console.log('Testing RPC calls...')

  // Test 1: Try exec / exec_sql / execute_sql RPCs if any exist
  const rpcsToTry = ['exec_sql', 'exec', 'execute_sql', 'get_db_stats']
  for (const rpcName of rpcsToTry) {
    try {
      const { data, error } = await supabase.rpc(rpcName as any, { query: "SELECT 1", sql: "SELECT 1" })
      console.log(`RPC ${rpcName}:`, error ? error.message : 'Available!')
    } catch (e: any) {
      console.log(`RPC ${rpcName} exception:`, e.message)
    }
  }

  // Test 2: Select profile for wittawut.abm
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .or('email.eq.wittawut.abm@gmail.com,email.ilike.wittawut.abm%')

  console.log('Current DB profile for wittawut.abm:', profile, error)
}

checkDb()
