import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()
  
  const testUsers = [
    { email: 'admin@pcc.com', password: 'password123', full_name: 'สมเกียรติ (Admin)', role: 'admin' },
    { email: 'planner@pcc.com', password: 'password123', full_name: 'สมหญิง (Planner)', role: 'planner' },
    { email: 'worker@pcc.com', password: 'password123', full_name: 'สมชาย (Worker)', role: 'worker' }
  ]

  let results = []

  for (const u of testUsers) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.full_name, role: u.role }
    })
    
    if (data.user) {
      await supabase.from('profiles').update({
        full_name: u.full_name,
        role: u.role,
        is_active: true
      }).eq('id', data.user.id)
    }

    results.push({ email: u.email, success: !error, error: error?.message })
  }

  return NextResponse.json({ message: "Seeding complete", results })
}
