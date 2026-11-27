import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import type { UserRole } from '@/lib/supabase/types'
import { classifyServerDevice } from '@/lib/utils/device'
import MobileOnlyGuard, { DesktopBlockedView } from '@/components/shared/MobileOnlyGuard'

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
    let shouldRedirectToLogin = false
    let shouldRedirectToUnauthorized = false

    try {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        shouldRedirectToLogin = true
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, full_name')
          .eq('id', user.id)
          .single()

        const userRole = (profile?.role || user.user_metadata?.role) as UserRole

        if (!userRole || (userRole !== 'qc' && userRole !== 'admin' && userRole !== 'super_admin')) {
          shouldRedirectToUnauthorized = true
        } else {
          role = userRole
          userName = profile?.full_name ?? user.email ?? ''
        }
      }
    } catch {
      // dev mode fallback or network error
    }

    if (shouldRedirectToLogin) {
      redirect('/login')
    }
    if (shouldRedirectToUnauthorized) {
      redirect('/unauthorized?reason=forbidden')
    }
  }

  const headerList = await headers()
  const serverCheck = classifyServerDevice(
    headerList.get('user-agent'),
    headerList.get('sec-ch-ua-mobile')
  )
  const canAccessDashboard = role === 'admin' || role === 'super_admin'

  if (serverCheck === 'desktop') {
    return (
      <DesktopBlockedView
        roleLabel="พนักงาน QC"
        showDashboardLink={canAccessDashboard}
      />
    )
  }

  return (
    <MobileOnlyGuard
      roleLabel="พนักงาน QC"
      serverCheck={serverCheck}
      showDashboardLink={canAccessDashboard}
    >
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
    </MobileOnlyGuard>
  )
}
