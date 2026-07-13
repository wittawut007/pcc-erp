'use server'

/**
 * lib/supabase/queries/logs.ts
 *
 * Reusable query helpers สำหรับ activity_logs
 * แยกออกมาเพื่อ:
 *  - รองรับ Pagination (ลดภาระ Serverless Function)
 *  - ง่ายต่อการเพิ่ม Server-side filter ในอนาคต
 *  - ป้องกัน Function Timeout ด้วย timeout guard
 */

import { createClient } from '@/lib/supabase/server'

export interface FetchActivityLogsOptions {
  /** หน้าที่ต้องการ (เริ่มที่ 0) */
  page?: number
  /** จำนวน records ต่อหน้า — ค่าเริ่มต้น 100, สูงสุด 200 */
  pageSize?: number
  /** กรองตาม action_type */
  actionType?: string
  /** กรองตามวันที่เริ่มต้น (YYYY-MM-DD) */
  fromDate?: string
  /** กรองตามวันที่สิ้นสุด (YYYY-MM-DD) */
  toDate?: string
}

export interface ActivityLogsResult {
  logs: ActivityLogRow[]
  totalCount: number
  hasMore: boolean
  timedOut: boolean
}

export interface ActivityLogRow {
  id: string
  user_id: string | null
  action_type: string
  entity_type: string
  entity_id: string | null
  detail: string | null
  created_at: string
  profile: { full_name: string; role: string; employee_code: string | null } | null
}

/** ระยะเวลา timeout สำหรับ Query (ms) — ตั้งต่ำกว่า Vercel 10s เพื่อ fallback ได้ */
const QUERY_TIMEOUT_MS = 8000

export async function fetchActivityLogs(
  options: FetchActivityLogsOptions = {}
): Promise<ActivityLogsResult> {
  const { page = 0, pageSize = 100, actionType, fromDate, toDate } = options
  const safePagSize = Math.min(pageSize, 200)
  const from = page * safePagSize
  const to = from + safePagSize - 1

  const fetchFn = async (): Promise<ActivityLogsResult> => {
    const supabase = await createClient()

    let query = supabase
      .from('activity_logs')
      .select('*, profile:profiles(full_name, role, employee_code)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (actionType && actionType !== 'ทั้งหมด') {
      query = query.eq('action_type', actionType)
    }

    if (fromDate) {
      query = query.gte('created_at', `${fromDate}T00:00:00.000Z`)
    }

    if (toDate) {
      query = query.lte('created_at', `${toDate}T23:59:59.999Z`)
    }

    const { data, error, count } = await query

    if (error) throw new Error(error.message)

    const totalCount = count ?? 0
    return {
      logs: (data ?? []) as ActivityLogRow[],
      totalCount,
      hasMore: to < totalCount - 1,
      timedOut: false,
    }
  }

  // Timeout guard — ถ้า Query ช้าเกิน 8 วินาที ให้ return ค่าว่างแทน 504 Timeout
  const timeoutPromise = new Promise<ActivityLogsResult>((resolve) =>
    setTimeout(
      () =>
        resolve({
          logs: [],
          totalCount: 0,
          hasMore: false,
          timedOut: true,
        }),
      QUERY_TIMEOUT_MS
    )
  )

  return Promise.race([fetchFn(), timeoutPromise])
}
