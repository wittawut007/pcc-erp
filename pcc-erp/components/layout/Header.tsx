export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/supabase/types'

interface HeaderProps {
  title: string
  subtitle?: string
}

export default async function Header({ title, subtitle }: HeaderProps) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const isConfigured = supabaseUrl && supabaseUrl !== 'your_supabase_project_url'

  let profile: Profile | null = null
  let userEmail: string | null = null

  if (isConfigured) {
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      userEmail = user?.email ?? null
      if (user) {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        profile = data
      }
    } catch {
      // Supabase not yet configured
    }
  }

  const roleLabel: Record<string, string> = {
    admin: 'ผู้ดูแลระบบ (Admin)',
    planner: 'ผู้วางแผนผลิต (Planner)',
    worker: 'พนักงานผลิต (Worker)',
    qc: 'ฝ่าย QC',
  }

  const now = new Date()
  const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  const dateStr = `${now.getDate()} ${thMonths[now.getMonth()]} ${now.getFullYear() + 543}`

  return (
    <header
      style={{
        height: 'var(--header-height)',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 36px',
      }}
      className="flex items-center justify-between flex-shrink-0"
    >
      {/* Left */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</p>
        )}
      </div>

      <div className="flex-1"></div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Date Pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '5px 11px',
          fontSize: 12, color: 'var(--text-secondary)',
        }}>
          <i className="fas fa-calendar" style={{ fontSize: 11, color: 'var(--accent)' }}></i>
          <span>{dateStr}</span>
        </div>

        {/* Notification */}
        <div style={{
          width: 32, height: 32, background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', position: 'relative',
        }}>
          <i className="far fa-bell" style={{ fontSize: 13, color: 'var(--text-secondary)' }}></i>
          <span style={{
            position: 'absolute', top: 5, right: 5,
            width: 7, height: 7, background: 'var(--red)',
            borderRadius: '50%', border: '1.5px solid white',
          }}></span>
        </div>

        {/* User Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '2px solid var(--border)' }}>
            <img
              src={profile?.avatar_url || 'https://i.pravatar.cc/150?img=11'}
              alt="Profile"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              {profile?.full_name || userEmail || 'วริศรา ผู้ดูแล'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.2, marginTop: 2 }}>
              {roleLabel[profile?.role || 'admin']}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
