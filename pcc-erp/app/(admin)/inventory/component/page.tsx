export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import ComponentInventoryClient from './ComponentInventoryClient'

export default async function ComponentInventoryPage() {
  const supabase = await createClient()

  // ดึง Counterfort SFG stock ทั้งหมด
  const { data: counterfortMaterials } = await supabase
    .from('raw_materials')
    .select('id, material_code, name, qty_on_hand, min_stock, unit, updated_at, is_active')
    .eq('category', 'ชิ้นส่วน SFG')
    .order('name')

  // ดึงประวัติ activity logs สำหรับ Counterfort
  const cfIds = (counterfortMaterials ?? []).map((m: any) => m.id)
  let activityLogs: any[] = []
  if (cfIds.length > 0) {
    const { data: logs } = await supabase
      .from('activity_logs')
      .select('id, action_type, detail, created_at, user:profiles(full_name)')
      .in('entity_id', cfIds)
      .in('action_type', ['รับ Counterfort เข้าคลัง', 'เบิก Counterfort เข้าสาย', 'QC Counterfort Component'])
      .order('created_at', { ascending: false })
      .limit(50)
    activityLogs = logs ?? []
  }

  // ดึงสินค้า A42 ที่ใช้ Counterfort เพื่อแสดง BOM reference
  const { data: a42Products } = await supabase
    .from('products')
    .select('id, code, name, size, counterfort_material_id, counterfort_qty_per_unit')
    .eq('is_active', true)
    .not('counterfort_material_id', 'is', null)
    .order('code')

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <Header
        title="คลังชิ้นส่วน Counterfort (SFG)"
        subtitle="ติดตามสต๊อก Counterfort กึ่งสำเร็จรูป สำหรับประกอบ L-Wall กำแพงกันดิน A42"
      />
      <ComponentInventoryClient
        materials={counterfortMaterials ?? []}
        activityLogs={activityLogs}
        a42Products={a42Products ?? []}
      />
    </div>
  )
}


