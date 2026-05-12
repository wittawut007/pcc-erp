import { redirect } from 'next/navigation'
import type { UserRole } from '@/lib/supabase/types'

import MobileLogoutButton from '@/components/shared/MobileLogoutButton'

export default async function MobileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let role: UserRole = 'qc'
  let userName = ''

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const isConfigured = supabaseUrl && supabaseUrl !== 'your_supabase_project_url'

  if (isConfigured) {
    try {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) redirect('/login')

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .single()

      if (!profile || profile.role !== 'qc') {
        redirect('/unauthorized?reason=forbidden')
      }

      role = profile.role as UserRole
      userName = profile.full_name ?? ''
    } catch {
      // dev mode
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#F8FAFC',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: 480,
      margin: '0 auto',
    }}>
      {/* Page Content */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
