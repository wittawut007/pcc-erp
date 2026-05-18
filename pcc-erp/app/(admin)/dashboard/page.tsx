export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import DashboardCharts from './DashboardCharts'
import Link from 'next/link'

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
    
    const [{ data: todayPlan }, { data: jobOrders }, { data: recentLogs }, { data: lowStock }, { data: fgStock }, { data: wipStock }, { data: qcData }] = await Promise.all([
      supabase.from('production_plans').select('*,items:production_plan_items(*,product:products(*))').eq('plan_date', today).single(),
      supabase.from('job_orders').select(`
        *,
        plan_item:production_plan_items!inner(
          product:products(name,category,code),
          plan:production_plans!inner(plan_date)
        ),
        qc:qc_inspections(pour_ok, demold_qty_good, demold_qty_defect, defect_reason)
      `)
      .gte('plan_item.plan.plan_date', startDateStr)
      .order('created_at', { ascending: false }),
      supabase.from('activity_logs').select('*,profile:profiles(full_name,role)').order('created_at', { ascending: false }).limit(10),
      supabase.from('raw_materials').select('*'),
      supabase.from('fg_inventory').select('qty'),
      supabase.from('wip_inventory').select('qty'),
      supabase.from('qc_inspections').select('demold_qty_defect, defect_reason').gte('created_at', startDateStr)
    ])
    return { todayPlan, jobOrders, recentLogs, lowStock, fgStock, wipStock, qcData, today }
  } catch (err) {
    console.error('Dashboard Fetch Error:', err)
    return { todayPlan: null, jobOrders: null, recentLogs: null, lowStock: null, fgStock: null, wipStock: null, qcData: null, today: '' }
  }
}

export default async function DashboardPage() {
  const { todayPlan, jobOrders, recentLogs, lowStock, fgStock, wipStock, qcData, today } = await getSupabaseData()

  const todaysJobOrders = (jobOrders as any[])?.filter((j: any) => j.plan_item?.plan?.plan_date === today) || []

  const totalTarget = (todayPlan as any)?.total_qty ?? 0
  const qtyCast = todaysJobOrders.filter((j: any) => ['casting', 'curing', 'ready_demold', 'demolded'].includes(j.status)).reduce((s: number, j: any) => s + (j.qty_cast ?? 0), 0)
  const qtyCuring = todaysJobOrders.filter((j: any) => ['curing', 'ready_demold'].includes(j.status)).reduce((s: number, j: any) => s + (j.qty_cast ?? 0), 0)
  const qtyDemolded = todaysJobOrders.filter((j: any) => j.status === 'demolded').reduce((s: number, j: any) => s + (j.qc?.[0]?.demold_qty_good ?? j.qty_cast ?? 0), 0)

  // Calculate defect rate from qc_inspections
  const totalQcFail = todaysJobOrders.reduce((s: number, j: any) => s + (j.qc?.[0]?.demold_qty_defect ?? 0), 0)
  const totalQcCast = qtyCast
  const defectRate = totalQcCast > 0 ? ((totalQcFail / totalQcCast) * 100).toFixed(1) + '%' : '0%'

  const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  const now = new Date()
  const dateDisplay = `${now.getDate()} ${thMonths[now.getMonth()]} ${now.getFullYear() + 543}`

  const kpiCards = [
    { label: 'เป้าหมายวันนี้ (ชิ้น)', value: totalTarget, badge: 'Target', icon: 'fa-bullseye', bg: 'var(--accent-light)', color: 'var(--accent)' },
    { label: 'เทคอนกรีตแล้ว', value: qtyCast, badge: 'Casting', icon: 'fa-truck-monster', bg: 'var(--indigo-light)', color: 'var(--indigo)' },
    { label: 'กำลังบ่ม / รอถอดแบบ', value: qtyCuring, badge: 'Curing', icon: 'fa-clock', bg: 'var(--amber-light)', color: 'var(--amber)' },
    { label: 'ถอดแบบแล้ว (FG)', value: qtyDemolded, badge: 'Demolded', icon: 'fa-cubes', bg: 'var(--green-light)', color: 'var(--green)' },
    { label: 'อัตราของเสียวันนี้', value: defectRate, badge: 'Defect', icon: 'fa-exclamation-circle', bg: 'var(--red-light)', color: 'var(--red)', isRed: true },
  ]

  type DisplayStatus = 'pending' | 'concrete_ordered' | 'casting' | 'curing' | 'ready_demold' | 'demolded' | 'qc_passed' | 'cancelled'

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
  
    // casting / concrete_ordered: ตรวจ QC pour_ok
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
    concrete_ordered: { label: 'สั่งคอนกรีตแล้ว', bg: 'var(--indigo-light)', color: 'var(--indigo)' },
    casting: { label: 'เทคอนกรีตแล้ว', bg: 'var(--accent-light)', color: 'var(--accent)' },
    curing: { label: 'กำลังบ่ม', bg: 'var(--green-light)', color: '#059669' },
    ready_demold: { label: 'พร้อมถอดแบบ', bg: 'var(--green-light)', color: '#059669' },
    demolded: { label: 'ถอดแบบแล้ว', bg: '#F3F4F6', color: '#6B7280' },
    qc_passed: { label: 'QC ตรวจผ่าน', bg: '#F3F4F6', color: '#6B7280' },
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

  const activeJobs = (jobOrders as any[])?.filter((j: any) => {
    const s = getDisplayStatus(j)
    return !['demolded', 'qc_passed', 'cancelled'].includes(s)
  }) || []

  const demoldingJobs = (jobOrders as any[])?.filter((j: any) => {
    const s = getDisplayStatus(j)
    return ['ready_demold', 'curing'].includes(s)
  }).sort((a, b) => {
    const expectedA = a.expected_demold_at || (a.cast_at ? new Date(new Date(a.cast_at).getTime() + 20 * 60 * 60 * 1000).toISOString() : '')
    const expectedB = b.expected_demold_at || (b.cast_at ? new Date(new Date(b.cast_at).getTime() + 20 * 60 * 60 * 1000).toISOString() : '')
    if (!expectedA) return 1
    if (!expectedB) return -1
    return new Date(expectedA).getTime() - new Date(expectedB).getTime()
  }) || []

  function fmtDate(isoStr: string) {
    if (!isoStr) return '—'
    const d = new Date(isoStr)
    return d.toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const allMaterials = (lowStock as any[]) || []
  const lowStockItems = allMaterials.filter(m => (m.qty_on_hand || 0) <= (m.min_stock || 0))
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

  return (
    <>
      <Header title="Executive Dashboard" subtitle={`อัปเดต: วันนี้ ${dateDisplay}`} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 36px' }}>

        {/* Section Label */}
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>
          Production Overview
        </div>

        {/* KPI Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
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

        {/* Mid Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 1fr)', gap: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <DashboardCharts dailyData={dailyChartData} weeklyData={weeklyChartData} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            {/* Inventory Summary */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Inventory Summary</span>
              </div>
              {[
                { icon: 'fa-layer-group', bg: '#FFF7ED', color: '#EA580C', value: '-', unit: '', label: 'ระบบจัดการวัตถุดิบหลัก', alert: false },
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

            {/* Defect Reasons */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Defect Reasons</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 90, height: 90, borderRadius: '50%', background: `conic-gradient(#EF4444 0% ${defectStats.total > 0 ? (defectStats.crack/defectStats.total)*100 : 0}%, #F59E0B ${(defectStats.crack/defectStats.total)*100}% ${(defectStats.crack+defectStats.chip)/defectStats.total*100}%, #3B82F6 ${(defectStats.crack+defectStats.chip)/defectStats.total*100}% ${(defectStats.crack+defectStats.chip+defectStats.honeycomb)/defectStats.total*100}%, #8B5CF6 ${(defectStats.crack+defectStats.chip+defectStats.honeycomb)/defectStats.total*100}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                  <div style={{ width: 60, height: 60, background: 'white', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{defectStats.total}</span>
                    <span style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 600 }}>Total</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  {defectReasons.map((r) => (
                    <div key={r.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }}></div>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.label}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{r.pct}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginBottom: 24 }}>
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
              <span style={{ fontSize: 13, fontWeight: 700 }}>งานตัดยก (รอถอดแบบ)</span>
              <Link href="/demolding" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>ดูทั้งหมด →</Link>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['โรงผลิต', 'สินค้า', 'จำนวน', 'ถอดได้', 'สถานะ'].map((th, i) => (
                    <th key={th} style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 10px', textAlign: i >= 2 ? 'center' : 'left', borderBottom: '1px solid var(--border)' }}>{th}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {demoldingJobs.slice(0, 8).map((job) => {
                  const displayStatus = getDisplayStatus(job)
                  const ready = displayStatus === 'ready_demold'
                  const expectedTime = job.expected_demold_at || (job.cast_at ? new Date(new Date(job.cast_at).getTime() + 20 * 60 * 60 * 1000).toISOString() : null)

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
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontFamily: 'monospace', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{job.qty_cast ?? 0}</span>
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                        {expectedTime ? (
                          <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                            <i className="fas fa-calendar-check" style={{ marginRight: 4 }} />
                            {fmtDate(expectedTime)}
                          </div>
                        ) : <span style={{ color: '#D1D5DB' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: ready ? '#D1FAE5' : '#FEF3C7', color: ready ? '#065F46' : '#B45309', border: `1px solid ${ready ? '#A7F3D0' : '#FDE68A'}` }}>
                          {ready ? <><i className="fas fa-check-circle" style={{ marginRight: 4 }} /> พร้อมถอดแบบ</> : <><i className="fas fa-hourglass-half" style={{ marginRight: 4 }} /> กำลังบ่ม</>}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {demoldingJobs.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                      ไม่มีรายการถอดแบบที่รออยู่
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
