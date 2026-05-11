export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import QcClient from './QcClient'

async function getQcData() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || supabaseUrl === 'your_supabase_project_url' || !supabaseKey) {
    return { records: null, summary: null }
  }
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    const [{ data: records }, { data: summary }] = await Promise.all([
      supabase
        .from('qc_inspections')
        .select(`
          *,
          job_order:job_orders(
            bed,
            plan_item:production_plan_items(
              product:products(name,category,unit)
            )
          ),
          qc_profile:profiles!qc_inspections_qc_id_fkey(full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('qc_inspections')
        .select('demold_qty_good, demold_qty_defect, defect_reason, created_at'),
    ])
    return { records, summary }
  } catch {
    return { records: null, summary: null }
  }
}

export default async function QcPage() {
  const { records, summary } = await getQcData()
  return (
    <>
      <Header title="จัดการของเสีย (QC)" subtitle="สรุปผลการถอดแบบและวิเคราะห์ของเสีย" />
      <QcClient records={records ?? []} summary={summary ?? []} />
    </>
  )
}
