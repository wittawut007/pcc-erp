import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function listProfiles() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, employee_code, is_active')
    .order('role', { ascending: true })

  console.log('Total profiles in DB:', profiles?.length, error)
  console.table(profiles)
}

listProfiles()
