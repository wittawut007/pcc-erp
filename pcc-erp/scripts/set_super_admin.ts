import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function setSuperAdmin() {
  console.log('Searching for user wittawut.abm...')
  
  const { data: profiles, error: selectError } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .or('email.eq.wittawut.abm@gmail.com,email.ilike.wittawut.abm%')

  if (selectError) {
    console.error('Error querying profile:', selectError)
    return
  }

  console.log('Found profiles:', profiles)

  if (!profiles || profiles.length === 0) {
    console.log('No profile matching wittawut.abm found. Querying all admin users...')
    const { data: adminProfiles } = await supabase.from('profiles').select('*').eq('role', 'admin')
    console.log('Current Admin profiles:', adminProfiles)
    return
  }

  for (const p of profiles) {
    console.log(`Updating profile ${p.id} (${p.full_name} / ${p.email}) to role: 'super_admin'...`)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role: 'super_admin' })
      .eq('id', p.id)

    if (updateError) {
      console.error(`Failed to update profile ${p.id}:`, updateError.message)
    } else {
      console.log(`Successfully updated profile ${p.full_name} (${p.email}) to super_admin!`)
    }

    // Also update auth.users metadata if possible
    try {
      const { error: authError } = await supabase.auth.admin.updateUserById(p.id, {
        user_metadata: { role: 'super_admin', full_name: p.full_name }
      })
      if (authError) {
        console.warn('Auth metadata update warning:', authError.message)
      } else {
        console.log('Updated Auth user metadata successfully!')
      }
    } catch (e) {
      console.warn('Auth user metadata update skipped:', e)
    }
  }

  console.log('✅ Super admin setup complete!')
}

setSuperAdmin()
