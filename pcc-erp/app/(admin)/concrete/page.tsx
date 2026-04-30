export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import ConcreteClient from './ConcreteClient'
import { getPendingConcreteOrders, getTodayConcreteHistory } from '@/app/actions/concrete'

export default async function ConcretePage() {
  let pending: Awaited<ReturnType<typeof getPendingConcreteOrders>> = []
  let history: Awaited<ReturnType<typeof getTodayConcreteHistory>> = []

  try {
    ;[pending, history] = await Promise.all([
      getPendingConcreteOrders(),
      getTodayConcreteHistory(),
    ])
  } catch {
    // Supabase not configured
  }

  return (
    <>
      <Header
        title="คิวผสมคอนกรีต"
        subtitle="ตรวจสอบและยืนยันการจ่ายคอนกรีตให้แต่ละแท่น"
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 36px' }}>
        <ConcreteClient pending={pending} history={history} />
      </div>
    </>
  )
}
