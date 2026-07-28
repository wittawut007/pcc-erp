import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import type { UserRole } from '@/lib/supabase/types'
import { getSidebarBadgeCounts } from '@/app/actions/sidebar-badges'
import type { SidebarBadgeCounts } from '@/app/actions/sidebar-badges'
import { getCachedUser, getCachedProfile } from '@/lib/supabase/server'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let user = null
  let profile = null
  let badgeCounts: SidebarBadgeCounts = {
    productionOrder: 0,
    jobOrders: 0,
    demolding: 0,
    material: 0,
    concrete: 0,
    fgInventory: 0,
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const isConfigured = supabaseUrl && supabaseUrl !== 'your_supabase_project_url'

  if (isConfigured) {
    try {
      const resUser = await getCachedUser()
      user = resUser.user

      if (user) {
        const resProfile = await getCachedProfile(user.id)
        profile = resProfile.data
      }

      badgeCounts = await getSidebarBadgeCounts().catch(() => badgeCounts)
    } catch (e) {
      console.error('Error in AdminLayout data fetching:', e)
    }

    // Redirects executed OUTSIDE try-catch so Next.js redirects work properly
    if (!user) {
      redirect('/login')
    }

    const effectiveRole: UserRole = (profile?.role || user?.user_metadata?.role || 'admin') as UserRole

    if (effectiveRole === 'worker') {
      redirect('/unauthorized?reason=worker_login')
    }

    if (effectiveRole === 'qc') {
      redirect('/qc-inspect')
    }

    return (
      <div className="flex h-screen w-full overflow-hidden bg-erp-bg text-erp-text-primary">
        <Sidebar role={effectiveRole} badgeCounts={badgeCounts} />
        <main className="flex-1 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-erp-bg text-erp-text-primary">
      <Sidebar role="admin" badgeCounts={badgeCounts} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}
