export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import LogsTabs from './LogsTabs'
import { fetchActivityLogs } from '@/lib/supabase/queries/logs'
import { getErrorLogs } from '@/app/actions/error-logs'

export default async function LogsPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // ถ้า env ยังไม่ถูกตั้ง ให้ใช้ empty data (หน้า Dev/Preview)
  if (!supabaseUrl || supabaseUrl === 'your_supabase_project_url' || !supabaseKey) {
    return (
      <>
        <Header title="ประวัติการทำงาน" subtitle="บันทึกกิจกรรมและ Error Logs ของระบบ ERP" />
        <LogsTabs activityLogs={[]} errorLogs={[]} errorCount={0} />
      </>
    )
  }

  // ดึงทั้งสองพร้อมกันด้วย Promise.all — ลด Latency
  const [activityResult, errorResult] = await Promise.all([
    fetchActivityLogs({ page: 0, pageSize: 100 }),
    getErrorLogs(),
  ])

  return (
    <>
      <Header
        title="ประวัติการทำงาน"
        subtitle={
          activityResult.timedOut
            ? 'บันทึกกิจกรรม (โหลดข้อมูลช้า — แสดงผลบางส่วน)'
            : 'บันทึกกิจกรรมและ Error Logs ของระบบ ERP'
        }
      />
      <LogsTabs
        activityLogs={activityResult.logs}
        errorLogs={errorResult.logs}
        errorCount={errorResult.logs.length}
      />
    </>
  )
}

