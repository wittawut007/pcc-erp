export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import RawMaterialsClient from './RawMaterialsClient'
import { createClient } from '@/lib/supabase/server'

export default async function RawMaterialsPage() {
  const supabase = await createClient()

  const { data: materials } = await supabase
    .from('raw_materials')
    .select('*')
    .order('category')
    .order('name')

  return (
    <>
      <Header title="คลังวัตถุดิบ (RM)" subtitle="จัดการสต็อกวัตถุดิบและแจ้งเตือนเมื่อใกล้หมด" />
      <RawMaterialsClient materials={materials ?? []} />
    </>
  )
}
