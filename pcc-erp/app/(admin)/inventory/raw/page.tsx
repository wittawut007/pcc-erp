export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import RawMaterialsClient from './RawMaterialsClient'
import { createClient } from '@/lib/supabase/server'
import { getMaterialSummary, getConcreteSummary } from '@/app/actions/material'

export default async function RawMaterialsPage() {
  const supabase = await createClient()

  // Fetch materials
  const { data: materials } = await supabase
    .from('raw_materials')
    .select('*')
    .order('category')
    .order('name')

  // Fetch summary data for current month as initial data
  let summaryData: any[] = []
  let concreteData: any[] = []
  try {
    const now = new Date()
    const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const monthTo   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
    ;[summaryData, concreteData] = await Promise.all([
      getMaterialSummary({ dateFrom: monthFrom, dateTo: monthTo }),
      getConcreteSummary({ dateFrom: monthFrom, dateTo: monthTo }),
    ])
  } catch (e) {
    console.error('Error fetching material summary in raw inventory page:', e)
  }

  return (
    <>
      <Header title="คลังวัตถุดิบ (RM)" subtitle="จัดการสต็อกวัตถุดิบและแจ้งเตือนเมื่อใกล้หมด" />
      <RawMaterialsClient materials={materials ?? []} summaryData={summaryData} concreteData={concreteData} />
    </>
  )
}
