export const dynamic = 'force-dynamic'

import QCClient from './QCClient'
import { getQCJobOrders } from '@/app/actions/qc'
import { createClient } from '@/lib/supabase/server'

export default async function QCPage() {
  let jobOrders: Awaited<ReturnType<typeof getQCJobOrders>> = []
  let qcName = 'QC Staff'
  let avatarUrl: string | null = null

  try {
    jobOrders = await getQCJobOrders()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single()
      if (profile?.full_name) qcName = profile.full_name
      if (profile?.avatar_url) avatarUrl = profile.avatar_url
    }
  } catch {
    // Supabase not configured
  }

  return <QCClient initialData={jobOrders} qcName={qcName} avatarUrl={avatarUrl} />
}
