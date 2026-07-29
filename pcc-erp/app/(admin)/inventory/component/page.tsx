export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Header from '@/components/layout/Header'
import ComponentInventoryClient from './ComponentInventoryClient'

export default async function ComponentInventoryPage() {
  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  // ดึง Counterfort SFG stock ทั้งหมด
  const { data: counterfortMaterials } = await supabaseAdmin
    .from('raw_materials')
    .select('id, material_code, name, qty_on_hand, min_stock, unit, updated_at, is_active')
    .eq('category', 'ชิ้นส่วน SFG')
    .order('name')

  // ดึงสินค้า A42 ที่ใช้ Counterfort เพื่อแสดง BOM reference
  const { data: a42Products } = await supabaseAdmin
    .from('products')
    .select('id, code, name, size, category, counterfort_material_id, counterfort_qty_per_unit')
    .eq('is_active', true)

  // ตรวจสอบ role ของผู้ใช้งาน
  let userRole = ''
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    userRole = profile?.role || ''
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <Header
        title="คลังชิ้นส่วน Counterfort (SFG)"
        subtitle="ติดตามสต๊อก Counterfort กึ่งสำเร็จรูป สำหรับประกอบ L-Wall กำแพงกันดิน A42"
      />
      <ComponentInventoryClient
        materials={counterfortMaterials ?? []}
        activityLogs={[]}
        a42Products={a42Products ?? []}
        userRole={userRole}
      />
    </div>
  )
}


