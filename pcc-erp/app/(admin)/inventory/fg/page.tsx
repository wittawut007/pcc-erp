export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import FgInventoryClient from './FgInventoryClient'
import { createClient } from '@/lib/supabase/server'

export default async function FgInventoryPage() {
  const supabase = await createClient()

  const { data: fg } = await supabase
    .from('fg_inventory')
    .select('*, product:products(code, name, category, unit, size)')
    .order('updated_at', { ascending: false })

  const { data: products } = await supabase
    .from('products')
    .select('id, code, name, category, unit, size')
    .eq('is_active', true)
    .order('category')

  return (
    <>
      <Header title="คลังสินค้าพร้อมขาย (FG)" subtitle="จัดการสต็อกสินค้าสำเร็จรูปพร้อมจัดส่ง" />
      <FgInventoryClient fgItems={fg ?? []} products={products ?? []} />
    </>
  )
}
