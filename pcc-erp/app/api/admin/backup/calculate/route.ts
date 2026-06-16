import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  try {
    // 1. ตรวจสอบสิทธิ์ผู้ดูแลระบบ (Admin Authorization)
    const clientSupabase = await createClient()
    const { data: { user } } = await clientSupabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'ไม่พบสิทธิ์การเข้าสู่ระบบ' }, { status: 401 })
    }

    const { data: profile } = await clientSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้' }, { status: 403 })
    }

    // 2. ดึงค่าพารามิเตอร์ startDate และ endDate จาก URL
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'กรุณาระบุวันที่เริ่มต้นและสิ้นสุด' }, { status: 400 })
    }

    // 3. ใช้ Admin Client เพื่อเรียกใช้ RPC get_production_photos_meta
    const adminSupabase = createAdminClient()
    const { data: photosMeta, error } = await adminSupabase.rpc('get_production_photos_meta', {
      start_date: startDate,
      end_date: endDate
    })

    if (error) {
      console.error('Error fetching photos meta:', error)
      return NextResponse.json({ error: `เกิดข้อผิดพลาดในการดึงข้อมูล: ${error.message}` }, { status: 500 })
    }

    const photos = photosMeta || []
    
    // 4. แยกคำนวณจำนวนไฟล์ตามประเภทรูปภาพ
    const counts = {
      ready: photos.filter((p: any) => p.photo_type === 'ready').length,
      cast: photos.filter((p: any) => p.photo_type === 'cast').length,
      demold: photos.filter((p: any) => p.photo_type === 'demold').length,
      qc: photos.filter((p: any) => p.photo_type === 'qc').length,
      total: photos.length
    }

    // 5. คำนวณขนาดโดยประมาณ (สมมติขนาดเฉลี่ยรูปภาพละ 250KB)
    const estimatedSizeBytes = counts.total * 250 * 1024
    const estimatedSizeMB = (estimatedSizeBytes / (1024 * 1024)).toFixed(2)

    return NextResponse.json({
      success: true,
      counts,
      estimatedSizeMB: parseFloat(estimatedSizeMB),
      photos: photos.map((p: any) => ({
        job_order_id: p.job_order_id,
        plan_date: p.plan_date,
        bed: p.bed,
        product_name: p.product_name,
        product_code: p.product_code,
        photo_type: p.photo_type,
        file_url: p.file_url,
        storage_path: p.storage_path
      }))
    })

  } catch (err: any) {
    console.error('Calculate backup error:', err)
    return NextResponse.json({ error: err.message || 'เกิดข้อผิดพลาดภายในระบบ' }, { status: 500 })
  }
}
