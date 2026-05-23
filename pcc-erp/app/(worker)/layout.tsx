import { redirect } from 'next/navigation'
import type { UserRole } from '@/lib/supabase/types'

export default async function WorkerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let role: UserRole = 'worker'

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

      // อนุญาตให้ทั้ง worker และ admin เข้าถึงได้ (admin อาจต้องการดูหน้านี้)
      if (!profile || !['worker', 'admin'].includes(profile.role)) {
        redirect('/unauthorized?reason=forbidden')
      }

      role = profile.role as UserRole
    } catch {
      // dev mode — ไม่ทำอะไร
    }
  }

  return <>{children}</>
}
