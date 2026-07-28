import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function testDeleteUser() {
  console.log('Testing delete user error...')

  // Get a test dummy profile or inspect foreign keys referencing auth.users or profiles
  const { data: profiles } = await supabase.from('profiles').select('id, email, role, full_name')
  console.log('Current profiles:', profiles)
}

testDeleteUser()
