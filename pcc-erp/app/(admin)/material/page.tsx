export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import MaterialClient from './MaterialClient'
import { getPendingRequisitions } from '@/app/actions/material'
import { createClient } from '@/lib/supabase/server'

export default async function MaterialPage() {
  let requisitions: Awaited<ReturnType<typeof getPendingRequisitions>> = []
  let role = ''

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      role = profile?.role || ''
    }
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
        <MaterialClient initialData={requisitions} role={role} />
      </div>
    </>
  )
}
