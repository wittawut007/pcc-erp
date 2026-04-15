export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import WipInventoryClient from './WipInventoryClient'
import { createClient } from '@/lib/supabase/server'

export default async function WipInventoryPage() {
  const supabase = await createClient()

  const { data: wip } = await supabase
    .from('wip_inventory')
    .select('*, product:products(code, name, category, unit, bom_code)')
    .order('updated_at', { ascending: false })

  const { data: products } = await supabase
    .from('products')
    .select('id, code, name, category, wip_code, unit')
    .eq('is_active', true)
    .order('category')

  return (
    <>
      <Header title="คลังโครงเหล็ก (WIP)" subtitle="จัดการสต็อกโครงเหล็กและชิ้นส่วนกึ่งสำเร็จรูป" />
      <WipInventoryClient wipItems={wip ?? []} products={products ?? []} />
    </>
  )
}
