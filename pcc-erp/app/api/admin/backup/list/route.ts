import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdminRequest } from '@/lib/backup-engine'

/**
 * GET /api/admin/backup/list
 * ดึงรายการ backup logs ทั้งหมด — Admin only
 */
export async function GET(request: Request) {
  const authResult = await verifyAdminRequest()
  if (authResult instanceof NextResponse) return authResult

  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
    const statusFilter = searchParams.get('status') // 'success' | 'failed' | 'running' | null

    const adminClient = createAdminClient()
    let query = adminClient
      .from('backup_logs')
      .select('*')
      .order('backup_started_at', { ascending: false })
      .limit(limit)

    if (statusFilter && ['success', 'failed', 'running'].includes(statusFilter)) {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true, data: data ?? [], count: data?.length ?? 0 })
  } catch (err) {
    console.error('[BACKUP LIST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' },
      { status: 500 }
    )
  }
}
