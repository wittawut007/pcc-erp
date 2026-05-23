export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/supabase/types'
import MobileLogoutButton from '@/components/shared/MobileLogoutButton'

interface HeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  rightContent?: React.ReactNode
}

export default async function Header({ title, subtitle, rightContent }: HeaderProps) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const isConfigured = supabaseUrl && supabaseUrl !== 'your_supabase_project_url'

  let profile: Profile | null = null
  let userEmail: string | null = null
  const cacheBuster = Date.now()

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
  const dateStr = new Intl.DateTimeFormat('th-TH', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  }).format(now)

  return (
    <header style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 32, paddingRight: 32, background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      {/* Left */}
      <div className="flex flex-col">
        <h1 className="text-[16px] font-[700] text-erp-text-primary m-0">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[11px] text-erp-text-muted mt-0.5">{subtitle}</p>
        )}
      </div>

      <div className="flex-1"></div>

      {/* Right */}
      <div className="flex items-center gap-6">
        {/* Custom Right Content or Default Date Pill */}
        {rightContent ? rightContent : (
          <div className="flex items-center gap-2.5 mr-3 text-blue-700">
            <i className="fas fa-calendar-day text-[15px]"></i>
            <span className="text-[14px] font-[600]">{dateStr}</span>
          </div>
        )}


        {/* User Info */}
        <div className="flex items-center gap-3 cursor-pointer">
          <div className="w-[36px] h-[36px] rounded-full overflow-hidden shrink-0 border-2 border-erp-border">
            <img
              src={profile?.avatar_url ? `${profile.avatar_url}?t=${cacheBuster}` : 'https://i.pravatar.cc/150?img=11'}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-[600] text-erp-text-primary leading-[1.2]">
              {profile?.full_name || userEmail || 'วริศรา ผู้ดูแล'}
            </span>
            <span className="text-[11px] text-erp-text-muted leading-[1.2] mt-0.5">
              {roleLabel[profile?.role || 'admin']}
            </span>
          </div>
        </div>

        {/* Logout Button */}
        <div className="ml-2">
          <MobileLogoutButton />
        </div>
      </div>
    </header>
  )
}
