import { createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import UsersClient from './UsersClient'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const supabase = await createClient()

  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .order('role', { ascending: true })
    .order('created_at', { ascending: false })

  return (
    <>
      <Header title="จัดการผู้ใช้งานระบบ (User Management)" subtitle="จัดการสิทธิ์การเข้าใช้งานระบบ ERP แยกแผนกต่างๆ" />
      <UsersClient initialUsers={users || []} />
    </>
  )
}

