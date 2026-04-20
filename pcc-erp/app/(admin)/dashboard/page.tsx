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
    
    const [{ data: todayPlan }, { data: jobOrders }, { data: recentLogs }, { data: lowStock }] = await Promise.all([
      supabase.from('production_plans').select('*,items:production_plan_items(*,product:products(*))').eq('plan_date', today).single(),
      supabase.from('job_orders').select('*,plan_item:production_plan_items(product:products(name,category))').gte('created_at', startDateStr).order('created_at', { ascending: false }),
      supabase.from('activity_logs').select('*,profile:profiles(full_name,role)').order('created_at', { ascending: false }).limit(10),
      supabase.from('raw_materials').select('*').filter('qty_on_hand', 'lte', 'min_stock').limit(5),
    ])
    return { todayPlan, jobOrders, recentLogs, lowStock, today }
  } catch {
    return { todayPlan: null, jobOrders: null, recentLogs: null, lowStock: null, today: '' }
  }
}

export default async function DashboardPage() {
  const { todayPlan, jobOrders, recentLogs, lowStock, today } = await getSupabaseData()

  const todaysJobOrders = (jobOrders as any[])?.filter((j: any) => j.created_at >= today) || []

  const totalTarget = (todayPlan as any)?.total_qty ?? 0
  const qtyCast = todaysJobOrders.filter((j: any) => ['casting', 'curing', 'ready_demold', 'demolded'].includes(j.status)).reduce((s: number, j: any) => s + (j.qty_cast ?? 0), 0)
  const qtyCuring = todaysJobOrders.filter((j: any) => ['curing', 'ready_demold'].includes(j.status)).reduce((s: number, j: any) => s + (j.qty_cast ?? 0), 0)
  const qtyDemolded = todaysJobOrders.filter((j: any) => j.status === 'demolded').reduce((s: number, j: any) => s + (j.qty_cast ?? 0), 0)

  // Calculate defect rate from qc_logs or job_orders with defect status
  const totalQcFail = todaysJobOrders.reduce((s: number, j: any) => s + (j.qty_defect ?? 0), 0)
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

  const statusBadge: Record<string, { label: string; bg: string; color: string }> = {
    pending: { label: 'รอเริ่ม', bg: 'var(--amber-light)', color: '#B45309' },
    casting: { label: 'ดำเนินการ', bg: 'var(--accent-light)', color: 'var(--accent)' },
    curing: { label: 'บ่ม', bg: 'var(--green-light)', color: '#059669' },
    ready_demold: { label: 'พร้อมถอดแบบ', bg: 'var(--green-light)', color: '#059669' },
    demolded: { label: 'เสร็จสิ้น', bg: '#F3F4F6', color: '#6B7280' },
  }

  const mockJobs = [
    { id: '1', name: 'แผ่นพื้น PL50 4@4', bed: 'B', qty_cast: 120, qty_target: 150, status: 'casting' },
    { id: '2', name: 'เสาเข็ม .15x.15 2.00 ม.', bed: 'A', qty_cast: 50, qty_target: 50, status: 'curing' },
    { id: '3', name: 'กำแพงกันดิน Type 1', bed: 'C', qty_cast: 0, qty_target: 25, status: 'pending' },
    { id: '4', name: 'ผนังรั้วสำเร็จรูป 0.50x2.90 ม.', bed: 'D', qty_cast: 18, qty_target: 40, status: 'casting' },
  ]

  const mockLowStock = [
    { id: '1', name: 'เหล็กเส้น DB12 (10m)', qty_on_hand: 45, min_stock: 100, unit: 'เส้น' },
    { id: '2', name: 'น้ำยาทาแบบ', qty_on_hand: 2, min_stock: 5, unit: 'ถัง' },
    { id: '3', name: 'เมชกำแพงกันดิน A', qty_on_hand: 5, min_stock: 15, unit: 'แผง' },
  ]

  const mockLogs = [
    { time: '11:25', name: 'สมชาย ใจดี', dept: 'แท่น A', action: 'เทคอนกรีตเสร็จสิ้น', detail: 'เสาเข็ม .15x.15 2.00 ม.', status: 'สำเร็จ', green: true },
    { time: '11:10', name: 'วิชัย รักดี', dept: 'คลังเตรียมเหล็ก', action: 'บันทึกยอด WIP', detail: 'โครงเสาเข็ม (+50 ชุด)', status: 'สำเร็จ', green: true },
    { time: '10:45', name: 'สมหญิง คลังเป๊ะ', dept: 'คลังวัตถุดิบ', action: 'เบิกวัตถุดิบ', detail: 'เหล็ก DB12 (40 เส้น)', status: 'สำเร็จ', green: true },
    { time: '09:30', name: 'มานะ ถอดเก่ง', dept: 'แท่น B', action: 'ถอดแบบ / จบงาน', detail: 'แผ่นพื้น 2 แผ่น — บิ่น', status: 'ของเสีย', green: false },
    { time: '08:15', name: 'สมชาย ใจดี', dept: 'แท่น A', action: 'เริ่มงาน (สแกน QR)', detail: 'Job: #JO-2610-042', status: 'เริ่มระบบ', green: true },
  ]

  const displayJobs = (jobOrders as any[])?.slice(0, 5).map((j: any) => ({
    id: j.id, name: j.plan_item?.product?.name ?? '—', bed: j.bed, qty_cast: j.qty_cast, qty_target: j.qty_target, status: j.status,
  })) ?? mockJobs

  const displayLowStock = (lowStock as any[])?.slice(0, 4) ?? mockLowStock
  const displayLogs = ((recentLogs as any[])?.length > 0) ? [] : mockLogs

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
    categoriesMap.get(catName).actual += (job.qty_cast || 0)
  })

  // dailyChart fallback to undefined so component can render mock or empty
  const dailyChartData = categoriesMap.size > 0 ? {
    labels: Array.from(categoriesMap.keys()),
    planData: Array.from(categoriesMap.values()).map(v => v.plan),
    actualData: Array.from(categoriesMap.values()).map(v => v.actual)
  } : undefined

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
     const jobDate = job.created_at.split('T')[0]
     catWeeklyMap.get(catName).dates[jobDate] = (catWeeklyMap.get(catName).dates[jobDate] || 0) + (job.qty_cast || 0)
  })

  const weeklyChartData = catWeeklyMap.size > 0 ? {
    labels: days.map(d => d.label),
    datasets: [] as any[]
  } : undefined
  
  if (weeklyChartData) {
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
  }

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
                { icon: 'fa-layer-group', bg: '#FFF7ED', color: '#EA580C', value: '12.5', unit: 'ตัน', label: 'วัตถุดิบหลัก (RM)', alert: false },
                { icon: 'fa-th-large', bg: 'var(--indigo-light)', color: 'var(--indigo)', value: '450', unit: 'ชุด', label: 'โครงเหล็กพร้อมผลิต', alert: false },
                { icon: 'fa-cubes', bg: 'var(--green-light)', color: 'var(--green)', value: '1,205', unit: 'ชิ้น', label: 'สินค้าพร้อมขาย (FG)', alert: false },
                { icon: 'fa-exclamation-triangle', bg: 'white', color: 'var(--red)', value: `${displayLowStock.length ?? 3}`, unit: 'รายการ', label: 'สต็อกใกล้หมด', alert: true },
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
                <div style={{ width: 90, height: 90, borderRadius: '50%', background: 'conic-gradient(#EF4444 0% 45%,#F59E0B 45% 75%,#3B82F6 75% 90%,#8B5CF6 90% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                  <div style={{ width: 60, height: 60, background: 'white', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>85</span>
                    <span style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 600 }}>Total</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  {[['#EF4444', 'แตก/ร้าว', '45%'], ['#F59E0B', 'บิ่น/มุมหัก', '30%'], ['#3B82F6', 'Honeycomb', '15%'], ['#8B5CF6', 'อื่นๆ', '10%']].map(([c, n, p]) => (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }}></div>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{n}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 1fr)', gap: 16, marginBottom: 24 }}>
          {/* Job Orders Table */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>สถานะงานเทคอนกรีตวันนี้</span>
              <Link href="/job-orders" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>ดูทั้งหมด →</Link>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['รายการสินค้า', 'แท่น', 'ความคืบหน้า', 'สำเร็จ', 'สถานะ'].map((th, i) => (
                    <th key={th} style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 10px', textAlign: i >= 3 ? 'center' : 'left', borderBottom: '1px solid var(--border)' }}>{th}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayJobs.map((job) => {
                  const pct = job.qty_target > 0 ? Math.round((job.qty_cast / job.qty_target) * 100) : 0
                  const s = statusBadge[job.status] ?? { label: job.status, bg: '#F3F4F6', color: '#6B7280' }
                  return (
                    <tr key={job.id} className="hover:bg-[var(--bg)] transition-colors">
                      <td style={{ padding: '10px 8px', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>{job.name}</td>
                      <td style={{ padding: '10px 8px', fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>แท่น {job.bed}</td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 70, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--green)' : 'var(--accent)', borderRadius: 2 }}></div>
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 11, fontFamily: 'monospace', borderBottom: '1px solid var(--border)' }}>{job.qty_cast} / {job.qty_target}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span>
                      </td>
                    </tr>
                  )
                })}
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
                {['เวลา', 'พนักงาน', 'แท่น / แผนก', 'กิจกรรม', 'รายละเอียด', 'สถานะ'].map((th, i) => (
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
