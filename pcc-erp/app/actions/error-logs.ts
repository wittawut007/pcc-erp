'use server'

import { createClient } from '@/lib/supabase/server'
import { logError } from '@/lib/logger'

export interface ErrorLog {
  id: string
  created_at: string
  action: string
  error_msg: string
  error_code: string | null
  user_id: string | null
  context: Record<string, unknown> | null
}

/**
 * ดึง error_logs ล่าสุด 200 รายการ
 * เฉพาะ Admin เท่านั้น (ป้องกันด้วย RLS + role check)
 */
export async function getErrorLogs(): Promise<{ logs: ErrorLog[]; error?: string }> {
  try {
    const supabase = await createClient()

    // ตรวจสอบสิทธิ์ Admin ก่อน
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { logs: [], error: 'Unauthorized' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') return { logs: [], error: 'Forbidden' }

    const { data, error } = await supabase
      .from('error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw error

    return { logs: (data ?? []) as ErrorLog[] }
  } catch (err) {
    await logError({ action: 'getErrorLogs', error: err })
    return { logs: [], error: 'ไม่สามารถโหลดข้อมูล Error Logs ได้' }
  }
}
