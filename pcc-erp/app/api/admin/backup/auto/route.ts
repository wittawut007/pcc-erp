import { NextResponse } from 'next/server'
import { checkAndRunScheduledBackup } from '@/lib/backup-scheduler'

/**
 * Handler สำหรับ Auto Backup
 * รองรับทั้ง GET (Vercel Cron / curl) และ POST (API triggers / Webhooks)
 *
 * Query Params:
 * - force=true : บังคับรัน Backup ทันทีโดยข้ามการตรวจสอบชั่วโมง (สำหรับทดสอบ)
 * - secret=... : ส่ง Secret Key ผ่าน Query Param แทน Header ได้
 */
async function handleAutoBackup(request: Request) {
  const url = new URL(request.url)
  const authHeader = request.headers.get('authorization')
  const cronSecretHeader = request.headers.get('x-cron-secret')
  const secretParam = url.searchParams.get('secret') || url.searchParams.get('key')
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'
  const isForce = url.searchParams.get('force') === 'true' || request.headers.get('x-force') === 'true'

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

  // ─── 2. ตรวจสอบเงื่อนไขเวลาและทำการ Backup ───────────────────────────────────
  console.log(`[BACKUP AUTO] Processing auto backup trigger (Force: ${isForce})...`)
  const result = await checkAndRunScheduledBackup({ force: isForce })

  if (result.skipped) {
    return NextResponse.json({
      skipped: true,
      reason: result.reason,
      currentHourBKK: result.currentHourBKK,
      scheduledHour: result.scheduledHour,
    })
  }

  if (result.success) {
    return NextResponse.json({
      success: true,
      fileName: result.fileName,
      fileSizeBytes: result.fileSizeBytes,
      durationSeconds: result.durationSeconds,
      currentHourBKK: result.currentHourBKK,
      scheduledHour: result.scheduledHour,
    })
  }

  return NextResponse.json(
    {
      success: false,
      error: result.error,
      currentHourBKK: result.currentHourBKK,
      scheduledHour: result.scheduledHour,
    },
    { status: 500 }
  )
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

