'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResetResult {
  success: boolean
  error?: string
  summary?: Record<string, string | number>
}

export interface SystemStats {
  totalUsers: number
  activeUsers: number
  totalProducts: number
  activeProducts: number
  totalRawMaterials: number
  lowStockMaterials: number
  totalPlans: number
  activePlans: number
  totalJobOrders: number
  pendingJobOrders: number
  totalQcInspections: number
  totalActivityLogs: number
}

// ─── Helper: get authenticated admin client ────────────────────────────────────

async function getAdminClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('ไม่ได้เข้าสู่ระบบ')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('ไม่มีสิทธิ์ Admin')

  return { supabase, userId: user.id }
}

// ─── System Stats ─────────────────────────────────────────────────────────────

export async function getSystemStatsAction(): Promise<{ data?: SystemStats; error?: string }> {
  try {
    const { supabase } = await getAdminClient()

    const [
      { count: totalUsers },
      { count: activeUsers },
      { count: totalProducts },
      { count: activeProducts },
      { count: totalRawMaterials },
      { data: rawMaterials },
      { count: totalPlans },
      { data: activePlansData },
      { count: totalJobOrders },
      { data: pendingJobsData },
      { count: totalQcInspections },
      { count: totalActivityLogs },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('products').select('*', { count: 'exact', head: true }),
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('raw_materials').select('*', { count: 'exact', head: true }),
      supabase.from('raw_materials').select('qty_on_hand, min_stock'),
      supabase.from('production_plans').select('*', { count: 'exact', head: true }),
      supabase.from('production_plans').select('id').in('status', ['draft', 'confirmed']),
      supabase.from('job_orders').select('*', { count: 'exact', head: true }),
      supabase.from('job_orders').select('id').in('status', ['pending', 'casting', 'curing', 'rebar_prep', 'concrete_ordered', 'ready_demold']),
      supabase.from('qc_inspections').select('*', { count: 'exact', head: true }),
      supabase.from('activity_logs').select('*', { count: 'exact', head: true }),
    ])

    const lowStockMaterials = (rawMaterials ?? []).filter(
      (m: { qty_on_hand: number; min_stock: number }) => m.qty_on_hand <= m.min_stock
    ).length

    return {
      data: {
        totalUsers: totalUsers ?? 0,
        activeUsers: activeUsers ?? 0,
        totalProducts: totalProducts ?? 0,
        activeProducts: activeProducts ?? 0,
        totalRawMaterials: totalRawMaterials ?? 0,
        lowStockMaterials,
        totalPlans: totalPlans ?? 0,
        activePlans: activePlansData?.length ?? 0,
        totalJobOrders: totalJobOrders ?? 0,
        pendingJobOrders: pendingJobsData?.length ?? 0,
        totalQcInspections: totalQcInspections ?? 0,
        totalActivityLogs: totalActivityLogs ?? 0,
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'
    return { error: message }
  }
}

// ─── Log a reset event before performing it ───────────────────────────────────

async function logResetEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  resetType: string,
  detail: string
) {
  await supabase.from('activity_logs').insert({
    action_type: 'SYSTEM_RESET',
    entity_type: 'system',
    entity_id: null,
    user_id: userId,
    detail: `[${resetType}] ${detail}`,
  })
}

// ─── RESET LEVEL 1: Partial Resets ────────────────────────────────────────────

export async function resetPlansAction(): Promise<ResetResult> {
  try {
    const { supabase, userId } = await getAdminClient()
    await logResetEvent(supabase, userId, 'PARTIAL', 'รีเซ็ตแผนการผลิต + ใบสั่งผลิต + แผนวัตถุดิบ')

    const { count: planCount } = await supabase.from('production_plans').select('*', { count: 'exact', head: true })
    const { count: orderCount } = await supabase.from('production_orders').select('*', { count: 'exact', head: true })
    const { count: materialCount } = await supabase.from('plan_materials').select('*', { count: 'exact', head: true })

    // Delete in correct FK order
    await supabase.from('plan_materials').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('production_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('production_plan_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('production_plans').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    revalidatePath('/settings')
    revalidatePath('/planner')
    revalidatePath('/production-order')

    return {
      success: true,
      summary: {
        'แผนการผลิต': planCount ?? 0,
        'ใบสั่งผลิต': orderCount ?? 0,
        'แผนวัตถุดิบ': materialCount ?? 0,
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'
    return { success: false, error: message }
  }
}

export async function resetJobOrdersAction(): Promise<ResetResult> {
  try {
    const { supabase, userId } = await getAdminClient()
    await logResetEvent(supabase, userId, 'PARTIAL', 'รีเซ็ต Job Orders + คอนกรีต + การถอดแบบ')

    const { count: jobCount } = await supabase.from('job_orders').select('*', { count: 'exact', head: true })
    const { count: concreteCount } = await supabase.from('concrete_orders').select('*', { count: 'exact', head: true })
    const { count: demoldCount } = await supabase.from('demolding_records').select('*', { count: 'exact', head: true })

    await supabase.from('concrete_rounds').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('concrete_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('demolding_records').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('job_order_defects').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('qc_inspections').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('fg_receipts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('job_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    // Reset plan item statuses back to pending
    await supabase.from('production_plan_items').update({ status: 'pending' }).neq('id', '00000000-0000-0000-0000-000000000000')

    revalidatePath('/settings')
    revalidatePath('/job-orders')

    return {
      success: true,
      summary: {
        'Job Orders': jobCount ?? 0,
        'คำสั่งผสมคอนกรีต': concreteCount ?? 0,
        'บันทึกการถอดแบบ': demoldCount ?? 0,
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'
    return { success: false, error: message }
  }
}

export async function resetQcAction(): Promise<ResetResult> {
  try {
    const { supabase, userId } = await getAdminClient()
    await logResetEvent(supabase, userId, 'PARTIAL', 'รีเซ็ตข้อมูล QC Inspections')

    const { count: qcCount } = await supabase.from('qc_inspections').select('*', { count: 'exact', head: true })
    const { count: defectCount } = await supabase.from('job_order_defects').select('*', { count: 'exact', head: true })

    await supabase.from('job_order_defects').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('qc_inspections').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    revalidatePath('/settings')
    revalidatePath('/qc')

    return {
      success: true,
      summary: {
        'QC Inspections': qcCount ?? 0,
        'บันทึก Defect': defectCount ?? 0,
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'
    return { success: false, error: message }
  }
}

export async function resetInventoryAction(): Promise<ResetResult> {
  try {
    const { supabase, userId } = await getAdminClient()
    await logResetEvent(supabase, userId, 'PARTIAL', 'รีเซ็ต Inventory FG + WIP เป็น 0')

    const { count: fgCount } = await supabase.from('fg_inventory').select('*', { count: 'exact', head: true })
    const { count: wipCount } = await supabase.from('wip_inventory').select('*', { count: 'exact', head: true })

    await supabase.from('fg_inventory').update({ qty: 0 }).neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('wip_inventory').update({ qty: 0 }).neq('id', '00000000-0000-0000-0000-000000000000')

    revalidatePath('/settings')
    revalidatePath('/inventory')

    return {
      success: true,
      summary: {
        'FG Inventory (reset qty→0)': fgCount ?? 0,
        'WIP Inventory (reset qty→0)': wipCount ?? 0,
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'
    return { success: false, error: message }
  }
}

export async function clearActivityLogsAction(): Promise<ResetResult> {
  try {
    const { supabase, userId } = await getAdminClient()
    const { count: logCount } = await supabase.from('activity_logs').select('*', { count: 'exact', head: true })
    // Log before clearing
    await logResetEvent(supabase, userId, 'PARTIAL', `ล้าง Activity Logs (${logCount} records)`)
    await supabase.from('activity_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    revalidatePath('/settings')
    revalidatePath('/logs')

    return {
      success: true,
      summary: { 'Activity Logs': logCount ?? 0 }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'
    return { success: false, error: message }
  }
}

// ─── RESET LEVEL 2: Full Production Reset ────────────────────────────────────

export async function resetAllProductionAction(): Promise<ResetResult> {
  try {
    const { supabase, userId } = await getAdminClient()
    await logResetEvent(supabase, userId, 'FULL_PRODUCTION', 'รีเซ็ตข้อมูลการผลิตทั้งหมด (คงไว้: Products, Raw Materials, Users)')

    const counts = await Promise.all([
      supabase.from('job_orders').select('*', { count: 'exact', head: true }),
      supabase.from('production_plans').select('*', { count: 'exact', head: true }),
      supabase.from('production_orders').select('*', { count: 'exact', head: true }),
      supabase.from('qc_inspections').select('*', { count: 'exact', head: true }),
      supabase.from('demolding_records').select('*', { count: 'exact', head: true }),
    ])

    // Delete in FK-safe order
    await supabase.from('concrete_rounds').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('concrete_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('demolding_records').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('job_order_defects').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('qc_inspections').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('fg_receipts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('job_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('plan_materials').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('production_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('production_plan_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('production_plans').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    // Reset inventory to 0
    await supabase.from('fg_inventory').update({ qty: 0 }).neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('wip_inventory').update({ qty: 0 }).neq('id', '00000000-0000-0000-0000-000000000000')

    revalidatePath('/settings')
    revalidatePath('/dashboard')
    revalidatePath('/planner')
    revalidatePath('/job-orders')
    revalidatePath('/inventory')

    return {
      success: true,
      summary: {
        'Job Orders': counts[0].count ?? 0,
        'แผนการผลิต': counts[1].count ?? 0,
        'ใบสั่งผลิต': counts[2].count ?? 0,
        'QC Inspections': counts[3].count ?? 0,
        'บันทึกถอดแบบ': counts[4].count ?? 0,
        'Inventory': 'Reset qty → 0',
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'
    return { success: false, error: message }
  }
}

// ─── RESET LEVEL 3: Nuclear Reset ────────────────────────────────────────────

export async function nuclearResetAction(): Promise<ResetResult> {
  try {
    const { supabase, userId } = await getAdminClient()
    await logResetEvent(supabase, userId, 'NUCLEAR', '⚠️ Nuclear Reset — ล้างข้อมูลทั้งหมดยกเว้น Profiles')

    const counts = await Promise.all([
      supabase.from('job_orders').select('*', { count: 'exact', head: true }),
      supabase.from('production_plans').select('*', { count: 'exact', head: true }),
      supabase.from('activity_logs').select('*', { count: 'exact', head: true }),
    ])

    // Delete all transaction data
    await supabase.from('concrete_rounds').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('concrete_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('demolding_records').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('job_order_defects').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('qc_inspections').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('fg_receipts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('job_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('plan_materials').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('production_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('production_plan_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('production_plans').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('activity_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    // Reset inventory
    await supabase.from('fg_inventory').update({ qty: 0 }).neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('wip_inventory').update({ qty: 0 }).neq('id', '00000000-0000-0000-0000-000000000000')
    // Reset raw material stock to 0
    await supabase.from('raw_materials').update({ qty_on_hand: 0 }).neq('id', '00000000-0000-0000-0000-000000000000')

    revalidatePath('/', 'layout')

    return {
      success: true,
      summary: {
        'Job Orders': counts[0].count ?? 0,
        'แผนการผลิต': counts[1].count ?? 0,
        'Activity Logs': counts[2].count ?? 0,
        'Raw Materials qty': 'Reset → 0',
        'Inventory qty': 'Reset → 0',
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'
    return { success: false, error: message }
  }
}

// ─── Supabase Usage Types ───────────────────────────────────────────────────

export interface TableStat {
  table_name: string
  row_count: number
  total_size: number
  table_size: number
  index_size: number
}

export interface BucketStat {
  id: string
  name: string
  file_count: number
  total_size: number
}

export interface StorageStat {
  total_size: number
  total_files: number
  buckets: BucketStat[]
}

export interface AuthStat {
  total_users: number
  created_last_30_days: number
}

export interface ConnectionStat {
  active: number
  max: number
}

export interface DatabaseStats {
  db_size: number
  postgres_version: string
  connections: ConnectionStat
  auth: AuthStat
  storage: StorageStat
  tables: TableStat[]
}

export interface ApiTimeSeriesPoint {
  timestamp: string
  total_auth_requests: number
  total_realtime_requests: number
  total_rest_requests: number
  total_storage_requests: number
}

export interface ApiUsageStats {
  total_requests: number
  time_series: ApiTimeSeriesPoint[]
}

export interface SupabaseUsageSummary {
  project_ref: string
  project_name: string
  region: string
  status: string
  db: DatabaseStats | null
  api: ApiUsageStats | null
}

// ─── Supabase Usage Server Action ────────────────────────────────────────────

export async function getSupabaseUsageAction(): Promise<{ data?: SupabaseUsageSummary; error?: string }> {
  try {
    // Verify admin authorization
    await getAdminClient()

    // Fetch Postgres stats via RPC using service role
    const adminSupabase = createAdminClient()
    const { data: dbStats, error: dbError } = await adminSupabase.rpc('get_db_stats')
    if (dbError) {
      console.error('Error calling get_db_stats RPC:', dbError)
      throw new Error(`ล้มเหลวในการดึงข้อมูลจากฐานข้อมูล: ${dbError.message}`)
    }

    // Fetch API request stats from Supabase Management API
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]
      : 'ywogqmduwvjwzpgwfhhl'

    const token = process.env.SUPABASE_ACCESS_TOKEN
    let apiStats: ApiUsageStats | null = null

    if (token) {
      try {
        // Total requests count
        const countRes = await fetch(
          `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/usage.api-requests-count`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            next: { revalidate: 300 } // cache for 5 minutes
          }
        )
        const countData = await countRes.json()
        const total_requests = countData?.result?.[0]?.count ?? 0

        // Hourly timeseries api counts
        const timeseriesRes = await fetch(
          `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/usage.api-counts?interval=1day`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            next: { revalidate: 300 }
          }
        )
        const timeseriesData = await timeseriesRes.json()
        const time_series = timeseriesData?.result ?? []

        apiStats = {
          total_requests,
          time_series,
        }
      } catch (apiErr) {
        console.error('Error fetching Supabase Management API usage metrics:', apiErr)
      }
    }

    return {
      data: {
        project_ref: projectRef,
        project_name: 'PCC POSTENTION ERP',
        region: 'ap-northeast-1',
        status: 'ACTIVE_HEALTHY',
        db: dbStats as DatabaseStats,
        api: apiStats,
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการดึงข้อมูล Supabase'
    return { error: message }
  }
}
