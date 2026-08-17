import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Core Backup Engine ───────────────────────────────────────────────────────
// ใช้ร่วมกันโดย /auto (Vercel Cron) และ /trigger (Manual)

export interface BackupResult {
  success: boolean
  logId?: string
  fileName?: string
  fileSizeBytes?: number
  durationSeconds?: number
  error?: string
}

export async function runDatabaseBackup(triggeredBy: string): Promise<BackupResult> {
  const adminClient = createAdminClient()
  const startTime = Date.now()
  let logId: string | null = null

  try {
    // 1. สร้าง backup log record (status = 'running')
    const { data: logIdData, error: logCreateError } = await adminClient.rpc('create_backup_log', {
      p_backup_type: 'database',
      p_triggered_by: triggeredBy,
    })

    if (logCreateError || !logIdData) {
      console.error('[BACKUP] Failed to create log record:', logCreateError)
      throw new Error(`ไม่สามารถสร้าง backup log ได้: ${logCreateError?.message}`)
    }

    logId = logIdData as string

    // 2. ดึง metadata snapshot (จำนวน rows ในแต่ละ table)
    const { data: metadataRaw } = await adminClient.rpc('get_backup_metadata_snapshot')
    const metadata = metadataRaw as Record<string, unknown>

    // 3. Export ข้อมูลจากทุก table ที่มีอยู่จริง (ตาม migrations 001–015)
    // ใช้ allSettled เพื่อให้ 1 table ล้มเหลวไม่กระทบ table อื่น
    const tableKeys = [
      'profiles', 'products', 'product_bom_items', 'raw_materials',
      'raw_material_transactions', 'production_plans', 'production_plan_items',
      'production_orders', 'job_orders', 'demolding_records',
      'qc_inspections', 'job_order_defects', 'fg_inventory', 'fg_receipts',
      'wip_inventory', 'concrete_orders', 'concrete_rounds', 'plan_materials', 'activity_logs',
    ] as const

    const tablePromises = [
      adminClient.from('profiles').select('id, email, full_name, role, employee_code, is_active, created_at'),
      adminClient.from('products').select('*'),
      adminClient.from('product_bom_items').select('*'),
      adminClient.from('raw_materials').select('*'),
      adminClient.from('raw_material_transactions').select('*'),
      adminClient.from('production_plans').select('*'),
      adminClient.from('production_plan_items').select('*'),
      adminClient.from('production_orders').select('*'),
      adminClient.from('job_orders').select('*'),
      adminClient.from('demolding_records').select('*'),
      adminClient.from('qc_inspections').select('*'),
      adminClient.from('job_order_defects').select('*'),
      adminClient.from('fg_inventory').select('*'),
      adminClient.from('fg_receipts').select('*'),
      adminClient.from('wip_inventory').select('*'),
      adminClient.from('concrete_orders').select('*'),
      adminClient.from('concrete_rounds').select('*'),
      adminClient.from('plan_materials').select('*'),
      adminClient.from('activity_logs').select('*').limit(5000),
    ]

    const results = await Promise.allSettled(tablePromises)
    const tables: Record<string, unknown[]> = {}
    const tableErrors: string[] = []

    results.forEach((result, i) => {
      const key = tableKeys[i]
      if (result.status === 'fulfilled') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tables[key] = ((result.value as any).data ?? []) as unknown[]
      } else {
        tables[key] = []
        tableErrors.push(`${key}: ${String(result.reason)}`)
        console.warn(`[BACKUP] Table "${key}" skipped (non-fatal):`, result.reason)
      }
    })


    // 4. สร้าง JSON payload
    const backupPayload = {
      version: '1.1',
      exported_at: new Date().toISOString(),
      project_ref: process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0] ?? 'unknown',
      tables,
      metadata: {
        ...metadata,
        table_errors: tableErrors.length > 0 ? tableErrors : undefined,
      },
    }

    // 5. แปลงเป็น JSON string และคำนวณขนาด
    const jsonString = JSON.stringify(backupPayload)
    const fileSizeBytes = Buffer.byteLength(jsonString, 'utf8')

    // 6. สร้างชื่อไฟล์พร้อม timestamp
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)                  // YYYY-MM-DD
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '') // HHmmss
    const fileName = `pcc_erp_db_${dateStr}_${timeStr}.json`
    const storagePath = `database/${dateStr}/${fileName}`

    // 7. Upload ไปยัง Supabase Storage bucket 'backups'
    const fileBuffer = Buffer.from(jsonString, 'utf8')
    const { error: uploadError } = await adminClient
      .storage
      .from('backups')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/json',
        upsert: false,
      })

    if (uploadError) throw new Error(`Storage upload ล้มเหลว: ${uploadError.message}`)

    // 8. อัปเดต backup log → success
    const durationSeconds = Math.round((Date.now() - startTime) / 1000)
    await adminClient.rpc('complete_backup_log', {
      p_id:               logId,
      p_file_name:        fileName,
      p_file_size_bytes:  fileSizeBytes,
      p_storage_path:     storagePath,
      p_metadata:         metadata,
    })

    // 9. Cleanup old backup files ตาม retention policy
    try {
      const { data: scheduleConfig } = await adminClient
        .from('backup_schedule_config')
        .select('retention_days')
        .limit(1)
        .single()

      const retentionDays = scheduleConfig?.retention_days ?? 30
      await adminClient.rpc('cleanup_old_backup_logs', { p_retention_days: retentionDays })

      // ลบไฟล์เก่าจาก Storage
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
      const { data: oldFiles } = await adminClient
        .storage
        .from('backups')
        .list('database', { limit: 1000 })

      // ลบ files ที่อยู่ในโฟลเดอร์วันที่เก่ากว่า cutoff
      if (oldFiles) {
        const pathsToDelete = oldFiles
          .filter(f => {
            const folderDate = new Date(f.name)
            return !isNaN(folderDate.getTime()) && folderDate < cutoffDate
          })
          .map(f => `database/${f.name}`)

        if (pathsToDelete.length > 0) {
          await adminClient.storage.from('backups').remove(pathsToDelete)
        }
      }
    } catch (cleanupErr) {
      // ไม่ throw เพราะ backup หลักสำเร็จแล้ว
      console.warn('[BACKUP] Cleanup warning:', cleanupErr)
    }

    return {
      success: true,
      logId: logId ?? undefined,
      fileName,
      fileSizeBytes,
      durationSeconds,
    }

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('[BACKUP] Error:', errorMessage)

    // อัปเดต log → failed (ถ้ามี logId)
    if (logId) {
      try {
        await adminClient.rpc('fail_backup_log', {
          p_id: logId,
          p_error_message: errorMessage.slice(0, 500),
        })
      } catch (logErr) {
        console.error('[BACKUP] Failed to update failure log:', logErr)
      }
    }

    return { success: false, error: errorMessage }
  }
}

// ─── Helper: ตรวจสอบสิทธิ์ Admin จาก Request ─────────────────────────────────

import { createClient } from '@/lib/supabase/server'

export async function verifyAdminRequest(): Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'ไม่ได้เข้าสู่ระบบ' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์ Admin' }, { status: 403 })
  }

  return { userId: user.id }
}
