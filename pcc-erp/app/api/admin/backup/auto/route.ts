import { NextResponse } from 'next/server'
import { runDatabaseBackup } from '@/lib/backup-engine'

/**
 * POST /api/admin/backup/auto
 * Vercel Cron Job endpoint — รัน backup อัตโนมัติทุกวันตี 2 (ICT)
 *
 * ต้องส่ง Authorization header: Bearer <CRON_SECRET>
 * ตั้งค่า CRON_SECRET ใน Vercel Environment Variables
 */
export async function POST(request: Request) {
  // ─── ตรวจสอบ Cron Secret ────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[BACKUP AUTO] CRON_SECRET environment variable is not set')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[BACKUP AUTO] Unauthorized cron attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ─── ตรวจสอบว่า Auto Backup เปิดอยู่หรือไม่ ────────────────────────────────
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminClient = createAdminClient()

    const { data: config } = await adminClient
      .from('backup_schedule_config')
      .select('is_enabled')
      .limit(1)
      .single()

    if (config && !config.is_enabled) {
      console.log('[BACKUP AUTO] Auto backup is disabled in config — skipping')
      return NextResponse.json({ skipped: true, reason: 'Auto backup disabled' })
    }
  } catch (configErr) {
    console.warn('[BACKUP AUTO] Could not read schedule config, proceeding anyway:', configErr)
  }

  // ─── รัน Backup ──────────────────────────────────────────────────────────────
  console.log('[BACKUP AUTO] Starting scheduled backup...')
  const result = await runDatabaseBackup('auto')

  if (result.success) {
    console.log(`[BACKUP AUTO] Success: ${result.fileName} (${result.fileSizeBytes} bytes, ${result.durationSeconds}s)`)
    return NextResponse.json({
      success: true,
      fileName: result.fileName,
      fileSizeBytes: result.fileSizeBytes,
      durationSeconds: result.durationSeconds,
    })
  } else {
    console.error('[BACKUP AUTO] Failed:', result.error)
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 }
    )
  }
}

// GET สำหรับ health check เท่านั้น
export async function GET() {
  return NextResponse.json({ status: 'Backup cron endpoint is active' })
}
