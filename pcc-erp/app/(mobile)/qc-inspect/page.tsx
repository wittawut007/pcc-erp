export const dynamic = 'force-dynamic'

import QCClient from './QCClient'
import { getQCJobOrders } from '@/app/actions/qc'

export default async function QCPage() {
  let jobOrders: Awaited<ReturnType<typeof getQCJobOrders>> = []

  try {
    jobOrders = await getQCJobOrders()
  } catch {
    // Supabase not configured
  }

  return <QCClient initialData={jobOrders} />
}
