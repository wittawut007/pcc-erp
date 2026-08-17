import { NextResponse } from 'next/server'
import { runDatabaseBackup } from '@/lib/backup-engine'

/**
 * Handler สำหรับ Auto Backup
 * รองรับทั้ง GET (Vercel Cron / curl) และ POST (API triggers)
 */
async function handleAutoBackup(request: Request) {
  const url = new URL(request.url)
  const authHeader = request.headers.get('authorization')
  const cronSecretHeader = request.headers.get('x-cron-secret')
  const secretParam = url.searchParams.get('secret') || url.searchParams.get('key')
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'

  const cronSecret = process.env.CRON_SECRET
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const isDev = process.env.NODE_ENV === 'development'

  // ─── 1. ตรวจสอบสิทธิ์ (Authentication) ──────────────────────────────────────
  let isAuthorized = false

  if (cronSecret) {
    if (
      authHeader === `Bearer ${cronSecret}` ||
      cronSecretHeader === cronSecret ||
      secretParam === cronSecret
    ) {
      isAuthorized = true
    }
  }

  // อนุญาตถ้าใช้ Service Role Key เป็น Bearer Token (สำหรับ VPS Cron หรือ Internal Calls)
  if (!isAuthorized && serviceRoleKey) {
    if (
      authHeader === `Bearer ${serviceRoleKey}` ||
      secretParam === serviceRoleKey
    ) {
      isAuthorized = true
    }
  }

  // ถ้าเป็น Vercel Cron และไม่มี CRON_SECRET กำหนดไว้ใน env ให้ผ่านถ้ามี Vercel Cron header
  if (!isAuthorized && isVercelCron) {
    isAuthorized = true
  }

  // สำหรับ localhost/dev ถ้าไม่ได้ตั้ง secret ให้ bypass เพื่อสะดวกต่อการทดสอบ
  if (!isAuthorized && isDev && !cronSecret) {
    isAuthorized = true
  }

  if (!isAuthorized) {
    console.warn('[BACKUP AUTO] Unauthorized cron attempt from:', request.headers.get('user-agent'))
    return NextResponse.json({ error: 'Unauthorized — Invalid or missing Cron Secret' }, { status: 401 })
  }

  // ─── 2. ตรวจสอบสถานะการเปิดใช้งาน (Schedule Config) ──────────────────────────
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminClient = createAdminClient()

    const { data: config } = await adminClient
      .from('backup_schedule_config')
      .select('is_enabled, schedule_hour')
      .limit(1)
      .maybeSingle()

    if (config && !config.is_enabled) {
      console.log('[BACKUP AUTO] Auto backup is disabled in config — skipping')
      return NextResponse.json({ skipped: true, reason: 'Auto backup is disabled in settings' })
    }
  } catch (configErr) {
    console.warn('[BACKUP AUTO] Could not read schedule config, proceeding anyway:', configErr)
  }

  // ─── 3. รัน Backup ──────────────────────────────────────────────────────────
  console.log('[BACKUP AUTO] Starting scheduled auto backup...')
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

/**
 * GET /api/admin/backup/auto
 * Vercel Cron Job ส่งคำขอเป็น GET request เสมอ
 */
export async function GET(request: Request) {
  return handleAutoBackup(request)
}

/**
 * POST /api/admin/backup/auto
 * สำหรับ webhook หรือ external trigger ผ่าน POST
 */
export async function POST(request: Request) {
  return handleAutoBackup(request)
}
