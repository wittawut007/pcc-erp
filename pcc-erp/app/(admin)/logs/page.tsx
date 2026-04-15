export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import LogsClient from './LogsClient'

async function getLogsData() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || supabaseUrl === 'your_supabase_project_url' || !supabaseKey) {
    return { logs: null }
  }
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: logs } = await supabase
      .from('activity_logs')
      .select('*, profile:profiles(full_name, role, employee_code)')
      .order('created_at', { ascending: false })
      .limit(200)
    return { logs }
  } catch {
    return { logs: null }
  }
}

export default async function LogsPage() {
  const { logs } = await getLogsData()
  return (
    <>
      <Header title="ประวัติการทำงาน" subtitle="บันทึกกิจกรรมทั้งหมดในระบบ ERP" />
      <LogsClient logs={logs ?? []} />
    </>
  )
}
