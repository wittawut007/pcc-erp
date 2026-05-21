export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import DashboardCharts from './DashboardCharts'
import Link from 'next/link'
import DashboardRefresh from './DashboardRefresh'

async function getSupabaseData() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || supabaseUrl === 'your_supabase_project_url' || !supabaseKey) {
    return { todayPlan: null, jobOrders: null, recentLogs: null, lowStock: null }
  }
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const sixDaysAgo = new Date()
    sixDaysAgo.setDate(now.getDate() - 5)
    const startDateStr = sixDaysAgo.toISOString().split('T')[0]
    
    const [{ data: todayPlan }, { data: jobOrders }, { data: recentLogs }, { data: lowStock }, { data: fgStock }, { data: wipStock }, { data: qcData }, { data: demoldingRecs }, { data: concreteOrders }, { data: concreteRounds }] = await Promise.all([
      supabase.from('production_plans').select('*,items:production_plan_items(*,product:products(*))').eq('plan_date', today).single(),
      supabase.from('job_orders').select(`
        *,
        plan_item:production_plan_items!inner(
          product:products(name,category,code),
          plan:production_plans!inner(plan_date)
        ),
        production_order:production_orders(id, status),
        qc:qc_inspections(pour_ok, demold_qty_good, demold_qty_defect, defect_reason)
      `)
      .gte('plan_item.plan.plan_date', startDateStr)
      .order('created_at', { ascending: false }),
      supabase.from('activity_logs').select('*,profile:profiles(full_name,role)').order('created_at', { ascending: false }).limit(10),
      supabase.from('raw_materials').select('*'),
      supabase.from('fg_inventory').select('qty'),
      supabase.from('wip_inventory').select('qty'),
      supabase.from('qc_inspections').select('demold_qty_defect, defect_reason, created_at').gte('created_at', startDateStr),
      supabase.from('demolding_records').select('job_order_id, qty_good, qty_defect, defect_reason, created_at, worker:profiles!demolding_records_worker_id_fkey(full_name)').gte('created_at', startDateStr),
      supabase.from('concrete_orders').select('id, job_order_id, bed, qty_requested, total_qty_requested, status, requested_at, created_at, round_count').gte('created_at', today),
      supabase.from('concrete_rounds').select('concrete_order_id, round_number, qty_per_round, status, supplied_at').gte('created_at', today)
    ])
    return { todayPlan, jobOrders, recentLogs, lowStock, fgStock, wipStock, qcData, demoldingRecs, concreteOrders, concreteRounds, today }
  } catch (err) {
    console.error('Dashboard Fetch Error:', err)
    return { todayPlan: null, jobOrders: null, recentLogs: null, lowStock: null, fgStock: null, wipStock: null, qcData: null, demoldingRecs: null, concreteOrders: null, concreteRounds: null, today: '' }
  }
}

export default async function DashboardPage() {
  const { todayPlan, jobOrders, recentLogs, lowStock, fgStock, wipStock, qcData, demoldingRecs, concreteOrders, concreteRounds, today } = await getSupabaseData()

  const todaysJobOrders = (jobOrders as any[])?.filter((j: any) => j.plan_item?.plan?.plan_date === today) || []

  const totalTarget = (todayPlan as any)?.total_qty ?? 0
  const qtyCast = todaysJobOrders.filter((j: any) => ['casting', 'curing', 'ready_demold', 'demolded'].includes(j.status)).reduce((s: number, j: any) => s + (j.qty_cast ?? 0), 0)
  const qtyCuring = todaysJobOrders.filter((j: any) => ['curing', 'ready_demold'].includes(j.status)).reduce((s: number, j: any) => s + (j.qty_cast ?? 0), 0)
  const qtyDemolded = todaysJobOrders.filter((j: any) => j.status === 'demolded').reduce((s: number, j: any) => s + (j.qc?.[0]?.demold_qty_good ?? j.qty_cast ?? 0), 0)

  // Calculate defect rate from qc_inspections
  const totalQcFail = todaysJobOrders.reduce((s: number, j: any) => s + (j.qc?.[0]?.demold_qty_defect ?? 0), 0)
  const totalQcCast = qtyCast
  const defectRate = totalQcCast > 0 ? ((totalQcFail / totalQcCast) * 100).toFixed(1) + '%' : '0%'

  // Completion Rate = ชิ้นที่ถอดแบบแล้ว / เป้าหมายวันนี้
  const completionRate = totalTarget > 0 ? Math.min(100, Math.round((qtyDemolded / totalTarget) * 100)) : 0
  const completionColor = completionRate >= 80 ? 'var(--green)' : completionRate >= 50 ? 'var(--amber)' : 'var(--red)'
  const completionBg = completionRate >= 80 ? 'var(--green-light)' : completionRate >= 50 ? 'var(--amber-light)' : 'var(--red-light)'

  const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  const now = new Date()
  const dateDisplay = `${now.getDate()} ${thMonths[now.getMonth()]} ${now.getFullYear() + 543}`

  const kpiCards = [
    { label: 'เป้าหมายวันนี้ (ชิ้น)', value: totalTarget, badge: 'Target', icon: 'fa-bullseye', bg: 'var(--accent-light)', color: 'var(--accent)' },
    { label: 'เทคอนกรีต', value: qtyCast, badge: 'Casting', icon: 'fa-truck-monster', bg: 'var(--indigo-light)', color: 'var(--indigo)' },
    { label: 'กำลังบ่ม / พร้อมถอดแบบ', value: qtyCuring, badge: 'Curing', icon: 'fa-clock', bg: 'var(--amber-light)', color: 'var(--amber)' },
    { label: 'ถอดแบบแล้ว (FG)', value: qtyDemolded, badge: 'Demolded', icon: 'fa-cubes', bg: 'var(--green-light)', color: 'var(--green)' },
    { label: 'อัตราของเสียวันนี้', value: defectRate, badge: 'Defect', icon: 'fa-exclamation-circle', bg: 'var(--red-light)', color: 'var(--red)', isRed: true },
    { label: 'ความสำเร็จวันนี้ (%)', value: `${completionRate}%`, badge: 'Complete', icon: 'fa-chart-line', bg: completionBg, color: completionColor },
  ]

  type DisplayStatus = 'pending' | 'concrete_ordered' | 'casting' | 'curing' | 'ready_demold' | 'demolded' | 'qc_passed' | 'cancelled'

  // Build a Set of beds that have received all concrete today
  // (All rounds status = 'received' → รับคอนกรีตครบแล้ว = เทคอนกรีตเรียบร้อย)
  const receivedBeds = new Set<string>()
  if (Array.isArray(concreteOrders) && Array.isArray(concreteRounds)) {
    concreteOrders.forEach((co: any) => {
      const rounds = concreteRounds.filter((r: any) => r.concrete_order_id === co.id)
      const roundCount = co.round_count ?? 0
      const allReceived = rounds.length > 0 && rounds.length === roundCount && rounds.every((r: any) => r.status === 'received')
      if (allReceived && co.bed) {
        receivedBeds.add(String(co.bed))
      }
    })
  }

  function getDisplayStatus(job: any): DisplayStatus {
    if (job.status === 'pending') return 'pending'
    if (job.status === 'cancelled') return 'cancelled'
    if (job.status === 'qc_passed') return 'qc_passed'
    if (job.status === 'demolded') return 'demolded'
    if (job.status === 'ready_demold') return 'ready_demold'
    if (job.status === 'curing') {
      const expectedTime = job.expected_demold_at || (job.cast_at ? new Date(new Date(job.cast_at).getTime() + 20 * 60 * 60 * 1000).toISOString() : null)
      if (expectedTime && new Date(expectedTime) <= new Date()) {
        return 'ready_demold'
      }
      return 'curing'
    }

    // concrete_ordered → ถ้าคอนกรีตที่สั่งในโรงนี้ (bed) รับครบเรียบร้อยแล้ว -> แสดงเป็น "เทคอนกรีต"
    if (job.status === 'concrete_ordered' && receivedBeds.has(String(job.bed))) {
      return 'casting'
    }

    // Fallback: ตรวจ QC pour_ok เพื่อรองรับการเปลี่ยนไป casting ในสถานการณ์อื่น
    const qc = Array.isArray(job.qc) ? job.qc[0] : null
    if (qc?.pour_ok === true) return 'casting'
    return 'concrete_ordered'
  }
  
  function getProgressPct(displayStatus: DisplayStatus): number {
    const map: Record<DisplayStatus, number> = {
      pending: 0,
      concrete_ordered: 25,
      casting: 50,
      curing: 75,
      ready_demold: 90,
      demolded: 100,
      qc_passed: 100,
      cancelled: 0,
    }
    return map[displayStatus] ?? 0
  }
  
  const statusBadgeMap: Record<DisplayStatus, { label: string; bg: string; color: string }> = {
    pending: { label: 'รอเริ่ม', bg: 'var(--amber-light)', color: '#B45309' },
    concrete_ordered: { label: 'สั่งคอนกรีต', bg: 'var(--indigo-light)', color: 'var(--indigo)' },
    casting: { label: 'เทคอนกรีต', bg: 'var(--accent-light)', color: 'var(--accent)' },
    curing: { label: 'กำลังบ่ม', bg: 'var(--green-light)', color: '#059669' },
    ready_demold: { label: 'พร้อมถอดแบบ', bg: 'var(--green-light)', color: '#059669' },
    demolded: { label: 'ถอดแบบแล้ว', bg: '#F3F4F6', color: '#6B7280' },
    qc_passed: { label: 'QC ตรวจสอบแล้ว', bg: 'var(--accent-light)', color: 'var(--accent)' },
    cancelled: { label: 'ยกเลิก', bg: 'var(--red-light)', color: 'var(--red)' },
  }

  const mockJobs = [
    { id: '1', name: 'แผ่นพื้น PL50 4@4', bed: '2', qty_cast: 120, qty_target: 150, status: 'casting' },
    { id: '2', name: 'เสาเข็ม .15x.15 2.00 ม.', bed: '1', qty_cast: 50, qty_target: 50, status: 'curing' },
    { id: '3', name: 'กำแพงกันดิน Type 1', bed: '3', qty_cast: 0, qty_target: 25, status: 'pending' },
    { id: '4', name: 'ผนังรั้วสำเร็จรูป 0.50x2.90 ม.', bed: '4', qty_cast: 18, qty_target: 40, status: 'casting' },
  ]

  const mockLowStock = [
    { id: '1', name: 'เหล็กเส้น DB12 (10m)', qty_on_hand: 45, min_stock: 100, unit: 'เส้น' },
    { id: '2', name: 'น้ำยาทาแบบ', qty_on_hand: 2, min_stock: 5, unit: 'ถัง' },
    { id: '3', name: 'เมชกำแพงกันดิน A', qty_on_hand: 5, min_stock: 15, unit: 'แผง' },
  ]

  const mockLogs = [
    { time: '11:25', name: 'สมชาย ใจดี', dept: 'โรงผลิต 1', action: 'เทคอนกรีตเสร็จสิ้น', detail: 'เสาเข็ม .15x.15 2.00 ม.', status: 'สำเร็จ', green: true },
    { time: '11:10', name: 'วิชัย รักดี', dept: 'คลังเตรียมเหล็ก', action: 'บันทึกยอด WIP', detail: 'โครงเสาเข็ม (+50 ชุด)', status: 'สำเร็จ', green: true },
    { time: '10:45', name: 'สมหญิง คลังเป๊ะ', dept: 'คลังวัตถุดิบ', action: 'เบิกวัตถุดิบ', detail: 'เหล็ก DB12 (40 เส้น)', status: 'สำเร็จ', green: true },
    { time: '09:30', name: 'มานะ ถอดเก่ง', dept: 'โรงผลิต 2', action: 'ถอดแบบ / จบงาน', detail: 'แผ่นพื้น 2 แผ่น — บิ่น', status: 'ของเสีย', green: false },
    { time: '08:15', name: 'สมชาย ใจดี', dept: 'โรงผลิต 1', action: 'เริ่มงาน (สแกน QR)', detail: 'Job: #JO-2610-042', status: 'เริ่มระบบ', green: true },
  ]

  // Pre-compute which production_order IDs have ALL jobs finished (demolded or qc_passed)
  // This mirrors the FG Inventory logic: if every job in a PO is done → PO = "QC ตรวจสอบแล้ว"
  const poJobGroupMap = new Map<string, any[]>()
  ;(jobOrders as any[])?.forEach((job: any) => {
    const poId = job.production_order?.id
    if (!poId) return
    if (!poJobGroupMap.has(poId)) poJobGroupMap.set(poId, [])
    poJobGroupMap.get(poId)!.push(job)
  })
  const fullyDonePoIds = new Set<string>()
  poJobGroupMap.forEach((jobs, poId) => {
    if (
      jobs.length > 0 &&
      jobs.every((j: any) => j.status === 'demolded' || j.status === 'qc_passed')
    ) {
      fullyDonePoIds.add(poId)
    }
  })

  const activeJobs = (jobOrders as any[])?.filter((j: any) => {
    if (j.production_order?.status === 'erp_synced') return false
    const s = getDisplayStatus(j)
    return !['demolded', 'qc_passed', 'cancelled'].includes(s)
  }) || []

  const demoldingJobs = (jobOrders as any[])?.filter((j: any) => {
    if (j.production_order?.status === 'erp_synced') return false
    const s = getDisplayStatus(j)
    return ['ready_demold', 'curing'].includes(s)
  }).sort((a, b) => {
    const expectedA = a.expected_demold_at || (a.cast_at ? new Date(new Date(a.cast_at).getTime() + 20 * 60 * 60 * 1000).toISOString() : '')
    const expectedB = b.expected_demold_at || (b.cast_at ? new Date(new Date(b.cast_at).getTime() + 20 * 60 * 60 * 1000).toISOString() : '')
    if (!expectedA) return 1
    if (!expectedB) return -1
    return new Date(expectedA).getTime() - new Date(expectedB).getTime()
  }) || []

  // Pipeline: count job orders by stage
  // Jobs that belong to a fully-done PO (all jobs demolded/qc_passed) are promoted to qc_passed
  const pipelineCounts: Record<DisplayStatus, number> = { pending: 0, concrete_ordered: 0, casting: 0, curing: 0, ready_demold: 0, demolded: 0, qc_passed: 0, cancelled: 0 }
  const pipelineQty: Record<DisplayStatus, number> = { pending: 0, concrete_ordered: 0, casting: 0, curing: 0, ready_demold: 0, demolded: 0, qc_passed: 0, cancelled: 0 }
  ;(jobOrders as any[])?.forEach((job: any) => {
    if (job.production_order?.status === 'erp_synced') return
    let s = getDisplayStatus(job)
    // If this job is 'demolded' but its entire PO is fully done → show as qc_passed
    const poId = job.production_order?.id
    if (s === 'demolded' && poId && fullyDonePoIds.has(poId)) {
      s = 'qc_passed'
    }
    if (s && s !== 'cancelled') {
      pipelineCounts[s] = (pipelineCounts[s] || 0) + 1
      pipelineQty[s] = (pipelineQty[s] || 0) + (job.qty_cast || job.qty_target || 0)
    }
  })

  function fmtDate(isoStr: string) {
    if (!isoStr) return '—'
    const d = new Date(isoStr)
    return d.toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const allMaterials = (lowStock as any[]) || []
  const lowStockItems = allMaterials.filter(m => (m.qty_on_hand || 0) <= (m.min_stock || 0))

  // Build demolding_records lookup: job_order_id -> record
  const demoldMap = new Map<string, any>()
  ;(demoldingRecs as any[])?.forEach((r: any) => {
    if (!demoldMap.has(r.job_order_id)) demoldMap.set(r.job_order_id, r)
  })
  const displayLowStock = lowStockItems.slice(0, 4)
  const displayLogs = (recentLogs as any[])?.map(l => ({
    time: new Date(l.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
    name: l.profile?.full_name ?? '—',
    dept: l.profile?.role ?? '—',
    action: l.action_type,
    detail: l.detail,
    status: 'สำเร็จ',
    green: true
  })) || []

  // Inventory Real Data
  const totalFg = (fgStock as any[])?.reduce((s, i) => s + (i.qty || 0), 0) ?? 0
  const totalWip = (wipStock as any[])?.reduce((s, i) => s + (i.qty || 0), 0) ?? 0

  // Defect Analysis Real Data
  const defectStats = { crack: 0, chip: 0, honeycomb: 0, other: 0, total: 0 }
  ;(qcData as any[])?.forEach(qc => {
    if (qc.demold_qty_defect > 0) {
      const reason = (qc.defect_reason as string) || 'other'
      if (defectStats.hasOwnProperty(reason)) {
        (defectStats as any)[reason] += qc.demold_qty_defect
        defectStats.total += qc.demold_qty_defect
      }
    }
  })

  const getDefectPct = (val: number) => defectStats.total > 0 ? Math.round((val / defectStats.total) * 100) + '%' : '0%'
  const defectReasons = [
    { color: '#EF4444', label: 'แตก/ร้าว (Crack)', pct: getDefectPct(defectStats.crack), key: 'crack' },
    { color: '#F59E0B', label: 'บิ่น/หัก (Chip)', pct: getDefectPct(defectStats.chip), key: 'chip' },
    { color: '#3B82F6', label: 'Honeycomb', pct: getDefectPct(defectStats.honeycomb), key: 'honeycomb' },
    { color: '#8B5CF6', label: 'อื่นๆ (Other)', pct: getDefectPct(defectStats.other), key: 'other' },
  ]

  // Map Real Chart Data
  const categoriesMap = new Map()
  if (todayPlan?.items) {
    todayPlan.items.forEach((item: any) => {
      const catName = item.product?.category || 'ไม่ระบุ'
      if (!categoriesMap.has(catName)) categoriesMap.set(catName, { plan: 0, actual: 0 })
      categoriesMap.get(catName).plan += (item.qty_target || 0)
    })
  }
  todaysJobOrders.forEach((job: any) => {
    const catName = job.plan_item?.product?.category || 'ไม่ระบุ'
    if (!categoriesMap.has(catName)) categoriesMap.set(catName, { plan: 0, actual: 0 })
    
    // นับเฉพาะที่ถอดแบบแล้ว (Finished Goods)
    if (job.status === 'demolded') {
      const actualQty = job.qc?.[0]?.demold_qty_good ?? job.qty_cast ?? 0
      categoriesMap.get(catName).actual += actualQty
    }
  })

  // dailyChart fallback to undefined so component can render mock or empty
  const dailyChartData = {
    labels: Array.from(categoriesMap.keys()),
    planData: Array.from(categoriesMap.values()).map(v => v.plan),
    actualData: Array.from(categoriesMap.values()).map(v => v.actual)
  }

  const days: {dateStr: string, label: string}[] = []
  const daysShort = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
  for (let i = 5; i >= 0; i--) {
     const d = new Date()
     d.setDate(d.getDate() - i)
     days.push({
       dateStr: d.toISOString().split('T')[0],
       label: daysShort[d.getDay()]
     })
  }
  
  const catWeeklyMap = new Map()
  ;(jobOrders as any[])?.forEach(job => {
     const catName = job.plan_item?.product?.category || 'ไม่ระบุ'
     if (!catWeeklyMap.has(catName)) catWeeklyMap.set(catName, { dates: {} })
     const jobDate = job.plan_item?.plan?.plan_date
     
     // นับเฉพาะที่ถอดแบบแล้ว (Finished Goods)
     if (jobDate && job.status === 'demolded') {
       const actualQty = job.qc?.[0]?.demold_qty_good ?? job.qty_cast ?? 0
       catWeeklyMap.get(catName).dates[jobDate] = (catWeeklyMap.get(catName).dates[jobDate] || 0) + actualQty
     }
  })

  const weeklyChartData = {
    labels: days.map(d => d.label),
    datasets: [] as any[]
  }
  
  const colors = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6']
  let colorIdx = 0
  catWeeklyMap.forEach((val, catName) => {
     if (colorIdx > 5) return
     const c = colors[colorIdx++]
     weeklyChartData.datasets.push({
       label: catName,
       data: days.map(d => val.dates[d.dateStr] || 0),
       borderColor: c,
       backgroundColor: c,
       tension: 0.3, borderWidth: 2, pointRadius: 3
     })
  })

  // Bed Utilization Chart Data
  const bedStatusColorMap: Record<string, string> = {
    qc_passed: '#10B981', demolded: '#10B981',
    ready_demold: '#8B5CF6', curing: '#8B5CF6',
    casting: '#2563EB',
    concrete_ordered: '#F59E0B',
    pending: '#9CA3AF',
    cancelled: '#E5E7EB',
  }
  const bedMap = new Map<string, { cast: number; target: number; dominantStatus: string }>()
  ;(jobOrders as any[])?.forEach((job: any) => {
    if (job.production_order?.status === 'erp_synced') return
    const bedKey = `Bed ${job.bed}`
    if (!bedMap.has(bedKey)) bedMap.set(bedKey, { cast: 0, target: 0, dominantStatus: 'pending' })
    const entry = bedMap.get(bedKey)!
    entry.cast += job.qty_cast || 0
    entry.target += job.qty_target || 0
    // Use the most-advanced status seen for this bed as dominant color
    const statusOrder = ['qc_passed', 'demolded', 'ready_demold', 'curing', 'casting', 'concrete_ordered', 'pending', 'cancelled']
    let ds = getDisplayStatus(job)
    // Promote fully-done PO jobs to qc_passed for chart coloring
    const poId = job.production_order?.id
    if (ds === 'demolded' && poId && fullyDonePoIds.has(poId)) ds = 'qc_passed'
    if (ds && statusOrder.indexOf(ds) < statusOrder.indexOf(entry.dominantStatus)) {
      entry.dominantStatus = ds
    }
  })
  const bedLabels = Array.from(bedMap.keys()).sort()
  const bedChartData = {
    labels: bedLabels,
    castData: bedLabels.map(k => bedMap.get(k)!.cast),
    targetData: bedLabels.map(k => bedMap.get(k)!.target),
    statusColors: bedLabels.map(k => bedStatusColorMap[bedMap.get(k)!.dominantStatus] || '#9CA3AF'),
  }

  // Defect Trend Chart Data — 6 days × 4 reasons
  type DefectReason = 'crack' | 'chip' | 'honeycomb' | 'other'
  const defectReasonKeys: DefectReason[] = ['crack', 'chip', 'honeycomb', 'other']
  const defectReasonConfig: Record<DefectReason, { label: string; color: string; bg: string }> = {
    crack:     { label: 'แตก/ร้าว (Crack)',    color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
    chip:      { label: 'บิ่น/หัก (Chip)',     color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    honeycomb: { label: 'Honeycomb',              color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
    other:     { label: 'อื่นๆ (Other)',            color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  }
  // daily counts per reason: { 'crack': { '2026-05-14': 3, ... }, ... }
  const defectByDay: Record<DefectReason, Record<string, number>> = { crack: {}, chip: {}, honeycomb: {}, other: {} }
  ;(qcData as any[])?.forEach((qc: any) => {
    if (!qc.demold_qty_defect || qc.demold_qty_defect <= 0) return
    const dateStr = qc.created_at ? new Date(qc.created_at).toISOString().split('T')[0] : null
    if (!dateStr) return
    const reason: DefectReason = defectReasonKeys.includes(qc.defect_reason) ? qc.defect_reason : 'other'
    defectByDay[reason][dateStr] = (defectByDay[reason][dateStr] || 0) + qc.demold_qty_defect
  })
  const defectTrendData = {
    labels: days.map(d => d.label),
    datasets: defectReasonKeys.map(reason => ({
      label: defectReasonConfig[reason].label,
      data: days.map(d => defectByDay[reason][d.dateStr] || 0),
      borderColor: defectReasonConfig[reason].color,
      backgroundColor: defectReasonConfig[reason].bg,
      fill: true,
      tension: 0.4,
      borderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
    })),
  }

  // Concrete Usage Summary
  const concreteList = (concreteOrders as any[]) || []
  const roundsList = (concreteRounds as any[]) || []
  const totalConcreteOrdered = concreteList.reduce((s: number, o: any) => s + (o.total_qty_requested || o.qty_requested || 0), 0)
  const totalRounds = roundsList.length
  const suppliedRounds = roundsList.filter((r: any) => r.status === 'supplied' || r.supplied_at).length
  const totalConcreteSupplied = roundsList.filter((r: any) => r.status === 'supplied' || r.supplied_at).reduce((s: number, r: any) => s + (r.qty_per_round || 0), 0)
  const pendingOrders = concreteList.filter((o: any) => o.status !== 'supplied' && o.status !== 'completed').length
  // Per-bed breakdown
  const bedConcreteMap = new Map<string, number>()
  concreteList.forEach((o: any) => {
    if (o.bed) {
      const k = `Bed ${o.bed}`
      bedConcreteMap.set(k, (bedConcreteMap.get(k) || 0) + (o.total_qty_requested || o.qty_requested || 0))
    }
  })
  const bedConcreteEntries = Array.from(bedConcreteMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <>
      <Header title="Executive Dashboard" subtitle={`อัปเดต: วันนี้ ${dateDisplay}`} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 36px' }}>

        {/* Section Label */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Production Overview
          </div>
          <DashboardRefresh />
        </div>

        {/* KPI Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 24 }}>
          {kpiCards.map((kpi) => (
            <div key={kpi.badge} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', transition: 'box-shadow 0.15s' }}
              className="hover:shadow-md">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ width: 42, height: 42, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: kpi.bg, color: kpi.color }}>
                  <i className={`fas ${kpi.icon}`}></i>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 20, background: kpi.bg, color: kpi.color }}>
                  {kpi.badge}
                </span>
              </div>
              <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, marginBottom: 6, color: kpi.isRed ? 'var(--red)' : 'var(--text-primary)' }}>
                {kpi.value}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Production Pipeline Flow */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>Production Pipeline — สายการผลิตปัจจุบัน</div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
              {([
                { key: 'pending' as DisplayStatus, label: 'รอเริ่ม', icon: 'fa-hourglass-start', color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
                { key: 'concrete_ordered' as DisplayStatus, label: 'สั่งคอนกรีต', icon: 'fa-truck', color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' },
                { key: 'casting' as DisplayStatus, label: 'เทคอนกรีต', icon: 'fa-fill-drip', color: '#0284C7', bg: '#E0F2FE', border: '#BAE6FD' },
                { key: 'curing' as DisplayStatus, label: 'กำลังบ่ม', icon: 'fa-clock', color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
                { key: 'ready_demold' as DisplayStatus, label: 'พร้อมถอดแบบ', icon: 'fa-check-circle', color: '#059669', bg: '#D1FAE5', border: '#6EE7B7' },
                { key: 'demolded' as DisplayStatus, label: 'ถอดแบบแล้ว', icon: 'fa-cubes', color: '#7C3AED', bg: '#EDE9FE', border: '#C4B5FD' },
                { key: 'qc_passed' as DisplayStatus, label: 'QC ตรวจสอบแล้ว', icon: 'fa-check-double', color: '#2563EB', bg: '#EFF4FF', border: '#DBEAFE' },
              ]).map((step, idx, arr) => {
                const count = pipelineCounts[step.key]
                const qty = pipelineQty[step.key]
                const isLast = idx === arr.length - 1
                const active = count > 0
                return (
                  <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, gap: 8 }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 8px', borderRadius: 10, background: active ? step.bg : 'var(--bg)', border: `1.5px solid ${active ? step.border : 'var(--border)'}`, opacity: active ? 1 : 0.5, transition: 'all 0.2s' }}>
                      <div style={{ fontSize: 18, color: active ? step.color : '#9CA3AF', marginBottom: 8 }}><i className={`fas ${step.icon}`} /></div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: active ? step.color : '#9CA3AF', lineHeight: 1 }}>{count}</div>
                      <div style={{ fontSize: 9, color: active ? step.color : '#9CA3AF', fontWeight: 700, opacity: 0.75, marginTop: 2, letterSpacing: '0.05em' }}>JOB</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginTop: 8, textAlign: 'center', lineHeight: 1.3 }}>{step.label}</div>
                      <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4, fontFamily: 'monospace' }}>{qty > 0 ? `${qty.toLocaleString()} ชิ้น` : '—'}</div>
                    </div>
                    {!isLast && <i className="fas fa-chevron-right" style={{ fontSize: 12, color: '#D1D5DB', flexShrink: 0 }} />}
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fas fa-info-circle" style={{ color: 'var(--accent)', fontSize: 11 }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>แสดง Job Orders ทั้งหมดในช่วง 6 วันย้อนหลัง แยกตามขั้นตอนการผลิต</span>
            </div>
          </div>
        </div>

        {/* Band 2: Production Analytics & Quality */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 3fr)', gap: 16, marginBottom: 20 }}>
          {/* Left Column (Performance) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <DashboardCharts dailyData={dailyChartData} weeklyData={weeklyChartData} bedData={bedChartData} renderGroup="analytics" />
          </div>

          {/* Right Column (Quality) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <DashboardCharts defectTrendData={defectTrendData} renderGroup="quality" />
            
            {/* Defect Reasons */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Defect Reasons</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30, flex: 1, justifyContent: 'center' }}>
                <div style={{ width: 160, height: 160, borderRadius: '50%', background: `conic-gradient(#EF4444 0% ${defectStats.total > 0 ? (defectStats.crack/defectStats.total)*100 : 0}%, #F59E0B ${(defectStats.crack/defectStats.total)*100}% ${(defectStats.crack+defectStats.chip)/defectStats.total*100}%, #3B82F6 ${(defectStats.crack+defectStats.chip)/defectStats.total*100}% ${(defectStats.crack+defectStats.chip+defectStats.honeycomb)/defectStats.total*100}%, #8B5CF6 ${(defectStats.crack+defectStats.chip+defectStats.honeycomb)/defectStats.total*100}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                  <div style={{ width: 110, height: 110, background: 'white', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{defectStats.total}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginTop: 4 }}>TOTAL</span>
                  </div>
                </div>
                <div style={{ width: '100%' }}>
                  {defectReasons.map((r) => (
                    <div key={r.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: r.color, flexShrink: 0 }}></div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{r.label}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800 }}>{r.pct}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Band 3: Resources & Materials */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 3fr)', gap: 16, marginBottom: 20 }}>
          {/* Left Column (Concrete Usage) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>Concrete Usage — สรุปการใช้คอนกรีตวันนี้</div>
              {concreteList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  <i className="fas fa-hard-hat" style={{ fontSize: 24, marginBottom: 8, display: 'block', opacity: 0.3 }} />
                  ยังไม่มีการสั่งคอนกรีตวันนี้
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {/* KPI mini cards */}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: '0 0 auto' }}>
                    {[
                      { icon: 'fa-tint', label: 'สั่งทั้งหมด (ลบม.)', value: totalConcreteOrdered.toFixed(2), unit: 'ลบม.', color: '#0284C7', bg: '#E0F2FE', border: '#BAE6FD' },
                      { icon: 'fa-check-circle', label: 'จ่ายแล้ว (ลบม.)', value: totalConcreteSupplied.toFixed(2), unit: 'ลบม.', color: '#059669', bg: '#D1FAE5', border: '#6EE7B7' },
                      { icon: 'fa-redo', label: 'รอบทั้งหมด', value: `${suppliedRounds}/${totalRounds}`, unit: 'รอบ', color: '#7C3AED', bg: '#EDE9FE', border: '#C4B5FD' },
                      { icon: 'fa-clock', label: 'คำสั่งที่ยังค้าง', value: pendingOrders.toString(), unit: 'รายการ', color: pendingOrders > 0 ? '#D97706' : '#6B7280', bg: pendingOrders > 0 ? '#FEF3C7' : '#F9FAFB', border: pendingOrders > 0 ? '#FDE68A' : '#E5E7EB' },
                    ].map(kpi => (
                      <div key={kpi.label} style={{ background: kpi.bg, border: `1px solid ${kpi.border}`, borderRadius: 10, padding: '14px 18px', minWidth: 110, textAlign: 'center' }}>
                        <div style={{ fontSize: 16, color: kpi.color, marginBottom: 6 }}><i className={`fas ${kpi.icon}`} /></div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
                        <div style={{ fontSize: 9, color: kpi.color, opacity: 0.8, fontWeight: 700, marginTop: 2 }}>{kpi.unit}</div>
                        <div style={{ fontSize: 10, color: '#6B7280', marginTop: 6, lineHeight: 1.3 }}>{kpi.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Per-bed breakdown */}
                  {bedConcreteEntries.length > 0 && (
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>ปริมาณคอนกรีตต่อโรงผลิต</div>
                      {bedConcreteEntries.map(([bed, qty]) => {
                        const pct = totalConcreteOrdered > 0 ? (qty / totalConcreteOrdered) * 100 : 0
                        return (
                          <div key={bed} style={{ marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{bed}</span>
                              <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#0284C7', fontWeight: 700 }}>{qty.toFixed(2)} ลบม.</span>
                            </div>
                            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #BAE6FD, #0284C7)', borderRadius: 3, transition: 'width 0.3s' }} />
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{pct.toFixed(1)}% ของทั้งหมด</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {/* Progress supplier */}
                  <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: `conic-gradient(#0284C7 0% ${totalRounds > 0 ? (suppliedRounds / totalRounds) * 100 : 0}%, #E0F2FE ${totalRounds > 0 ? (suppliedRounds / totalRounds) * 100 : 0}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: '#0284C7', lineHeight: 1 }}>{totalRounds > 0 ? Math.round((suppliedRounds / totalRounds) * 100) : 0}%</span>
                        <span style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 600 }}>DONE</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>ความคืบหน้า<br/>การจ่าย</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (Inventory Flow) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            {/* Inventory Summary */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Inventory Summary</span>
              </div>
              {[
                { icon: 'fa-layer-group', bg: '#FFF7ED', color: '#EA580C', value: allMaterials.length.toString(), unit: 'รายการ', label: `วัตถุดิบในคลัง (ปกติ ${allMaterials.length - lowStockItems.length} / ทั้งหมด ${allMaterials.length})`, alert: false },
                { icon: 'fa-th-large', bg: 'var(--indigo-light)', color: 'var(--indigo)', value: totalWip.toLocaleString(), unit: 'ชุด', label: 'โครงเหล็กพร้อมผลิต (WIP)', alert: false },
                { icon: 'fa-cubes', bg: 'var(--green-light)', color: 'var(--green)', value: totalFg.toLocaleString(), unit: 'ชิ้น', label: 'สินค้าพร้อมขาย (FG)', alert: false },
                { icon: 'fa-exclamation-triangle', bg: 'white', color: 'var(--red)', value: lowStockItems.length.toString(), unit: 'รายการ', label: 'สต็อกใกล้หมด', alert: lowStockItems.length > 0 },
              ].map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: item.alert ? '#FEF2F2' : 'var(--bg)',
                  border: item.alert ? '1px solid #FEE2E2' : 'none',
                  borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: i < 3 ? 8 : 0,
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 7, background: item.bg, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                    <i className={`fas ${item.icon}`}></i>
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, color: item.alert ? 'var(--red)' : undefined }}>
                      {item.value} <span style={{ fontSize: 11, fontWeight: 400, color: item.alert ? 'var(--red)' : 'var(--text-muted)' }}>{item.unit}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{item.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Low Stock */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>สต็อกวัตถุดิบใกล้หมด</span>
                <Link href="/inventory/raw" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>ดูทั้งหมด →</Link>
              </div>
              {displayLowStock.map((item: any) => {
                const isLow = item.qty_on_hand <= item.min_stock * 0.5
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>
                        <i className="fas fa-boxes"></i>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>คงเหลือ: {item.qty_on_hand} {item.unit}</div>
                      </div>
                    </div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: isLow ? 'var(--red-light)' : '#FFF7ED', color: isLow ? 'var(--red)' : '#C2410C' }}>
                      {isLow ? 'Low' : 'Warning'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Bottom Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 24 }}>
          {/* Job Orders Table */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>สถานะงานเทคอนกรีตวันนี้</span>
              <Link href="/job-orders" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>ดูทั้งหมด →</Link>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['โรงผลิต', 'สินค้า', 'เทแล้ว / เป้า', 'ความคืบหน้า', 'สถานะ'].map((th, i) => (
                    <th key={th} style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 10px', textAlign: i >= 2 ? 'center' : 'left', borderBottom: '1px solid var(--border)' }}>{th}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeJobs.slice(0, 8).map((job) => {
                  const displayStatus = getDisplayStatus(job)
                  const pct = getProgressPct(displayStatus)
                  const s = statusBadgeMap[displayStatus] ?? { label: job.status, bg: '#F3F4F6', color: '#6B7280' }
                  return (
                    <tr key={job.id} className="hover:bg-[var(--bg)] transition-colors">
                      <td style={{ padding: '10px 8px', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: 'var(--accent-light)', color: 'var(--accent)', marginRight: 8 }}>{job.bed}</span>
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.3 }}>
                          {job.plan_item?.product?.name ?? '—'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                          {job.plan_item?.product?.code ?? ''}
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontFamily: 'monospace', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontWeight: 700, color: job.qty_cast > 0 ? 'var(--green)' : 'var(--text-main)' }}>{job.qty_cast ?? 0}</span> / <span style={{ color: 'var(--text-muted)' }}>{job.qty_target ?? 0}</span>
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                          <div style={{ width: 70, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#10B981' : pct >= 50 ? '#8B5CF6' : '#2563EB', borderRadius: 2 }}></div>
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', width: 24, textAlign: 'right' }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span>
                      </td>
                    </tr>
                  )
                })}
                {activeJobs.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                      ไม่มีรายการผลิตที่กำลังดำเนินการ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Demolding Queue Table */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>งานตัดยก (กำลังบ่ม / พร้อมถอดแบบ)</span>
              <Link href="/demolding" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>ดูทั้งหมด →</Link>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['โรงผลิต', 'สินค้า', 'จำนวน (เท)', 'ถอดได้เมื่อ', 'ผลการถอด', 'ผู้ถอด', 'เวลาจริง vs คาด'].map((th, i) => (
                    <th key={th} style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 10px', textAlign: i >= 2 ? 'center' : 'left', borderBottom: '1px solid var(--border)' }}>{th}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {demoldingJobs.slice(0, 8).map((job) => {
                  const displayStatus = getDisplayStatus(job)
                  const ready = displayStatus === 'ready_demold'
                  const expectedTime = job.expected_demold_at || (job.cast_at ? new Date(new Date(job.cast_at).getTime() + 20 * 60 * 60 * 1000).toISOString() : null)
                  const demoldRec = demoldMap.get(job.id) ?? null

                  return (
                    <tr key={job.id} className="hover:bg-[var(--bg)] transition-colors">
                      <td style={{ padding: '10px 8px', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: ready ? '#ECFDF5' : '#FFFBEB', color: ready ? '#059669' : '#D97706', border: `1px solid ${ready ? '#A7F3D0' : '#FDE68A'}`, marginRight: 8 }}>{job.bed}</span>
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.3 }}>
                          {job.plan_item?.product?.name ?? '—'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                          {job.plan_item?.product?.code ?? ''}
                        </div>
                      </td>
                      {/* จำนวนเท */}
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontFamily: 'monospace', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{job.qty_cast ?? 0}</span>
                      </td>
                      {/* เวลาที่ควรถอด */}
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                        {expectedTime ? (
                          <div style={{ fontSize: 11, color: ready ? '#059669' : '#D97706', fontWeight: 600 }}>
                            <i className={`fas ${ready ? 'fa-check-circle' : 'fa-hourglass-half'}`} style={{ marginRight: 4 }} />
                            {fmtDate(expectedTime)}
                          </div>
                        ) : <span style={{ color: '#D1D5DB' }}>—</span>}
                      </td>
                      {/* ผลการถอด (จาก demolding_records) */}
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                        {demoldRec ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <div style={{ display: 'flex', gap: 6, fontSize: 11, fontWeight: 700 }}>
                              <span style={{ color: '#059669' }}><i className="fas fa-thumbs-up" style={{ marginRight: 3 }} />{demoldRec.qty_good}</span>
                              {demoldRec.qty_defect > 0 && <span style={{ color: '#EF4444' }}><i className="fas fa-thumbs-down" style={{ marginRight: 3 }} />{demoldRec.qty_defect}</span>}
                            </div>
                            {demoldRec.defect_reason && <span style={{ fontSize: 9, color: '#9CA3AF', textTransform: 'uppercase' }}>{demoldRec.defect_reason}</span>}
                          </div>
                        ) : <span style={{ fontSize: 11, color: '#D1D5DB' }}>ยังไม่ถอด</span>}
                      </td>
                      {/* ผู้ถอด */}
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                        {demoldRec?.worker?.full_name ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, flexShrink: 0 }}>
                              {demoldRec.worker.full_name.charAt(0)}
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{demoldRec.worker.full_name}</span>
                          </div>
                        ) : <span style={{ fontSize: 11, color: '#D1D5DB' }}>—</span>}
                      </td>
                      {/* เวลาถอดจริง vs คาด */}
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                        {demoldRec?.created_at ? (() => {
                          const actualMs = new Date(demoldRec.created_at).getTime()
                          const expectedMs = expectedTime ? new Date(expectedTime).getTime() : null
                          const diffMin = expectedMs ? Math.round((actualMs - expectedMs) / 60000) : null
                          const isLate = diffMin !== null && diffMin > 0
                          const isEarly = diffMin !== null && diffMin < 0
                          return (
                            <div style={{ fontSize: 10 }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmtDate(demoldRec.created_at)}</div>
                              {diffMin !== null && (
                                <div style={{ marginTop: 2, color: isLate ? '#EF4444' : isEarly ? '#059669' : '#6B7280', fontWeight: 600 }}>
                                  {isLate ? <><i className="fas fa-exclamation-circle" style={{ marginRight: 2 }} />ช้า {diffMin} น.</> : isEarly ? <><i className="fas fa-bolt" style={{ marginRight: 2 }} />เร็ว {Math.abs(diffMin)} น.</> : <><i className="fas fa-check" style={{ marginRight: 2 }} />ตรงเวลา</>}
                                </div>
                              )}
                            </div>
                          )
                        })() : <span style={{ fontSize: 11, color: '#D1D5DB' }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
                {demoldingJobs.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                      ไม่มีรายการถอดแบบที่รออยู่
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity Logs */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{"Today's Activity Logs"}</span>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>บันทึกการทำงานของพนักงานหน้างานและคลังสินค้า</p>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['เวลา', 'พนักงาน', 'โรงผลิต / แผนก', 'กิจกรรม', 'รายละเอียด', 'สถานะ'].map((th, i) => (
                  <th key={th} style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 10px', textAlign: i === 5 ? 'center' : 'left', borderBottom: '1px solid var(--border)' }}>{th}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayLogs.map((log, i) => (
                <tr key={i} className="hover:bg-[var(--bg)] transition-colors">
                  <td style={{ padding: '10px 8px', fontSize: 11, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
                      <i className="far fa-clock" style={{ color: 'var(--accent)', fontSize: 11 }}></i>
                      {log.time}
                    </div>
                  </td>
                  <td style={{ padding: '10px 8px', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>{log.name.charAt(0)}</div>
                      {log.name}
                    </div>
                  </td>
                  <td style={{ padding: '10px 8px', fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{log.dept}</td>
                  <td style={{ padding: '10px 8px', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>{log.action}</td>
                  <td style={{ padding: '10px 8px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{log.detail}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: log.green ? 'var(--green-light)' : 'var(--amber-light)', color: log.green ? '#059669' : '#B45309' }}>{log.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <Link href="/logs" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>ดูประวัติทั้งหมด (View All Logs) →</Link>
          </div>
        </div>

      </div>
    </>
  )
}
