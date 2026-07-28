import { redirect } from 'next/navigation'
import type { UserRole } from '@/lib/supabase/types'
import { cookies } from 'next/headers'

export default async function WorkerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let role: UserRole = 'worker'

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const isConfigured = supabaseUrl && supabaseUrl !== 'your_supabase_project_url'

  if (isConfigured) {
    const cookieStore = await cookies()
    const workerSession = cookieStore.get('worker_session')?.value

    if (workerSession) {
      // If entering via QR code (worker_session is set), allow access directly
      return <>{children}</>
    }

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

        // อนุญาตให้ทั้ง worker และ admin เข้าถึงได้ (admin อาจต้องการดูหน้านี้)
        if (!userRole || !['worker', 'admin'].includes(userRole)) {
          shouldRedirectToUnauthorized = true
        } else {
          role = userRole
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

  return <>{children}</>
}
