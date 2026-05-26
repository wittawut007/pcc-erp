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

  const { data: rawMaterials } = await supabase
    .from('raw_materials')
    .select('id, name, category, unit, material_code')
    .eq('is_active', true)
    .order('category')
    .order('name')

  // Fetch all BOM items for all products
  const { data: productBomItems } = await supabase
    .from('product_bom_items')
    .select(`
      id,
      product_id,
      raw_material_id,
      qty_per_unit,
      sort_order,
      raw_materials (
        id,
        name,
        category,
        unit,
        material_code
      )
    `)
    .order('sort_order', { ascending: true })

  return (
    <>
      <Header 
        title="จัดการข้อมูลสินค้า (Product Master Data)" 
        subtitle="จัดการข้อมูลสินค้า Precast Concrete ทุกประเภท" 
      />
      <ProductsClient 
        products={products ?? []} 
        rawMaterials={rawMaterials ?? []}
        productBomItems={(productBomItems ?? []) as unknown as import('./ProductsClient').ProductBomItem[]}
      />
    </>
  )
}
