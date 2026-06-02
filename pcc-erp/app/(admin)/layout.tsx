import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import type { UserRole } from '@/lib/supabase/types'
import { getSidebarBadgeCounts } from '@/app/actions/sidebar-badges'
import type { SidebarBadgeCounts } from '@/app/actions/sidebar-badges'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let role: UserRole = 'admin'
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
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        redirect('/login')
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      const fetchedRole = profile?.role as UserRole | undefined

      // Worker ไม่มีสิทธิ์เข้า admin layout
      if (fetchedRole === 'worker') {
        redirect('/unauthorized?reason=worker_login')
      }

      // QC ใช้ mobile layout → redirect
      if (fetchedRole === 'qc') {
        redirect('/qc-inspect')
      }

      if (fetchedRole) {
        role = fetchedRole
      }

      // ดึง badge counts สำหรับ sidebar (parallel, ไม่กระทบ render หากล้มเหลว)
      badgeCounts = await getSidebarBadgeCounts()
    } catch {
      // Supabase ยังไม่ configure → ใช้ default role (admin) เพื่อ dev
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-erp-bg text-erp-text-primary">
      <Sidebar role={role} badgeCounts={badgeCounts} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}
