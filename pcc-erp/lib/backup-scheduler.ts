import { runDatabaseBackup, type BackupResult } from '@/lib/backup-engine'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutoBackupCheckResult {
  skipped: boolean
  reason?: string
  currentHourBKK?: number
  scheduledHour?: number
  success?: boolean
  fileName?: string
  fileSizeBytes?: number
  durationSeconds?: number
  error?: string
}

// ─── Utility: Get Bangkok Hour (UTC+7) ────────────────────────────────────────

export function getBangkokHour(date: Date = new Date()): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    hour: 'numeric',
    hour12: false,
  })
  const hour = parseInt(formatter.format(date), 10)
  return hour === 24 ? 0 : hour
}

// ─── Core: Check & Run Scheduled Backup ───────────────────────────────────────

/**
 * ตรวจสอบเงื่อนไขและทำการสำรองข้อมูลอัตโนมัติตามเวลาที่กำหนด
 * @param options.force หากเป็น true จะข้ามการตรวจสอบชั่วโมงและการกันรันซ้ำ
 */
export async function checkAndRunScheduledBackup(options?: {
  force?: boolean
}): Promise<AutoBackupCheckResult> {
  const isForce = options?.force ?? false

  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminClient = createAdminClient()

    // 1. ดึงการตั้งค่าจากฐานข้อมูล
    const { data: config, error: configError } = await adminClient
      .from('backup_schedule_config')
      .select('*')
      .limit(1)
      .maybeSingle()

    if (configError) {
      console.warn('[BACKUP SCHEDULER] Failed to read schedule config:', configError.message)
    }

    // ถ้าปิดการใช้งานอยู่ และไม่ได้บังคับรัน
    if (!isForce && config && !config.is_enabled) {
      console.log('[BACKUP SCHEDULER] Auto backup is disabled in settings — skipping')
      return {
        skipped: true,
        reason: 'Auto backup is disabled in settings',
      }
    }

    const currentHourBKK = getBangkokHour()
    const scheduledHour = config?.schedule_hour ?? 2

    // 2. ตรวจสอบชั่วโมง (ถ้าไม่ได้ force)
    if (!isForce) {
      if (currentHourBKK !== scheduledHour) {
        return {
          skipped: true,
          reason: `ยังไม่ถึงเวลาที่กำหนด (เวลาปัจจุบัน: ${String(currentHourBKK).padStart(2, '0')}:00 น., เวลาที่ตั้งไว้: ${String(scheduledHour).padStart(2, '0')}:00 น. ตามเวลาประเทศไทย)`,
          currentHourBKK,
          scheduledHour,
        }
      }

      // 3. ป้องกันการรันซ้ำซ้อนในวันเดียวกัน:
      // ตรวจสอบว่าในรอบ 20 ชั่วโมงที่ผ่านมา มี auto backup ที่สำเร็จไปแล้วหรือไม่
      const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
      const { data: recentBackup } = await adminClient
        .from('backup_logs')
        .select('id, backup_started_at, file_name')
        .eq('triggered_by', 'auto')
        .eq('status', 'success')
        .gte('backup_started_at', cutoff)
        .limit(1)
        .maybeSingle()

      if (recentBackup) {
        return {
          skipped: true,
          reason: `ทำการสำรองข้อมูลอัตโนมัติของรอบวันนี้แล้วเมื่อ ${recentBackup.backup_started_at} (${recentBackup.file_name})`,
          currentHourBKK,
          scheduledHour,
        }
      }
    }

    // 4. เริ่มทำการสำรองข้อมูล
    console.log(`[BACKUP SCHEDULER] Starting auto backup (Hour: ${currentHourBKK}:00 BKK, Force: ${isForce})...`)
    const result: BackupResult = await runDatabaseBackup('auto')

    if (result.success) {
      console.log(`[BACKUP SCHEDULER] Auto backup success: ${result.fileName} (${result.fileSizeBytes} bytes)`)
      return {
        skipped: false,
        success: true,
        fileName: result.fileName,
        fileSizeBytes: result.fileSizeBytes,
        durationSeconds: result.durationSeconds,
        currentHourBKK,
        scheduledHour,
      }
    } else {
      console.error('[BACKUP SCHEDULER] Auto backup failed:', result.error)
      return {
        skipped: false,
        success: false,
        error: result.error,
        currentHourBKK,
        scheduledHour,
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[BACKUP SCHEDULER] Unexpected error:', msg)
    return {
      skipped: false,
      success: false,
      error: msg,
    }
  }
}

// ─── In-Process Background Scheduler ──────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __backupSchedulerTimer: NodeJS.Timeout | null | undefined
}

/**
 * เริ่มต้นระบบตรวจสอบเวลาราย 10 นาทีภายในกระบวนการ Node.js
 * (เรียกจาก instrumentation.ts ตอน Server เริ่มต้น)
 */
export function initBackupScheduler() {
  // ไม่รันในขั้นตอน Next.js Build
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return
  }

  // ป้องกันการสร้าง Timer ซ้ำซ้อน
  if (globalThis.__backupSchedulerTimer) {
    return
  }

  console.log('[BACKUP SCHEDULER] In-process backup scheduler initialized (interval: 10m)')

  // ตรวจสอบทุกๆ 10 นาที
  const CHECK_INTERVAL_MS = 10 * 60 * 1000

  // ตรวจสอบครั้งแรกหลังจาก Server เปิดตัวแล้ว 30 วินาที
  setTimeout(async () => {
    try {
      await checkAndRunScheduledBackup()
    } catch (err) {
      console.error('[BACKUP SCHEDULER] Initial check error:', err)
    }
  }, 30 * 1000)

  globalThis.__backupSchedulerTimer = setInterval(async () => {
    try {
      await checkAndRunScheduledBackup()
    } catch (err) {
      console.error('[BACKUP SCHEDULER] Periodic check error:', err)
    }
  }, CHECK_INTERVAL_MS)
}
