'use client'

import { useState, useMemo } from 'react'

interface Job {
  id: string; bed: string; qty_cast: number; qty_target: number
  status: string; cast_at: string | null; expected_demold_at: string | null
  plan_item: {
    product: { id: string; code?: string; name: string; category: string; unit: string } | null
    plan?: { id: string; plan_date: string; production_order_code: string } | null
  } | null
  worker: { full_name: string } | null
}

interface DemoldRecord {
  id: string; qty_good: number; qty_defect: number; defect_reason: string | null
  defect_detail: string | null; created_at: string
  job_order: { bed: string; plan_item: { product: { name: string; code?: string; unit: string } | null; plan?: { id: string; plan_date: string } | null } | null } | null
  worker: { full_name: string } | null
}

interface Worker { id: string; full_name: string; employee_code: string | null }

const DEFECT_REASONS = [
  { value: 'crack',      label: 'แตก / ร้าว' },
  { value: 'chip',       label: 'บิ่น / มุมหัก' },
  { value: 'honeycomb',  label: 'Honeycomb (รูพรุน)' },
  { value: 'other',      label: 'อื่นๆ' },
]

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

export default function DemoldingClient({ readyJobs, recentDemolding, workers }: { readyJobs: Job[]; recentDemolding: DemoldRecord[]; workers: Worker[] }) {
  const [tab, setTab] = useState<'queue' | 'history'>('queue')
  const [jobs, setJobs] = useState<Job[]>(readyJobs)
  const [records, setRecords] = useState<DemoldRecord[]>(recentDemolding)
  const [searchQuery, setSearchQuery] = useState('')
  
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set())

  const isReady = (job: Job) => {
    if (job.status === 'ready_demold') return true;
    if (job.status === 'curing') {
      const expectedTime = job.expected_demold_at || (job.cast_at ? new Date(new Date(job.cast_at).getTime() + 20 * 60 * 60 * 1000).toISOString() : null);
      return expectedTime && new Date(expectedTime) <= new Date();
    }
    return false;
  }

  // --- KPIs Data ---
  const countReady = jobs.filter(j => isReady(j)).length
  const countCuring = jobs.length - countReady
  const countDemolded = records.length
  const qtyGood = records.reduce((sum, r) => sum + (r.qty_good || 0), 0)
  const qtyDefect = records.reduce((sum, r) => sum + (r.qty_defect || 0), 0)

  const kpis = [
    { label: 'รอถอดแบบ', value: countCuring, icon: 'fa-hourglass-half', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
    { label: 'พร้อมถอดแบบ', value: countReady, icon: 'fa-check-circle', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
    { label: 'ถอดแบบแล้ว', value: countDemolded, icon: 'fa-cubes', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
    { label: 'สินค้าดี', value: qtyGood, icon: 'fa-box-open', color: '#16A34A', bg: '#F0FDF4', border: '#86EFAC' },
    { label: 'สินค้าเสีย', value: qtyDefect, icon: 'fa-times-circle', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  ]

  // --- Grouping ---
  type PlanGroup = {
    planId: string
    planDate: string
    orderNumber: string
    jobs: Job[]
  }

  const filteredJobs = useMemo(() => {
    if (!searchQuery) return jobs
    const q = searchQuery.toLowerCase()
    return jobs.filter(j => {
      const planDate = j.plan_item?.plan?.plan_date || new Date().toISOString()
      const datePart = planDate.split('T')[0].replace(/-/g, '')
      const orderNumber = `PO-${datePart}-001`.toLowerCase()
      
      return (
        orderNumber.includes(q) ||
        (j.plan_item?.product?.name || '').toLowerCase().includes(q) ||
        (j.bed || '').toLowerCase().includes(q) ||
        (j.worker?.full_name || '').toLowerCase().includes(q)
      )
    })
  }, [jobs, searchQuery])

  const planGroups = useMemo(() => {
    const map = new Map<string, PlanGroup>()
    filteredJobs.forEach(j => {
      const plan = j.plan_item?.plan
      // Fallback if plan info is missing from older data
      const planId = plan?.id || 'unknown'
      const planDate = plan?.plan_date || new Date().toISOString()
      const datePart = planDate.split('T')[0].replace(/-/g, '')
      const orderNumber = plan?.production_order_code || `PO-${datePart}-001`

      if (!map.has(planId)) {
        map.set(planId, { planId, planDate, orderNumber, jobs: [] })
      }
      map.get(planId)!.jobs.push(j)
    })
    return Array.from(map.values()).sort((a, b) => new Date(b.planDate).getTime() - new Date(a.planDate).getTime())
  }, [filteredJobs])

  const togglePlan = (planId: string) => {
    setExpandedPlans(prev => {
      const next = new Set(prev)
      next.has(planId) ? next.delete(planId) : next.add(planId)
      return next
    })
  }

  const allPlanIds = useMemo(() => new Set(planGroups.map(g => g.planId)), [planGroups])
  const [initialized, setInitialized] = useState(false)
  if (!initialized && planGroups.length > 0) {
    setExpandedPlans(allPlanIds)
    setInitialized(true)
  }

  const [expandedHistoryPlans, setExpandedHistoryPlans] = useState<Set<string>>(new Set())
  const toggleHistoryPlan = (planId: string) => {
    setExpandedHistoryPlans(prev => {
      const next = new Set(prev)
      next.has(planId) ? next.delete(planId) : next.add(planId)
      return next
    })
  }

  type HistoryGroup = {
    planId: string
    planDate: string
    orderNumber: string
    records: DemoldRecord[]
  }

  const filteredRecords = useMemo(() => {
    if (!searchQuery) return records
    const q = searchQuery.toLowerCase()
    return records.filter(r => {
      const planDate = r.job_order?.plan_item?.plan?.plan_date || r.created_at
      const datePart = planDate.split('T')[0].replace(/-/g, '')
      const orderNumber = r.job_order?.plan_item?.plan?.id ? `PO-${datePart}-001`.toLowerCase() : 'ไม่มีระบุใบสั่งผลิต'
      
      return (
        orderNumber.includes(q) ||
        (r.job_order?.plan_item?.product?.name || '').toLowerCase().includes(q) ||
        (r.job_order?.bed || '').toLowerCase().includes(q) ||
        (r.worker?.full_name || '').toLowerCase().includes(q)
      )
    })
  }, [records, searchQuery])

  const historyGroups = useMemo(() => {
    const map = new Map<string, HistoryGroup>()
    filteredRecords.forEach(r => {
      const plan = r.job_order?.plan_item?.plan
      const planId = plan?.id || 'unknown_history'
      const planDate = plan?.plan_date || r.created_at
      const datePart = planDate.split('T')[0].replace(/-/g, '')
      const orderNumber = plan?.id ? `PO-${datePart}-001` : 'ไม่มีระบุใบสั่งผลิต'

      if (!map.has(planId)) {
        map.set(planId, { planId, planDate, orderNumber, records: [] })
      }
      map.get(planId)!.records.push(r)
    })
    return Array.from(map.values()).sort((a, b) => new Date(b.planDate).getTime() - new Date(a.planDate).getTime())
  }, [filteredRecords])

  const allHistoryPlanIds = useMemo(() => new Set(historyGroups.map(g => g.planId)), [historyGroups])
  const [historyInitialized, setHistoryInitialized] = useState(false)
  if (!historyInitialized && historyGroups.length > 0) {
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
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: '#fff', border: `1px solid ${k.border}`, borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: k.bg, color: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
              <i className={`fas ${k.icon}`} />
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, color: '#111827' }}>{k.value}</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4, fontWeight: 600 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search Bar */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#9CA3AF' }} />
          <input
            type="text"
            placeholder="ค้นหาสินค้า, ใบสั่งผลิต, โรงผลิต, หรือชื่อพนักงาน..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 32, paddingRight: 12, height: 36, width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12, outline: 'none', color: '#374151', background: '#F9FAFB', boxSizing: 'border-box' }}
          />
        </div>
        <span style={{ fontSize: 12, color: '#9CA3AF', whiteSpace: 'nowrap' }}>
          พบ <strong style={{ color: '#374151' }}>{tab === 'queue' ? filteredJobs.length : filteredRecords.length}</strong> รายการ
        </span>
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 4, background: '#F9FAFB' }}>
          <button style={TAB_STYLE(tab === 'queue')} onClick={() => setTab('queue')}>
            <i className="fas fa-list-ul" />
            คิวรออยู่ {jobs.length > 0 && <span style={{ background: '#EF4444', color: '#fff', borderRadius: 50, padding: '2px 8px', fontSize: 11, marginLeft: 4 }}>{jobs.length}</span>}
          </button>
          <button style={TAB_STYLE(tab === 'history')} onClick={() => setTab('history')}>
            <i className="fas fa-history" /> ย้อนหลัง
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: tab === 'queue' ? '20px' : 0 }}>
          {tab === 'queue' && (
            planGroups.length === 0 ? (
              <div style={{ padding: '80px 24px', textAlign: 'center' }}>
                <i className="fas fa-check-circle" style={{ fontSize: 48, color: '#10B981', display: 'block', marginBottom: 16 }} />
                <div style={{ fontSize: 16, fontWeight: 700, color: '#374151' }}>ไม่มีคิวรอดำเนินการ</div>
                <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4 }}>คุณถอดแบบครบทุกงานแล้ว</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {planGroups.map(group => {
                  const isOpen = expandedPlans.has(group.planId)
                  return (
                    <div key={group.planId} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                      <button
                        onClick={() => togglePlan(group.planId)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', background: '#F9FAFB', 
                          borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: isOpen ? '1px solid #E5E7EB' : 'none',
                          cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <i className={`fas ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ fontSize: 12, color: '#9CA3AF', width: 14 }} />
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: '#111827' }}>{group.orderNumber}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#6B7280', fontSize: 12 }}>
                          <i className="fas fa-calendar-alt" style={{ fontSize: 11, color: '#9CA3AF' }} /> วันที่แผน: <strong style={{ color: '#374151' }}>{fmtPlanDate(group.planDate)}</strong>
                        </div>
                        <span style={{ fontSize: 12, color: '#6B7280' }}>
                          <strong style={{ color: '#374151' }}>{group.jobs.length}</strong> รายการ
                        </span>
                      </button>

                      {isOpen && (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr style={{ background: '#FAFAFA', borderBottom: '2px solid #E5E7EB' }}>
                                <th style={thStyle}>โรงผลิต</th>
                                <th style={thStyle}>สินค้า</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>จำนวน</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>ถอดได้</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>สถานะ</th>
                                <th style={thStyle}>พนักงาน</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.jobs.map((job, idx) => {
                                const ready = isReady(job)
                                return (
                                  <tr key={job.id} style={{ borderBottom: '1px solid #F3F4F6', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                                    <td style={{ padding: '12px 16px' }}>
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        width: 36, height: 36, borderRadius: 8,
                                        background: ready ? '#ECFDF5' : '#FFFBEB',
                                        border: `1px solid ${ready ? '#A7F3D0' : '#FDE68A'}`,
                                        fontWeight: 800, fontSize: 15, color: ready ? '#059669' : '#D97706',
                                      }}>
                                        {job.bed}
                                      </span>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                      <div style={{ fontWeight: 700, color: '#111827', fontSize: 13, lineHeight: 1.3 }}>
                                        {job.plan_item?.product?.name ?? '—'}
                                      </div>
                                      <div style={{ fontSize: 10, color: '#9CA3AF', fontFamily: 'monospace', marginTop: 2 }}>
                                        {job.plan_item?.product?.code ?? ''}
                                      </div>
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#2563EB' }}>
                                      {job.qty_cast} <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 400 }}>{job.plan_item?.product?.unit}</span>
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                      {(() => {
                                        const expectedTime = job.expected_demold_at || (job.cast_at ? new Date(new Date(job.cast_at).getTime() + 20 * 60 * 60 * 1000).toISOString() : null)
                                        if (expectedTime) {
                                          return (
                                            <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                                              <i className="fas fa-calendar-check" style={{ marginRight: 4 }} />
                                              {fmtDate(expectedTime)}
                                            </div>
                                          )
                                        }
                                        return <span style={{ color: '#D1D5DB' }}>—</span>
                                      })()}
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                      <span style={{
                                        padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 700,
                                        background: ready ? '#D1FAE5' : '#FEF3C7', color: ready ? '#065F46' : '#B45309', border: `1px solid ${ready ? '#A7F3D0' : '#FDE68A'}`,
                                      }}>
                                        {ready ? <><i className="fas fa-check-circle" style={{ marginRight: 4 }} /> พร้อมถอดแบบ</> : <><i className="fas fa-hourglass-half" style={{ marginRight: 4 }} /> กำลังบ่ม</>}
                                      </span>
                                    </td>
                                    <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: 12 }}>
                                      {job.worker?.full_name ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#E0E7FF', color: '#4338CA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                                            {job.worker.full_name.charAt(0)}
                                          </div>
                                          <span style={{ fontWeight: 600, color: '#4F46E5' }}>{job.worker.full_name}</span>
                                        </div>
                                      ) : '—'}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}

          {tab === 'history' && (
            historyGroups.length === 0 ? (
              <div style={{ padding: '80px 24px', textAlign: 'center' }}>
                <i className="fas fa-history" style={{ fontSize: 48, color: '#E5E7EB', display: 'block', marginBottom: 16 }} />
                <div style={{ fontSize: 16, fontWeight: 700, color: '#9CA3AF' }}>ไม่มีประวัติการถอดแบบ</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {historyGroups.map(group => {
                  const isOpen = expandedHistoryPlans.has(group.planId)
                  return (
                    <div key={group.planId} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                      <button
                        onClick={() => toggleHistoryPlan(group.planId)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', background: '#F9FAFB', 
                          borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: isOpen ? '1px solid #E5E7EB' : 'none',
                          cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <i className={`fas ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ fontSize: 12, color: '#9CA3AF', width: 14 }} />
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: '#111827' }}>{group.orderNumber}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#6B7280', fontSize: 12 }}>
                          <i className="fas fa-calendar-alt" style={{ fontSize: 11, color: '#9CA3AF' }} /> วันที่แผน: <strong style={{ color: '#374151' }}>{fmtPlanDate(group.planDate)}</strong>
                        </div>
                        <span style={{ fontSize: 12, color: '#6B7280' }}>
                          <strong style={{ color: '#374151' }}>{group.records.length}</strong> รายการ
                        </span>
                      </button>

                      {isOpen && (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr style={{ background: '#FAFAFA', borderBottom: '2px solid #E5E7EB' }}>
                                <th style={thStyle}>เวลาบันทึก</th>
                                <th style={thStyle}>โรงผลิต</th>
                                <th style={thStyle}>สินค้า</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>ดี</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>เสีย</th>
                                <th style={thStyle}>สาเหตุ</th>
                                <th style={thStyle}>พนักงาน</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.records.map((r, idx) => (
                                <tr key={r.id} style={{ borderBottom: '1px solid #F3F4F6', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                                  <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: 12 }}>{fmtDate(r.created_at)}</td>
                                  <td style={{ padding: '12px 16px' }}>
                                    <span style={{
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      width: 36, height: 36, borderRadius: 8,
                                      background: '#EFF6FF', border: '1px solid #BFDBFE',
                                      fontWeight: 800, fontSize: 15, color: '#2563EB',
                                    }}>
                                      {r.job_order?.bed}
                                    </span>
                                  </td>
                                  <td style={{ padding: '12px 16px' }}>
                                    <div style={{ fontWeight: 700, color: '#111827', fontSize: 13, lineHeight: 1.3 }}>
                                      {r.job_order?.plan_item?.product?.name ?? '—'}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#9CA3AF', fontFamily: 'monospace', marginTop: 2 }}>
                                      {r.job_order?.plan_item?.product?.code ?? ''}
                                    </div>
                                  </td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center', color: '#10B981', fontWeight: 800 }}>{r.qty_good}</td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center', color: r.qty_defect > 0 ? '#EF4444' : '#9CA3AF', fontWeight: 800 }}>{r.qty_defect}</td>
                                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#6B7280' }}>{r.defect_reason ? DEFECT_REASONS.find(x => x.value === r.defect_reason)?.label : '—'}</td>
                                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#6B7280' }}>
                                    {r.worker?.full_name ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#E0E7FF', color: '#4338CA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                                          {r.worker.full_name.charAt(0)}
                                        </div>
                                        <span style={{ fontWeight: 600, color: '#4F46E5' }}>{r.worker.full_name}</span>
                                      </div>
                                    ) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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
    </div>
  )
}
