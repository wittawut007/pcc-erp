export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import MaterialClient from './MaterialClient'
import { getPendingRequisitions } from '@/app/actions/material'
import { createClient } from '@/lib/supabase/server'

export default async function MaterialPage() {
  let requisitions: Awaited<ReturnType<typeof getPendingRequisitions>> = []
  let role = ''
  let userFullName = ''

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
      role = profile?.role || ''
      userFullName = profile?.full_name || ''
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
        <MaterialClient initialData={requisitions} role={role} userFullName={userFullName} />
      </div>
    </>
  )
}
