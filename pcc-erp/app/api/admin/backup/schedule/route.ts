import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdminRequest } from '@/lib/backup-engine'

/**
 * GET /api/admin/backup/schedule
 * ดึง backup schedule config — Admin only
 *
 * PUT /api/admin/backup/schedule
 * อัปเดต backup schedule config — Admin only
 */
export async function GET() {
  const authResult = await verifyAdminRequest()
  if (authResult instanceof NextResponse) return authResult

  try {
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('backup_schedule_config')
      .select('*')
      .limit(1)
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  const authResult = await verifyAdminRequest()
  if (authResult instanceof NextResponse) return authResult

  const { userId } = authResult

  try {
    const body = await request.json() as {
      is_enabled?: boolean
      schedule_hour?: number
      schedule_minute?: number
      retention_days?: number
      backup_types?: string[]
    }

    // Validate
    if (body.schedule_hour !== undefined && (body.schedule_hour < 0 || body.schedule_hour > 23)) {
      return NextResponse.json({ error: 'schedule_hour ต้องอยู่ระหว่าง 0-23' }, { status: 400 })
    }
    if (body.retention_days !== undefined && (body.retention_days < 1 || body.retention_days > 365)) {
      return NextResponse.json({ error: 'retention_days ต้องอยู่ระหว่าง 1-365' }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const { data: existing } = await adminClient
      .from('backup_schedule_config')
      .select('id')
      .limit(1)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'ไม่พบ Schedule Config' }, { status: 404 })
    }

    const { data, error } = await adminClient
      .from('backup_schedule_config')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' },
      { status: 500 }
    )
  }
}
