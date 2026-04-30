export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import ProductsClient from './ProductsClient'
import { createClient } from '@/lib/supabase/server'

export default async function ProductsPage() {
  const supabase = await createClient()

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .order('category')
    .order('code')

  return (
    <>
      <Header 
        title="จัดการข้อมูลสินค้า (Product Master Data)" 
        subtitle="จัดการข้อมูลสินค้า Precast Concrete ทุกประเภท" 
      />
      <ProductsClient products={products ?? []} />
    </>
  )
}
