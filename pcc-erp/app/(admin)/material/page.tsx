export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import MaterialClient from './MaterialClient'
import { getPendingRequisitions } from '@/app/actions/material'

export default async function MaterialPage() {
  let requisitions: Awaited<ReturnType<typeof getPendingRequisitions>> = []

  try {
    requisitions = await getPendingRequisitions()
  } catch {
    // Supabase not configured or error — show empty state
  }

  return (
    <>
      <Header
        title="เบิกจ่ายวัตถุดิบ"
        subtitle="จัดการและยืนยันการจ่ายวัตถุดิบตามแผนการผลิต"
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 36px' }}>
        <MaterialClient initialData={requisitions} />
      </div>
    </>
  )
}
