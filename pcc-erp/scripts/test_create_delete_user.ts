import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

async function testUserDeletionFlow() {
  console.log('--- Testing Create and Delete User Flow ---')

  const testEmail = `test.delete.${Date.now()}@pcc-erp.local`
  
  // 1. Create test user
  console.log('1. Creating dummy test user:', testEmail)
  const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    password: 'TestPassword@123',
    email_confirm: true,
    user_metadata: { full_name: 'Test Delete User', role: 'worker' }
  })

  if (createErr || !authData.user) {
    console.error('Failed to create test user:', createErr)
    return
  }

  const userId = authData.user.id
  console.log('Created user with ID:', userId)

  // 2. Insert dummy profile
  await supabaseAdmin.from('profiles').upsert({
    id: userId,
    email: testEmail,
    full_name: 'Test Delete User',
    role: 'worker',
    employee_code: 'TEST-DEL',
    is_active: true
  })

  // 3. Now attempt deletion using the new safe flow
  console.log('2. Deleting user profile and auth user...')

  await Promise.allSettled([
    supabaseAdmin.from('activity_logs').update({ user_id: null }).eq('user_id', userId),
    supabaseAdmin.from('production_plans').update({ created_by: null }).eq('created_by', userId),
    supabaseAdmin.from('job_orders').update({ worker_id: null }).eq('worker_id', userId),
  ])

  const { error: profileErr } = await supabaseAdmin.from('profiles').delete().eq('id', userId)
  console.log('Profile delete result:', profileErr ? profileErr.message : 'SUCCESS')

  const { error: authDeleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
  console.log('Auth user delete result:', authDeleteErr ? authDeleteErr.message : 'SUCCESS')

  if (!profileErr && !authDeleteErr) {
    console.log('✅ TEST PASSED: User deletion works flawlessly!')
  }
}

testUserDeletionFlow()
