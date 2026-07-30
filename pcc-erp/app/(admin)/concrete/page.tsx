export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import ConcreteClient from './ConcreteClient'
import { getPendingConcreteOrders, getConcreteHistoryByDate } from '@/app/actions/concrete'
import { createClient } from '@/lib/supabase/server'

interface Props {
  searchParams: Promise<{ date?: string }>
}

export default async function ConcretePage({ searchParams }: Props) {
  const params = await searchParams
  const today = new Date().toISOString().split('T')[0]
  const selectedDate = params.date ?? today

  let pending: Awaited<ReturnType<typeof getPendingConcreteOrders>> = []
  let history: Awaited<ReturnType<typeof getConcreteHistoryByDate>> = []

  let userRole: string | undefined = undefined

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      userRole = profile?.role
    }

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
        userRole={userRole}
      />
    </>
  )
}
