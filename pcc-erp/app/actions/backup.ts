'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackupLog {
  id: string
  backup_type: 'database' | 'storage' | 'full'
  status: 'running' | 'success' | 'failed'
  triggered_by: string
  file_name: string | null
  file_size_bytes: number | null
  storage_path: string | null
  backup_started_at: string
  backup_finished_at: string | null
  duration_seconds: number | null
  error_message: string | null
  metadata: Record<string, unknown> | null
}

export interface BackupScheduleConfig {
  id: string
  is_enabled: boolean
  schedule_hour: number
  schedule_minute: number
  retention_days: number
  backup_types: string[]
  updated_at: string
  updated_by: string | null
}

export interface BackupStats {
  total: number
  success: number
  failed: number
  running: number
  last_success: BackupLog | null
  avg_duration_seconds: number | null
  total_size_bytes: number
}

// ─── Helper: ตรวจสอบสิทธิ์ admin ─────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('ไม่ได้เข้าสู่ระบบ')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') throw new Error('ไม่มีสิทธิ์ Admin')

  return { supabase, adminClient: createAdminClient(), userId: user.id }
}

// ─── 1. ดึงรายการ Backup Logs ─────────────────────────────────────────────────

export async function getBackupLogsAction(
  limit = 50
): Promise<{ data?: BackupLog[]; error?: string }> {
  try {
    await requireAdmin()
    const adminClient = createAdminClient()

    const { data, error } = await adminClient
      .from('backup_logs')
      .select('*')
      .order('backup_started_at', { ascending: false })
      .limit(limit)

    if (error) throw new Error(error.message)

    return { data: (data ?? []) as BackupLog[] }
  } catch (err) {
    await logError({ action: 'getBackupLogsAction', error: err })
    return { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' }
  }
}

// ─── 2. ดึงสถิติ Backup Summary ───────────────────────────────────────────────

export async function getBackupStatsAction(): Promise<{ data?: BackupStats; error?: string }> {
  try {
    await requireAdmin()
    const adminClient = createAdminClient()

    const { data: logs, error } = await adminClient
      .from('backup_logs')
      .select('*')
      .order('backup_started_at', { ascending: false })
      .limit(100)

    if (error) throw new Error(error.message)

    const all = (logs ?? []) as BackupLog[]
    const success = all.filter(l => l.status === 'success')
    const failed = all.filter(l => l.status === 'failed')
    const running = all.filter(l => l.status === 'running')
    const avgDuration = success.length > 0
      ? Math.round(success.reduce((s, l) => s + (l.duration_seconds ?? 0), 0) / success.length)
      : null
    const totalSize = success.reduce((s, l) => s + (l.file_size_bytes ?? 0), 0)

    return {
      data: {
        total: all.length,
        success: success.length,
        failed: failed.length,
        running: running.length,
        last_success: success[0] ?? null,
        avg_duration_seconds: avgDuration,
        total_size_bytes: totalSize,
      }
    }
  } catch (err) {
    await logError({ action: 'getBackupStatsAction', error: err })
    return { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' }
  }
}

// ─── 3. ดึง Schedule Config ───────────────────────────────────────────────────

export async function getBackupScheduleAction(): Promise<{ data?: BackupScheduleConfig; error?: string }> {
  try {
    await requireAdmin()
    const adminClient = createAdminClient()

    const { data, error } = await adminClient
      .from('backup_schedule_config')
      .select('*')
      .limit(1)
      .single()

    if (error) throw new Error(error.message)

    return { data: data as BackupScheduleConfig }
  } catch (err) {
    await logError({ action: 'getBackupScheduleAction', error: err })
    return { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' }
  }
}

// ─── 4. อัปเดต Schedule Config ───────────────────────────────────────────────

export async function updateBackupScheduleAction(
  config: Partial<Pick<BackupScheduleConfig, 'is_enabled' | 'schedule_hour' | 'schedule_minute' | 'retention_days' | 'backup_types'>>
): Promise<{ success?: boolean; error?: string }> {
  try {
    const { userId } = await requireAdmin()
    const adminClient = createAdminClient()

    // ดึง config record แรก
    const { data: existing } = await adminClient
      .from('backup_schedule_config')
      .select('id')
      .limit(1)
      .single()

    if (!existing) throw new Error('ไม่พบ Schedule Config')

    const { error } = await adminClient
      .from('backup_schedule_config')
      .update({
        ...config,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq('id', existing.id)

    if (error) throw new Error(error.message)

    return { success: true }
  } catch (err) {
    await logError({ action: 'updateBackupScheduleAction', error: err })
    return { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' }
  }
}

// ─── 5. สร้าง Download URL สำหรับ Backup File ────────────────────────────────

export async function getBackupDownloadUrlAction(
  backupId: string
): Promise<{ url?: string; error?: string }> {
  try {
    await requireAdmin()
    const adminClient = createAdminClient()

    // ดึง storage_path จาก backup_logs
    const { data: log, error: logError } = await adminClient
      .from('backup_logs')
      .select('storage_path, file_name, status')
      .eq('id', backupId)
      .single()

    if (logError || !log) throw new Error('ไม่พบข้อมูล Backup')
    if (log.status !== 'success') throw new Error('Backup นี้ไม่สำเร็จ ไม่สามารถ Download ได้')
    if (!log.storage_path) throw new Error('ไม่พบ Storage Path')

    // สร้าง Signed URL อายุ 15 นาที
    const { data: signedData, error: signedError } = await adminClient
      .storage
      .from('backups')
      .createSignedUrl(log.storage_path, 60 * 15)

    if (signedError || !signedData) throw new Error('ไม่สามารถสร้าง Download URL ได้')

    return { url: signedData.signedUrl }
  } catch (err) {
    await logError({ action: 'getBackupDownloadUrlAction', error: err })
    return { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' }
  }
}

// ─── 6. ลบ Backup File (Admin only) ──────────────────────────────────────────

export async function deleteBackupAction(
  backupId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const { userId } = await requireAdmin()
    const adminClient = createAdminClient()

    const { data: log, error: fetchError } = await adminClient
      .from('backup_logs')
      .select('storage_path')
      .eq('id', backupId)
      .single()

    if (fetchError || !log) throw new Error('ไม่พบข้อมูล Backup')

    // ลบไฟล์จาก Storage (ถ้ามี)
    if (log.storage_path) {
      await adminClient.storage.from('backups').remove([log.storage_path])
    }

    // ลบ log record
    const { error: deleteError } = await adminClient
      .from('backup_logs')
      .delete()
      .eq('id', backupId)

    if (deleteError) throw new Error(deleteError.message)

    // บันทึก activity log
    const supabase = await createClient()
    await supabase.from('activity_logs').insert({
      action_type: 'BACKUP_DELETED',
      entity_type: 'backup',
      entity_id: backupId,
      user_id: userId,
      detail: `ลบ backup: ${backupId}`,
    })

    return { success: true }
  } catch (err) {
    await logError({ action: 'deleteBackupAction', error: err })
    return { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' }
  }
}
