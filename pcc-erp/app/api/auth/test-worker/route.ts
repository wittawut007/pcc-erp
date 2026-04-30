import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  
  const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
  
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('worker_token')
    .eq('role', 'worker')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (profile?.worker_token) {
    return NextResponse.redirect(new URL(`/worker-entry?token=${profile.worker_token}`, request.url))
  }
  
  return NextResponse.json({ error: 'No active worker found' }, { status: 404 })
}
