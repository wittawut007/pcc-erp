import { redirect } from 'next/navigation'
import { getDefaultPath } from '@/lib/rbac'
import type { UserRole } from '@/lib/supabase/types'

export default async function Home() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const isConfigured = supabaseUrl && supabaseUrl !== 'your_supabase_project_url'

  if (isConfigured) {
    try {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        const role = (profile?.role ?? 'admin') as UserRole
        redirect(getDefaultPath(role))
      }
    } catch {
      // fallback
    }
  }

  redirect('/dashboard')
}
