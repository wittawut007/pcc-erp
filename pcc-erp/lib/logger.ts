'use server'

/**
 * lib/logger.ts
 *
 * Central Error Logger — บันทึก Server Action errors ลง Supabase error_logs table
 * เพื่อเก็บ Error ถาวรแทนการพึ่ง Vercel Log ที่หายหลัง 1 ชั่วโมง (Free tier)
 *
 * การใช้งาน:
 *   import { logError } from '@/lib/logger'
 *
 *   } catch (err) {
 *     await logError({ action: 'submitConcreteOrder', error: err, context: { orderId } })
 *     return { success: false, error: 'เกิดข้อผิดพลาด' }
 *   }
 */

import { createClient } from '@/lib/supabase/server'

interface LogErrorOptions {
  /** ชื่อ Server Action function ที่เกิด error เช่น 'submitConcreteOrder' */
  action: string
  /** error object จาก catch block */
  error: unknown
  /** ข้อมูลเพิ่มเติมช่วย reproduce bug เช่น { planId, orderId } */
  context?: Record<string, unknown>
}

export async function logError({ action, error, context }: LogErrorOptions): Promise<void> {
  // 1. Always log to console (ยังเก็บใน Vercel Log 1 ชั่วโมง)
  console.error(`[ERROR][${action}]`, error, context ?? '')

  // 2. บันทึกลง Supabase error_logs table (เก็บถาวร)
  try {
    const supabase = await createClient()

    // ดึง user ปัจจุบัน (ถ้ามี)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const errMsg =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : JSON.stringify(error)

    // Supabase/PostgreSQL error code (เช่น '23503' = FK violation)
    const errCode =
      (error as Record<string, unknown>)?.code != null
        ? String((error as Record<string, unknown>).code)
        : null

    await supabase.from('error_logs').insert({
      action,
      error_msg: errMsg.slice(0, 2000), // จำกัดความยาวเพื่อป้องกัน oversized rows
      error_code: errCode,
      user_id: user?.id ?? null,
      context: context ?? null,
    })
  } catch (loggerErr) {
    // ถ้า logger เองล้มเหลว ให้ log ไปที่ console เท่านั้น
    // ห้าม throw เพื่อไม่ให้ทำลาย error handling เดิม
    console.error('[LOGGER_FAILED]', loggerErr)
  }
}
