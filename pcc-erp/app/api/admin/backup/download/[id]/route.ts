import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdminRequest } from '@/lib/backup-engine'

/**
 * GET /api/admin/backup/download/[id]
 * สร้าง Signed URL สำหรับ download backup file — Admin only
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminRequest()
  if (authResult instanceof NextResponse) return authResult

  try {
    const { id } = await params
    const adminClient = createAdminClient()

    // ดึง storage_path จาก backup_logs
    const { data: log, error: fetchError } = await adminClient
      .from('backup_logs')
      .select('storage_path, file_name, status')
      .eq('id', id)
      .single()

    if (fetchError || !log) {
      return NextResponse.json({ error: 'ไม่พบข้อมูล Backup' }, { status: 404 })
    }

    if (log.status !== 'success') {
      return NextResponse.json({ error: 'Backup นี้ยังไม่สำเร็จ' }, { status: 400 })
    }

    if (!log.storage_path) {
      return NextResponse.json({ error: 'ไม่พบ Storage Path' }, { status: 400 })
    }

    // สร้าง Signed URL อายุ 15 นาที
    const { data: signedData, error: signedError } = await adminClient
      .storage
      .from('backups')
      .createSignedUrl(log.storage_path, 60 * 15)

    if (signedError || !signedData) {
      return NextResponse.json(
        { error: `ไม่สามารถสร้าง Download URL: ${signedError?.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      url: signedData.signedUrl,
      fileName: log.file_name,
      expiresInSeconds: 900,
    })
  } catch (err) {
    console.error('[BACKUP DOWNLOAD]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' },
      { status: 500 }
    )
  }
}
