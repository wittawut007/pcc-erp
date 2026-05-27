'use client'

import { useState, useMemo, useTransition } from 'react'
import { resetJobOrder } from '@/app/actions/concrete'
import toast from 'react-hot-toast'

interface ConcreteOrder {
  id: string
  requested_at: string | null
  status: string
  notes?: string | null
  requester: { full_name: string } | null
}

interface JobOrder {
  id: string
  bed: string
  qty_target: number
  qty_cast: number
  status: string
  started_at: string | null
  cast_at: string | null
  expected_demold_at: string | null
  demolded_at: string | null
  created_at: string
  concrete_requested_at: string | null
  plan_item: {
    id?: string
    qty_target: number
    bed: string
    product: { id: string; code: string; name: string; category: string; unit: string }
    plan?: { id: string; plan_date: string; created_at: string; status: string }
  } | null
  production_order?: { order_number: string; status?: string } | null
  worker: { full_name: string; employee_code: string | null } | null
  photo_ready_url: string | null
  photo_cast_url: string | null
  qc_inspection?: { pour_ok: boolean | null; demold_qty_good: number | null; inspector?: { full_name: string } | null }[]
  concrete_orders?: ConcreteOrder[]
}

interface Worker {
  id: string
  full_name: string
  employee_code: string | null
}

// ── Derive effective display status from QC state ──
type DisplayStatus = 'pending' | 'concrete_ordered' | 'casting' | 'curing' | 'ready_demold' | 'demolded' | 'qc_passed' | 'cancelled'

function getDisplayStatus(job: JobOrder): DisplayStatus {
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
  const qc = Array.isArray(job.qc_inspection) ? job.qc_inspection[0] : null
  if (qc?.pour_ok === true) return 'casting'
  return 'concrete_ordered'
}

// % progress ตามสถานะที่แสดง (QC-confirmed เท่านั้น)
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

const STATUS_CFG: Record<DisplayStatus, { label: string; icon: string; badgeBg: string; badgeBorder: string; badgeText: string; kpiBg: string; kpiBorder: string; kpiText: string; ring: string }> = {
  pending:          { label: 'รอเริ่ม',           icon: 'fa-clock',         badgeBg: '#F3F4F6', badgeBorder: '#E5E7EB', badgeText: '#6B7280', kpiBg: '#F9FAFB', kpiBorder: '#E5E7EB', kpiText: '#6B7280', ring: 'rgba(107,114,128,0.2)' },
  concrete_ordered: { label: 'สั่งคอนกรีต',      icon: 'fa-truck-loading', badgeBg: '#DBEAFE', badgeBorder: '#BFDBFE', badgeText: '#1D4ED8', kpiBg: '#EFF6FF', kpiBorder: '#BFDBFE', kpiText: '#2563EB', ring: 'rgba(37,99,235,0.2)' },
  casting:          { label: 'เทคอนกรีต',        icon: 'fa-fill-drip',     badgeBg: '#EDE9FE', badgeBorder: '#C4B5FD', badgeText: '#5B21B6', kpiBg: '#F5F3FF', kpiBorder: '#C4B5FD', kpiText: '#7C3AED', ring: 'rgba(124,58,237,0.2)' },
  curing:           { label: 'กำลังบ่ม',          icon: 'fa-hourglass-half',badgeBg: '#FEF3C7', badgeBorder: '#FDE68A', badgeText: '#B45309', kpiBg: '#FFFBEB', kpiBorder: '#FDE68A', kpiText: '#D97706', ring: 'rgba(217,119,6,0.2)' },
  ready_demold:     { label: 'พร้อมถอดแบบ',       icon: 'fa-check-circle',  badgeBg: '#D1FAE5', badgeBorder: '#A7F3D0', badgeText: '#065F46', kpiBg: '#ECFDF5', kpiBorder: '#A7F3D0', kpiText: '#059669', ring: 'rgba(5,150,105,0.2)' },
  demolded:         { label: 'ถอดแบบแล้ว',         icon: 'fa-cubes',         badgeBg: '#ECFDF5', badgeBorder: '#6EE7B7', badgeText: '#065F46', kpiBg: '#F0FDF4', kpiBorder: '#86EFAC', kpiText: '#16A34A', ring: 'rgba(22,163,74,0.2)' },
  qc_passed:        { label: 'QC ตรวจสอบแล้ว',    icon: 'fa-check-double',  badgeBg: '#EFF4FF', badgeBorder: '#DBEAFE', badgeText: '#2563EB', kpiBg: '#EFF4FF', kpiBorder: '#DBEAFE', kpiText: '#2563EB', ring: 'rgba(37,99,235,0.2)' },
  cancelled:        { label: 'ยกเลิก',             icon: 'fa-times-circle',  badgeBg: '#FEE2E2', badgeBorder: '#FECACA', badgeText: '#991B1B', kpiBg: '#FEF2F2', kpiBorder: '#FECACA', kpiText: '#DC2626', ring: 'rgba(220,38,38,0.2)' },
}

const KPI_STATUSES: DisplayStatus[] = ['pending', 'concrete_ordered', 'casting', 'curing', 'ready_demold']

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontWeight: 700,
  color: '#6B7280',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
}

const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const fmtPlanDate = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

function getLocalDateString(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getTodayRange() {
  const t = new Date()
  const d = getLocalDateString(t)
  return { start: d, end: d }
}

function getThisWeekRange() {
  const t = new Date()
  const day = t.getDay()
  const diffToMonday = t.getDate() - day + (day === 0 ? -6 : 1)
  const start = new Date(t)
  start.setDate(diffToMonday)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: getLocalDateString(start), end: getLocalDateString(end) }
}

function getThisMonthRange() {
  const t = new Date()
  const start = new Date(t.getFullYear(), t.getMonth(), 1)
  const end = new Date(t.getFullYear(), t.getMonth() + 1, 0)
  return { start: getLocalDateString(start), end: getLocalDateString(end) }
}

export default function JobOrdersClient({ jobOrders: initial, historyJobOrders: initialHistory = [], userRole }: { jobOrders: JobOrder[]; historyJobOrders?: JobOrder[]; workers: Worker[]; userRole?: string }) {
  const [tab, setTab] = useState<'queue' | 'history'>('queue')
  const [filterStatus, setFilterStatus] = useState<DisplayStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<{ start: string, end: string }>({ start: '', end: '' })
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set())
  const [expandedHistoryPlans, setExpandedHistoryPlans] = useState<Set<string>>(new Set())
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [resettingJobId, setResettingJobId] = useState<string | null>(null)

  const handleResetJob = (jobId: string, bed: string) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลการสั่งคอนกรีตของโรงผลิต ${bed} ทั้งหมด? (สถานะของงานจะถูกรีเซ็ต)`)) return

    setResettingJobId(jobId)
    startTransition(async () => {
      try {
        await resetJobOrder(jobId, bed)
        toast.success('รีเซ็ตข้อมูลการสั่งคอนกรีตเรียบร้อยแล้ว')
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setResettingJobId(null)
      }
    })
  }

  // Enrich with display status
  const jobs = useMemo(() =>
    initial.map(j => ({ ...j, _displayStatus: getDisplayStatus(j) }))
  , [initial])

  const historyJobs = useMemo(() =>
    initialHistory.map(j => ({ ...j, _displayStatus: getDisplayStatus(j) }))
  , [initialHistory])

  // KPI counts
  const kpiCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    KPI_STATUSES.forEach(s => { counts[s] = 0 })
    jobs.forEach(j => {
      if (counts[j._displayStatus] !== undefined) counts[j._displayStatus]++
    })
    return counts
  }, [jobs])

  // Group by plan
  type PlanGroup = {
    planId: string
    planDate: string
    planCreatedAt: string
    orderNumber: string
    jobs: typeof jobs
  }

  const planGroups = useMemo(() => {
    const map = new Map<string, PlanGroup>()
    jobs.forEach(j => {
      const plan = j.plan_item?.plan
      if (!plan) return
      // Key by production_order number (not plan.id) so different POs are separate groups
      const datePart = plan.plan_date.replace(/-/g, '')
      const orderNumber = j.production_order?.order_number || `PO-${datePart}-001`
      const groupKey = orderNumber
      if (!map.has(groupKey)) {
        map.set(groupKey, {
          planId: groupKey,
          planDate: plan.plan_date,
          planCreatedAt: plan.created_at,
          orderNumber,
          jobs: [],
        })
      }
      map.get(groupKey)!.jobs.push(j)
    })
    // Sort newest first
    return Array.from(map.values()).sort((a, b) =>
      new Date(b.planDate).getTime() - new Date(a.planDate).getTime()
    )
  }, [jobs])

  // Filter groups
  const filteredGroups = useMemo(() => {
    return planGroups.map(g => ({
      ...g,
      jobs: g.jobs.filter(j => {
        const matchStatus = filterStatus === 'all' || j._displayStatus === filterStatus
        const matchSearch = !search.trim() ||
          (j.plan_item?.product?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (j.plan_item?.product?.code ?? '').toLowerCase().includes(search.toLowerCase()) ||
          j.bed.toLowerCase().includes(search.toLowerCase()) ||
          g.orderNumber.toLowerCase().includes(search.toLowerCase())
        return matchStatus && matchSearch
      }),
    })).filter(g => {
      if (g.jobs.length === 0) return false;
      if (dateRange.start && dateRange.end) {
        const pDate = g.planDate.split('T')[0];
        if (pDate < dateRange.start || pDate > dateRange.end) return false;
      }
      return true;
    })
  }, [planGroups, filterStatus, search, dateRange])

  const togglePlan = (planId: string) => {
    setExpandedPlans(prev => {
      const next = new Set(prev)
      next.has(planId) ? next.delete(planId) : next.add(planId)
      return next
    })
  }

  // Auto-expand all on first load
  const allPlanIds = useMemo(() => new Set(planGroups.map(g => g.planId)), [planGroups])
  const [initialized, setInitialized] = useState(false)
  if (!initialized && planGroups.length > 0) {
    setExpandedPlans(allPlanIds)
    setInitialized(true)
  }

  // ─── History groups ──────────────────────────────────────────────────────────
  const historyPlanGroups = useMemo(() => {
    const map = new Map<string, PlanGroup>()
    historyJobs.forEach(j => {
      const plan = j.plan_item?.plan
      if (!plan) return
      // Key by production_order number so different POs are separate groups
      const datePart = plan.plan_date.replace(/-/g, '')
      const orderNumber = j.production_order?.order_number || `PO-${datePart}-001`
      const groupKey = orderNumber
      if (!map.has(groupKey)) {
        map.set(groupKey, {
          planId: groupKey,
          planDate: plan.plan_date,
          planCreatedAt: plan.created_at,
          orderNumber,
          jobs: [],
        })
      }
      map.get(groupKey)!.jobs.push(j)
    })
    return Array.from(map.values()).sort((a, b) =>
      new Date(b.planDate).getTime() - new Date(a.planDate).getTime()
    )
  }, [historyJobs])


  const filteredHistoryGroups = useMemo(() => {
    return historyPlanGroups.map(g => ({
      ...g,
      jobs: g.jobs.filter(j => {
        const matchSearch = !search.trim() ||
          (j.plan_item?.product?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (j.plan_item?.product?.code ?? '').toLowerCase().includes(search.toLowerCase()) ||
          j.bed.toLowerCase().includes(search.toLowerCase()) ||
          g.orderNumber.toLowerCase().includes(search.toLowerCase())
        return matchSearch
      }),
    })).filter(g => {
      if (g.jobs.length === 0) return false
      if (dateRange.start && dateRange.end) {
        const pDate = g.planDate.split('T')[0]
        if (pDate < dateRange.start || pDate > dateRange.end) return false
      }
      return true
    })
  }, [historyPlanGroups, search, dateRange])

  const toggleHistoryPlan = (planId: string) => {
    setExpandedHistoryPlans(prev => {
      const next = new Set(prev)
      next.has(planId) ? next.delete(planId) : next.add(planId)
      return next
    })
  }

  const allHistoryPlanIds = useMemo(() => new Set(historyPlanGroups.map(g => g.planId)), [historyPlanGroups])
  const [historyInitialized, setHistoryInitialized] = useState(false)
  if (!historyInitialized && historyPlanGroups.length > 0) {
    setExpandedHistoryPlans(allHistoryPlanIds)
    setHistoryInitialized(true)
  }

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    background: active ? '#2563EB' : 'transparent', color: active ? '#fff' : '#6B7280',
    border: 'none', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6
  })

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: '#F7F8FA', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI Cards — always visible */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {KPI_STATUSES.map(key => {
          const cfg = STATUS_CFG[key]
          const isActive = filterStatus === key
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(tab === 'queue' ? (isActive ? 'all' : key) : filterStatus)}
              style={{
                padding: '16px 18px', borderRadius: 12, textAlign: 'left', cursor: tab === 'queue' ? 'pointer' : 'default',
                border: `2px solid ${isActive && tab === 'queue' ? cfg.kpiText : cfg.kpiBorder}`,
                background: cfg.kpiBg,
                boxShadow: isActive && tab === 'queue' ? `0 0 0 3px ${cfg.ring}` : '0 1px 3px rgba(0,0,0,0.05)',
                transition: 'all 0.15s',
                opacity: tab === 'queue' && filterStatus !== 'all' && !isActive ? 0.5 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <i className={`fas ${cfg.icon}`} style={{ fontSize: 16, color: cfg.kpiText }} />
                <span style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: cfg.kpiText }}>
                  {kpiCounts[key] ?? 0}
                </span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: cfg.kpiText, opacity: 0.9 }}>{cfg.label}</div>
            </button>
          )
        })}
      </div>

      {/* Filters (Search & Date) */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {/* Search Bar */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 300 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#9CA3AF' }} />
            <input
              type="text"
              placeholder="ค้นหาสินค้า, รหัส, โรงผลิต, เลขที่ PO..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32, paddingRight: 12, height: 36, width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12, outline: 'none', color: '#374151', background: '#F9FAFB', boxSizing: 'border-box' }}
            />
          </div>
          <span style={{ fontSize: 12, color: '#9CA3AF', whiteSpace: 'nowrap' }}>
            {tab === 'queue'
              ? `${filteredGroups.reduce((s, g) => s + g.jobs.length, 0)} รายการ จาก ${filteredGroups.length} ใบสั่งผลิต`
              : `${filteredHistoryGroups.reduce((s, g) => s + g.jobs.length, 0)} รายการ จาก ${filteredHistoryGroups.length} ใบสั่งผลิต`
            }
          </span>
        </div>

        {/* Date Filter */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-calendar-alt" style={{ color: '#9CA3AF', fontSize: 14 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>วันที่แผน:</span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '4px 8px' }}>
            <input 
              type="date" 
              value={dateRange.start} 
              onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))}
              style={{ border: 'none', background: 'transparent', fontSize: 12, outline: 'none', color: '#374151', cursor: 'pointer' }}
            />
            <span style={{ color: '#9CA3AF', fontSize: 12 }}>-</span>
            <input 
              type="date" 
              value={dateRange.end} 
              onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))}
              style={{ border: 'none', background: 'transparent', fontSize: 12, outline: 'none', color: '#374151', cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => setDateRange(getTodayRange())}
              style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer', transition: 'all 0.15s' }}
            >วันนี้</button>
            <button
              onClick={() => setDateRange(getThisWeekRange())}
              style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer', transition: 'all 0.15s' }}
            >สัปดาห์นี้</button>
            <button
              onClick={() => setDateRange(getThisMonthRange())}
              style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer', transition: 'all 0.15s' }}
            >เดือนนี้</button>
            {(dateRange.start || dateRange.end) && (
              <button
                onClick={() => setDateRange({ start: '', end: '' })}
                style={{ padding: '6px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', marginLeft: 4 }}
                title="ล้างตัวกรอง"
              >
                <i className="fas fa-times" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs + Content */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Tab Bar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 4, background: '#F9FAFB' }}>
          <button style={TAB_STYLE(tab === 'queue')} onClick={() => setTab('queue')}>
            <i className="fas fa-list-ul" />
            คิวงานรออยู่
            {jobs.length > 0 && <span style={{ background: '#EF4444', color: '#fff', borderRadius: 50, padding: '2px 8px', fontSize: 11, marginLeft: 4 }}>{jobs.length}</span>}
          </button>
          <button style={TAB_STYLE(tab === 'history')} onClick={() => setTab('history')}>
            <i className="fas fa-history" /> ย้อนหลัง
            {initialHistory.length > 0 && (
              <span style={{ background: tab === 'history' ? 'rgba(255,255,255,0.3)' : '#E5E7EB', color: tab === 'history' ? '#fff' : '#6B7280', borderRadius: 50, padding: '2px 8px', fontSize: 11, marginLeft: 4 }}>
                {initialHistory.length}
              </span>
            )}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* ── QUEUE TAB ── */}
          {tab === 'queue' && (
            filteredGroups.length === 0 ? (
              <div style={{ padding: '80px 24px', textAlign: 'center' }}>
                <i className="fas fa-clipboard-list" style={{ fontSize: 48, color: '#E5E7EB', display: 'block', marginBottom: 16 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: '#9CA3AF' }}>ไม่พบรายการ</div>
                <div style={{ fontSize: 12, color: '#D1D5DB', marginTop: 4 }}>ลองปรับตัวกรองสถานะหรือคำค้นหา</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {filteredGroups.map(group => {
            const isOpen = expandedPlans.has(group.planId)
            const totalTarget = group.jobs.reduce((s, j) => s + j.qty_target, 0)
            const statusCounts = KPI_STATUSES.map(s => ({
              status: s,
              count: group.jobs.filter(j => j._displayStatus === s).length,
            })).filter(x => x.count > 0)

            return (
              <div key={group.planId} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                {/* Group Header */}
                <button
                  onClick={() => togglePlan(group.planId)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 16,
                    padding: '14px 20px', background: '#F9FAFB', 
                    borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                    borderBottom: isOpen ? '1px solid #E5E7EB' : 'none',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <i className={`fas ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ fontSize: 12, color: '#9CA3AF', width: 14, flexShrink: 0 }} />

                  {/* PO Number */}
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: '#111827', letterSpacing: '0.03em' }}>
                    {group.orderNumber}
                  </span>

                  {/* Plan Date */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#6B7280', fontSize: 12 }}>
                    <i className="fas fa-calendar-alt" style={{ fontSize: 11, color: '#9CA3AF' }} />
                    วันที่แผน: <strong style={{ color: '#374151' }}>{fmtPlanDate(group.planDate)}</strong>
                  </div>

                  {/* Job count */}
                  <span style={{ fontSize: 12, color: '#6B7280' }}>
                    <strong style={{ color: '#374151' }}>{group.jobs.length}</strong> รายการ
                    {' · '}เป้า <strong style={{ color: '#2563EB' }}>{totalTarget.toLocaleString()}</strong> ชิ้น
                  </span>

                  {/* Status mini pills */}
                  <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                    {statusCounts.map(({ status, count }) => {
                      const cfg = STATUS_CFG[status as DisplayStatus]
                      return (
                        <span
                          key={status}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 10px', borderRadius: 50, fontSize: 11, fontWeight: 600,
                            background: cfg.badgeBg, color: cfg.badgeText, border: `1px solid ${cfg.badgeBorder}`,
                          }}
                        >
                          <i className={`fas ${cfg.icon}`} style={{ fontSize: 9 }} />
                          {cfg.label}: {count}
                        </span>
                      )
                    })}
                  </div>
                </button>

                {/* Table */}
                {isOpen && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                          <th style={thStyle}>โรงผลิต</th>
                          <th style={thStyle}>สินค้า</th>
                          <th style={{ ...thStyle, textAlign: 'center' }}>เป้า / เทแล้ว</th>
                          <th style={{ ...thStyle, textAlign: 'center' }}>ความคืบหน้า</th>
                          <th style={{ ...thStyle, textAlign: 'center' }}>สถานะ</th>
                          <th style={{ ...thStyle, textAlign: 'center' }}>ภาพถ่าย</th>
                          <th style={thStyle}>พนักงาน</th>
                          <th style={thStyle}>วันที่/เวลา</th>
                          <th style={{ ...thStyle, textAlign: 'center' }}>ถอดแบบได้</th>
                          {userRole === 'admin' && <th style={{ ...thStyle, textAlign: 'center' }}>จัดการ</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {group.jobs.map((job, idx) => {
                          const ds = job._displayStatus
                          const cfg = STATUS_CFG[ds]
                          const qcConfirmed = ds !== 'pending' && ds !== 'concrete_ordered' && ds !== 'cancelled'

                          // เป้า/เทแล้ว: แสดง qty_cast เฉพาะเมื่อ QC ยืนยันแล้ว
                          const castShown = qcConfirmed ? job.qty_cast : 0
                          const pct = getProgressPct(ds)

                          // หา concrete_order ล่าสุด
                          const latestCO = Array.isArray(job.concrete_orders) && job.concrete_orders.length > 0
                            ? job.concrete_orders.sort((a, b) =>
                                new Date(b.requested_at ?? 0).getTime() - new Date(a.requested_at ?? 0).getTime()
                              )[0]
                            : null

                          // พนักงาน: ใช้ผู้สั่งคอนกรีต ถ้าไม่มีใช้ worker
                          const requesterName = latestCO?.requester?.full_name ?? job.worker?.full_name ?? null

                          // วันที่/เวลา: ใช้เวลาสั่งคอนกรีต
                          const actionTime = latestCO?.requested_at ?? job.concrete_requested_at ?? job.cast_at ?? job.started_at

                          return (
                            <tr
                              key={job.id}
                              style={{
                                borderBottom: '1px solid #F3F4F6',
                                background: idx % 2 === 0 ? '#fff' : '#FAFAFA',
                                transition: 'background 0.1s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#F0F7FF')}
                              onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#FAFAFA')}
                            >
                              {/* Bed */}
                              <td style={{ padding: '12px 16px' }}>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  width: 36, height: 36, borderRadius: 8,
                                  background: cfg.kpiBg, border: `1px solid ${cfg.kpiBorder}`,
                                  fontWeight: 800, fontSize: 15, color: cfg.kpiText,
                                }}>
                                  {job.bed}
                                </span>
                              </td>

                              {/* Product */}
                              <td style={{ padding: '12px 16px' }}>
                                <div style={{ fontWeight: 700, color: '#111827', fontSize: 13, lineHeight: 1.3 }}>
                                  {job.plan_item?.product?.name ?? '—'}
                                </div>
                                <div style={{ fontSize: 10, color: '#9CA3AF', fontFamily: 'monospace', marginTop: 2 }}>
                                  {job.plan_item?.product?.code ?? ''}
                                </div>
                                {latestCO?.notes && (
                                  <div style={{ marginTop: 4, fontSize: 10, color: '#D97706', fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                    <i className="fas fa-exclamation-circle" style={{ marginTop: 2, flexShrink: 0 }} />
                                    <span>{latestCO.notes}</span>
                                  </div>
                                )}
                              </td>

                              {/* Target / Cast */}
                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                <span style={{ fontWeight: 800, fontSize: 14, color: qcConfirmed ? '#2563EB' : '#9CA3AF' }}>{castShown}</span>
                                <span style={{ color: '#9CA3AF', fontSize: 12 }}> / {job.qty_target}</span>
                                <div style={{ fontSize: 10, color: '#9CA3AF' }}>{job.plan_item?.product?.unit ?? 'ชิ้น'}</div>
                              </td>

                              {/* Progress */}
                              <td style={{ padding: '12px 16px', textAlign: 'center', minWidth: 120 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ flex: 1, height: 6, background: '#F3F4F6', borderRadius: 99, overflow: 'hidden' }}>
                                    <div style={{
                                      height: '100%', borderRadius: 99, transition: 'width 0.4s',
                                      background: pct === 100 ? '#10B981' : pct >= 60 ? '#8B5CF6' : '#2563EB',
                                      width: `${pct}%`,
                                    }} />
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? '#10B981' : '#2563EB', minWidth: 34 }}>
                                    {pct}%
                                  </span>
                                </div>
                              </td>

                              {/* Status Badge */}
                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5,
                                  padding: '4px 12px', borderRadius: 50, whiteSpace: 'nowrap',
                                  fontSize: 11, fontWeight: 700,
                                  background: cfg.badgeBg, color: cfg.badgeText, border: `1px solid ${cfg.badgeBorder}`,
                                }}>
                                  <i className={`fas ${cfg.icon}`} style={{ fontSize: 10 }} />
                                  {cfg.label}
                                </span>
                              </td>

                              {/* Photos */}
                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                  <button
                                    disabled={!job.photo_ready_url}
                                    onClick={() => job.photo_ready_url && setViewingPhotoUrl(job.photo_ready_url)}
                                    style={{
                                      background: job.photo_ready_url ? '#EFF6FF' : '#F3F4F6',
                                      color: job.photo_ready_url ? '#2563EB' : '#D1D5DB',
                                      border: '1px solid',
                                      borderColor: job.photo_ready_url ? '#BFDBFE' : '#E5E7EB',
                                      width: 28, height: 28, borderRadius: 6, cursor: job.photo_ready_url ? 'pointer' : 'not-allowed',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s'
                                    }}
                                    title="ภาพก่อนสั่งคอนกรีต"
                                  >
                                    <i className="fas fa-camera" style={{ fontSize: 12 }} />
                                  </button>
                                  <button
                                    disabled={!job.photo_cast_url}
                                    onClick={() => job.photo_cast_url && setViewingPhotoUrl(job.photo_cast_url)}
                                    style={{
                                      background: job.photo_cast_url ? '#F5F3FF' : '#F3F4F6',
                                      color: job.photo_cast_url ? '#7C3AED' : '#D1D5DB',
                                      border: '1px solid',
                                      borderColor: job.photo_cast_url ? '#C4B5FD' : '#E5E7EB',
                                      width: 28, height: 28, borderRadius: 6, cursor: job.photo_cast_url ? 'pointer' : 'not-allowed',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s'
                                    }}
                                    title="ภาพเทคอนกรีตแล้ว"
                                  >
                                    <i className="fas fa-camera" style={{ fontSize: 12 }} />
                                  </button>
                                </div>
                              </td>

                              {/* Worker / Requester / QC */}
                              <td style={{ padding: '12px 16px' }}>
                                {(() => {
                                  let employeeName = '—'
                                  let roleText = ''
                                  
                                  if (ds === 'pending') {
                                    employeeName = 'ยังไม่ระบุชื่อ'
                                  } else if (ds === 'concrete_ordered') {
                                    employeeName = requesterName ?? job.worker?.full_name ?? '—'
                                    roleText = 'Worker'
                                  } else {
                                    const qcInspector = Array.isArray(job.qc_inspection) ? job.qc_inspection[0]?.inspector?.full_name : null
                                    employeeName = qcInspector ?? requesterName ?? job.worker?.full_name ?? '—'
                                    roleText = qcInspector ? 'QC' : 'Worker'
                                  }

                                  if (employeeName === 'ยังไม่ระบุชื่อ' || employeeName === '—') {
                                    return <span style={{ color: '#D1D5DB', fontSize: 12 }}>{employeeName}</span>
                                  }

                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                      <div style={{
                                        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                                        background: roleText === 'QC' ? '#F5F3FF' : '#DBEAFE', 
                                        color: roleText === 'QC' ? '#7C3AED' : '#2563EB',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 10, fontWeight: 700,
                                      }}>
                                        {employeeName.charAt(0)}
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{employeeName}</span>
                                        <span style={{ fontSize: 10, color: '#9CA3AF' }}>{roleText}</span>
                                      </div>
                                    </div>
                                  )
                                })()}
                              </td>

                              {/* Date/Time (concrete order time) */}
                              <td style={{ padding: '12px 16px' }}>
                                {actionTime ? (
                                  <div style={{ fontSize: 11, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <i className="fas fa-clock" style={{ fontSize: 10, color: '#9CA3AF' }} />
                                    {fmtDate(actionTime)}
                                  </div>
                                ) : (
                                  <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>
                                )}
                              </td>

                              {/* Expected Demold */}
                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                {(() => {
                                  const expectedTime = job.expected_demold_at || (job.cast_at ? new Date(new Date(job.cast_at).getTime() + 20 * 60 * 60 * 1000).toISOString() : null)
                                  if (expectedTime) {
                                    return (
                                      <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                                        <i className="fas fa-calendar-check" style={{ marginRight: 4, fontSize: 10 }} />
                                        {fmtDate(expectedTime)}
                                      </div>
                                    )
                                  }
                                  return <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>
                                })()}
                              </td>

                              {/* Admin Actions */}
                              {userRole === 'admin' && (
                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                  {(ds === 'concrete_ordered' || ds === 'casting' || ds === 'curing' || ds === 'ready_demold') && (
                                    <button
                                      disabled={resettingJobId === job.id}
                                      onClick={() => handleResetJob(job.id, job.bed)}
                                      style={{
                                        background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: 'none',
                                        width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.2s', opacity: resettingJobId === job.id ? 0.5 : 1
                                      }}
                                      title="ลบและรีเซ็ตการสั่งคอนกรีต"
                                    >
                                      {resettingJobId === job.id ? <i className="fas fa-spinner fa-spin" style={{ fontSize: 12 }} /> : <i className="fas fa-undo-alt" style={{ fontSize: 12 }} />}
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>

                    {/* Group Footer */}
                    <div style={{
                      padding: '10px 20px', borderTop: '1px solid #F3F4F6',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: '#FAFAFA',
                    }}>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                        {group.jobs.length} รายการ ในใบสั่งผลิต {group.orderNumber}
                      </span>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                        เป้าหมายรวม:{' '}
                        <strong style={{ color: '#2563EB' }}>{totalTarget.toLocaleString()}</strong> ชิ้น
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
              </div>
            )
          )}

          {/* ── HISTORY TAB ── */}
          {tab === 'history' && (
            filteredHistoryGroups.length === 0 ? (
              <div style={{ padding: '80px 24px', textAlign: 'center' }}>
                <i className="fas fa-history" style={{ fontSize: 48, color: '#E5E7EB', display: 'block', marginBottom: 16 }} />
                <div style={{ fontSize: 16, fontWeight: 700, color: '#9CA3AF' }}>ไม่มีประวัติคิวงานเทคอนกรีต</div>
                <div style={{ fontSize: 13, color: '#D1D5DB', marginTop: 4 }}>งานที่เสร็จสมบูรณ์หรือ ERP Synced จะแสดงที่นี่</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {filteredHistoryGroups.map(group => {
                  const isOpen = expandedHistoryPlans.has(group.planId)
                  const totalTarget = group.jobs.reduce((s, j) => s + j.qty_target, 0)
                  const uniqueStatuses = Array.from(new Set(group.jobs.map(j => j._displayStatus)))
                  const statusCounts = uniqueStatuses.map(s => ({
                    status: s,
                    count: group.jobs.filter(j => j._displayStatus === s).length,
                  })).filter(x => x.count > 0)


                  return (
                    <div key={group.planId} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                      <button
                        onClick={() => toggleHistoryPlan(group.planId)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 16,
                          padding: '14px 20px', background: '#F9FAFB',
                          borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                          borderBottom: isOpen ? '1px solid #E5E7EB' : 'none',
                          cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <i className={`fas ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ fontSize: 12, color: '#9CA3AF', width: 14, flexShrink: 0 }} />
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: '#111827', letterSpacing: '0.03em' }}>
                          {group.orderNumber}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#6B7280', fontSize: 12 }}>
                          <i className="fas fa-calendar-alt" style={{ fontSize: 11, color: '#9CA3AF' }} />
                          วันที่แผน: <strong style={{ color: '#374151' }}>{fmtPlanDate(group.planDate)}</strong>
                        </div>
                        <span style={{ fontSize: 12, color: '#6B7280' }}>
                          <strong style={{ color: '#374151' }}>{group.jobs.length}</strong> รายการ
                          {' · '}เป้า <strong style={{ color: '#2563EB' }}>{totalTarget.toLocaleString()}</strong> ชิ้น
                        </span>
                        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                          {statusCounts.map(({ status, count }) => {
                            const cfg = STATUS_CFG[status as DisplayStatus]
                            return (
                              <span
                                key={status}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '2px 10px', borderRadius: 50, fontSize: 11, fontWeight: 600,
                                  background: cfg.badgeBg, color: cfg.badgeText, border: `1px solid ${cfg.badgeBorder}`,
                                }}
                              >
                                <i className={`fas ${cfg.icon}`} style={{ fontSize: 9 }} />
                                {cfg.label}: {count}
                              </span>
                            )
                          })}
                          {/* Show erp_synced badge if production_order is synced */}
                          {group.jobs.some(j => j.production_order?.status === 'erp_synced') && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 50, fontSize: 11, fontWeight: 600, background: '#F0FDF4', color: '#16A34A', border: '1px solid #86EFAC' }}>
                              <i className="fas fa-sync-alt" style={{ fontSize: 9 }} /> ERP Synced
                            </span>
                          )}
                        </div>
                      </button>

                      {isOpen && (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                                <th style={thStyle}>โรงผลิต</th>
                                <th style={thStyle}>สินค้า</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>เป้า / เทแล้ว</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>สถานะ</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>ภาพถ่าย</th>
                                <th style={thStyle}>พนักงาน</th>
                                <th style={thStyle}>วันที่/เวลา</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>ถอดแบบได้</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.jobs.map((job, idx) => {
                                const ds = job._displayStatus
                                const cfg = STATUS_CFG[ds]
                                const qcConfirmed = ds !== 'pending' && ds !== 'concrete_ordered' && ds !== 'cancelled'
                                const castShown = qcConfirmed ? job.qty_cast : 0
                                const latestCO = Array.isArray(job.concrete_orders) && job.concrete_orders.length > 0
                                  ? job.concrete_orders.sort((a, b) =>
                                      new Date(b.requested_at ?? 0).getTime() - new Date(a.requested_at ?? 0).getTime()
                                    )[0]
                                  : null
                                const requesterName = latestCO?.requester?.full_name ?? job.worker?.full_name ?? null
                                const actionTime = latestCO?.requested_at ?? job.concrete_requested_at ?? job.cast_at ?? job.started_at

                                return (
                                  <tr
                                    key={job.id}
                                    style={{
                                      borderBottom: '1px solid #F3F4F6',
                                      background: idx % 2 === 0 ? '#fff' : '#FAFAFA',
                                    }}
                                  >
                                    <td style={{ padding: '12px 16px' }}>
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        width: 36, height: 36, borderRadius: 8,
                                        background: cfg.kpiBg, border: `1px solid ${cfg.kpiBorder}`,
                                        fontWeight: 800, fontSize: 15, color: cfg.kpiText,
                                      }}>
                                        {job.bed}
                                      </span>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                      <div style={{ fontWeight: 700, color: '#111827', fontSize: 13 }}>{job.plan_item?.product?.name ?? '—'}</div>
                                      <div style={{ fontSize: 10, color: '#9CA3AF', fontFamily: 'monospace', marginTop: 2 }}>{job.plan_item?.product?.code ?? ''}</div>
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                      <span style={{ fontWeight: 800, fontSize: 14, color: qcConfirmed ? '#2563EB' : '#9CA3AF' }}>{castShown}</span>
                                      <span style={{ color: '#9CA3AF', fontSize: 12 }}> / {job.qty_target}</span>
                                      <div style={{ fontSize: 10, color: '#9CA3AF' }}>{job.plan_item?.product?.unit ?? 'ชิ้น'}</div>
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                        padding: '4px 12px', borderRadius: 50, whiteSpace: 'nowrap',
                                        fontSize: 11, fontWeight: 700,
                                        background: cfg.badgeBg, color: cfg.badgeText, border: `1px solid ${cfg.badgeBorder}`,
                                      }}>
                                        <i className={`fas ${cfg.icon}`} style={{ fontSize: 10 }} />
                                        {cfg.label}
                                        {job.production_order?.status === 'erp_synced' && (
                                          <span style={{ marginLeft: 4, fontSize: 9, background: '#D1FAE5', color: '#065F46', padding: '1px 5px', borderRadius: 4 }}>ERP</span>
                                        )}
                                      </span>
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                        <button
                                          disabled={!job.photo_ready_url}
                                          onClick={() => job.photo_ready_url && setViewingPhotoUrl(job.photo_ready_url)}
                                          style={{
                                            background: job.photo_ready_url ? '#EFF6FF' : '#F3F4F6',
                                            color: job.photo_ready_url ? '#2563EB' : '#D1D5DB',
                                            border: '1px solid', borderColor: job.photo_ready_url ? '#BFDBFE' : '#E5E7EB',
                                            width: 28, height: 28, borderRadius: 6, cursor: job.photo_ready_url ? 'pointer' : 'not-allowed',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          }}
                                          title="ภาพก่อนสั่งคอนกรีต"
                                        >
                                          <i className="fas fa-camera" style={{ fontSize: 12 }} />
                                        </button>
                                        <button
                                          disabled={!job.photo_cast_url}
                                          onClick={() => job.photo_cast_url && setViewingPhotoUrl(job.photo_cast_url)}
                                          style={{
                                            background: job.photo_cast_url ? '#F5F3FF' : '#F3F4F6',
                                            color: job.photo_cast_url ? '#7C3AED' : '#D1D5DB',
                                            border: '1px solid', borderColor: job.photo_cast_url ? '#C4B5FD' : '#E5E7EB',
                                            width: 28, height: 28, borderRadius: 6, cursor: job.photo_cast_url ? 'pointer' : 'not-allowed',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          }}
                                          title="ภาพเทคอนกรีตแล้ว"
                                        >
                                          <i className="fas fa-camera" style={{ fontSize: 12 }} />
                                        </button>
                                      </div>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                      {requesterName ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                          <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: '#DBEAFE', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                                            {requesterName.charAt(0)}
                                          </div>
                                          <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{requesterName}</span>
                                        </div>
                                      ) : <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>}
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                      {actionTime ? (
                                        <div style={{ fontSize: 11, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 5 }}>
                                          <i className="fas fa-clock" style={{ fontSize: 10, color: '#9CA3AF' }} />
                                          {fmtDate(actionTime)}
                                        </div>
                                      ) : <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>}
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                      {(() => {
                                        const expectedTime = job.expected_demold_at || (job.cast_at ? new Date(new Date(job.cast_at).getTime() + 20 * 60 * 60 * 1000).toISOString() : null)
                                        if (expectedTime) return (
                                          <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                                            <i className="fas fa-calendar-check" style={{ marginRight: 4, fontSize: 10 }} />
                                            {fmtDate(expectedTime)}
                                          </div>
                                        )
                                        return <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>
                                      })()}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                          <div style={{ padding: '10px 20px', borderTop: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFAFA' }}>
                            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{group.jobs.length} รายการ ในใบสั่งผลิต {group.orderNumber}</span>
                            <span style={{ fontSize: 11, color: '#9CA3AF' }}>เป้าหมายรวม: <strong style={{ color: '#2563EB' }}>{totalTarget.toLocaleString()}</strong> ชิ้น</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}

        </div>
      </div>

      {/* Image Viewer Modal */}
      {viewingPhotoUrl && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
            backdropFilter: 'blur(4px)'
          }}
          onClick={() => setViewingPhotoUrl(null)}
        >
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
            <button
              onClick={() => setViewingPhotoUrl(null)}
              style={{
                position: 'absolute', top: -16, right: -16,
                background: '#EF4444', color: '#fff', border: 'none',
                width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10000,
                fontSize: 16
              }}
              title="ปิด"
            >
              <i className="fas fa-times" />
            </button>
            <img
              src={viewingPhotoUrl}
              alt="ภาพถ่ายจากหน้างาน"
              style={{ 
                maxWidth: '100%', maxHeight: '85vh', 
                borderRadius: 12, objectFit: 'contain', background: '#000',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
              }}
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  )
}
