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
      {/* Mobile Header */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid #E5E7EB',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="fas fa-clipboard-check" style={{ color: '#fff', fontSize: 15 }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', lineHeight: 1 }}>QC Inspection</div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>ตรวจสอบคุณภาพ</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}>{userName}</div>
            <div style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
              background: '#FEE2E2', color: '#DC2626', marginTop: 2, display: 'inline-block'
            }}>QC</div>
          </div>
          <MobileLogoutButton />
        </div>
      </header>

      {/* Page Content */}
      <main style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
