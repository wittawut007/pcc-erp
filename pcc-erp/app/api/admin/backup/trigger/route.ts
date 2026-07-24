import { NextResponse } from 'next/server'
import { runDatabaseBackup, verifyAdminRequest } from '@/lib/backup-engine'

/**
 * POST /api/admin/backup/trigger
 * Manual backup trigger — Admin only
 */
export async function POST() {
  const authResult = await verifyAdminRequest()
  if (authResult instanceof NextResponse) return authResult

  const { userId } = authResult

  try {
    const result = await runDatabaseBackup(`manual:${userId}`)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? 'Backup ล้มเหลว' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      logId: result.logId,
      fileName: result.fileName,
      fileSizeBytes: result.fileSizeBytes,
      durationSeconds: result.durationSeconds,
      message: 'Backup สำเร็จ',
    })
  } catch (err) {
    console.error('[BACKUP TRIGGER]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดภายใน' },
      { status: 500 }
    )
  }
}
