export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import ConcreteClient from './ConcreteClient'
import { getPendingConcreteOrders, getConcreteHistoryByDate } from '@/app/actions/concrete'

interface Props {
  searchParams: Promise<{ date?: string }>
}

export default async function ConcretePage({ searchParams }: Props) {
  const params = await searchParams
  const today = new Date().toISOString().split('T')[0]
  const selectedDate = params.date ?? today

  let pending: Awaited<ReturnType<typeof getPendingConcreteOrders>> = []
  let history: Awaited<ReturnType<typeof getConcreteHistoryByDate>> = []

  try {
    ;[pending, history] = await Promise.all([
      getPendingConcreteOrders(),
      getConcreteHistoryByDate(selectedDate),
    ])
  } catch (e) {
    console.error('[ConcretePage] fetch error:', e)
  }

  return (
    <>
      <Header
        title="คิวผสมคอนกรีต"
        subtitle="ติดตามและยืนยันการจ่ายคอนกรีตแต่ละรอบให้โรงผลิต"
      />
      <ConcreteClient
        pending={pending}
        history={history}
        selectedDate={selectedDate}
        today={today}
      />
    </>
  )
}
