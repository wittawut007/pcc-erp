'use client'

import { useState, useMemo } from 'react'

interface DemoldingRecord {
  id: string
  demold_qty_good: number
  demold_qty_defect: number
  defect_reason: string | null
  defect_detail: string | null
  created_at: string
  job_order: {
    bed: string
    plan_item: { 
      product: { name: string; code?: string; category: string; unit: string } | null
      plan?: { id: string; plan_date: string; production_order_code?: string } | null
    } | null
  } | null
  qc_profile: { full_name: string } | null
}

interface SummaryRecord {
  demold_qty_good: number
  demold_qty_defect: number
  defect_reason: string | null
  created_at: string
}

const DEFECT_REASONS: Record<string, { label: string; color: string }> = {
  crack:     { label: 'แตก / ร้าว',      color: '#EF4444' },
  chip:      { label: 'บิ่น / มุมหัก',   color: '#F59E0B' },
  honeycomb: { label: 'Honeycomb',        color: '#3B82F6' },
  other:     { label: 'อื่นๆ',            color: '#8B5CF6' },
}



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

export default function QcClient({ records, summary }: { records: DemoldingRecord[]; summary: SummaryRecord[] }) {
  const [search, setSearch] = useState('')
  const [filterReason, setFilterReason] = useState('ทั้งหมด')
  const [dateRange, setDateRange] = useState<{ start: string, end: string }>({ start: '', end: '' })

  const displayRecords = records
  const displaySummary = summary

  // Filter Summary
  const filteredSummary = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return displaySummary
    return displaySummary.filter(r => {
      const createdDate = r.created_at.split('T')[0]
      let matchDate = true
      if (dateRange.start && dateRange.end) {
        if (createdDate < dateRange.start || createdDate > dateRange.end) matchDate = false
      }
      return matchDate
    })
  }, [displaySummary, dateRange])

  const filtered = useMemo(() => displayRecords.filter(r => {
    const planDate = r.job_order?.plan_item?.plan?.plan_date || r.created_at
    const datePart = planDate.split('T')[0].replace(/-/g, '')
    const orderNumber = r.job_order?.plan_item?.plan?.production_order_code || (r.job_order?.plan_item?.plan?.id ? `PO-${datePart}-001` : 'ไม่มีระบุใบสั่งผลิต')

    const matchSearch = !search || 
      (r.job_order?.plan_item?.product?.name?.toLowerCase().includes(search.toLowerCase())) ||
      (r.job_order?.plan_item?.product?.code?.toLowerCase().includes(search.toLowerCase())) ||
      (r.job_order?.bed?.toLowerCase().includes(search.toLowerCase())) ||
      orderNumber?.toLowerCase().includes(search.toLowerCase())

    const matchReason = filterReason === 'ทั้งหมด' || (filterReason === 'none' ? r.demold_qty_defect === 0 : r.defect_reason === filterReason)

    let matchDate = true
    const createdDate = r.created_at.split('T')[0]
    if (dateRange.start && dateRange.end) {
      if (createdDate < dateRange.start || createdDate > dateRange.end) matchDate = false
    }

    return matchSearch && matchReason && matchDate
  }), [displayRecords, search, filterReason, dateRange])

  const planGroups = useMemo(() => {
    const map = new Map<string, { planId: string; planDate: string; orderNumber: string; records: DemoldingRecord[] }>()
    filtered.forEach(r => {
      const plan = r.job_order?.plan_item?.plan
      const planId = plan?.id || 'unknown'
      const planDate = plan?.plan_date || r.created_at
      const datePart = planDate.split('T')[0].replace(/-/g, '')
      const orderNumber = plan?.production_order_code || (plan?.id ? `PO-${datePart}-001` : 'ไม่มีระบุใบสั่งผลิต')

      if (!map.has(planId)) {
        map.set(planId, { planId, planDate, orderNumber, records: [] })
      }
      map.get(planId)!.records.push(r)
    })
    return Array.from(map.values()).sort((a, b) => new Date(b.planDate).getTime() - new Date(a.planDate).getTime())
  }, [filtered])

  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set())
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

  // KPIs
  const totalGood = filteredSummary.reduce((s, r) => s + (r.demold_qty_good || 0), 0)
  const totalDefect = filteredSummary.reduce((s, r) => s + (r.demold_qty_defect || 0), 0)
  const totalAll = totalGood + totalDefect
  const defectRate = totalAll > 0 ? ((totalDefect / totalAll) * 100).toFixed(2) : '0.00'

  const defectByReason = useMemo(() => {
    const map: Record<string, number> = {}
    filteredSummary.forEach(r => {
      if ((r.demold_qty_defect || 0) > 0 && r.defect_reason) {
        map[r.defect_reason] = (map[r.defect_reason] ?? 0) + r.demold_qty_defect
      }
    })
    return map
  }, [filteredSummary])

  const maxDefect = Math.max(...Object.values(defectByReason), 1)

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const fmtPlanDate = (iso: string) =>
    new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 36px' }}>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'ชิ้นดีทั้งหมด', value: totalGood.toLocaleString(), icon: 'fa-check-circle', bg: 'var(--green-light)', color: 'var(--green)' },
          { label: 'ของเสียทั้งหมด', value: totalDefect.toLocaleString(), icon: 'fa-times-circle', bg: 'var(--red-light)', color: 'var(--red)' },
          { label: 'อัตราของเสียรวม', value: `${defectRate}%`, icon: 'fa-exclamation-triangle', bg: 'var(--amber-light)', color: 'var(--amber)' },
          { label: 'บันทึกถอดแบบ', value: displayRecords.length, icon: 'fa-clipboard-check', bg: 'var(--accent-light)', color: 'var(--accent)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className={`fas ${k.icon}`} style={{ color: k.color, fontSize: 18 }}></i>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Mid: Bar Chart + Table */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2.5fr)', gap: 16, marginBottom: 20 }}>

        {/* Defect Breakdown */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16 }}>สาเหตุของเสีย</div>
          {Object.entries(DEFECT_REASONS).map(([key, meta]) => {
            const count = defectByReason[key] ?? 0
            const pct = totalDefect > 0 ? Math.round((count / totalDefect) * 100) : 0
            return (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: meta.color, flexShrink: 0 }}></div>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{meta.label}</span>
                  </div>
                  <span style={{ fontWeight: 700, color: meta.color }}>{count} <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>({pct}%)</span></span>
                </div>
                <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${maxDefect > 0 ? (count / maxDefect) * 100 : 0}%`, height: '100%', background: meta.color, borderRadius: 3, transition: 'width 0.4s' }}></div>
                </div>
              </div>
            )
          })}

          <div style={{ marginTop: 20, padding: '12px', background: 'var(--bg)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>อัตราผ่าน QC</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: totalDefect === 0 ? 'var(--green)' : parseFloat(defectRate) < 5 ? 'var(--amber)' : 'var(--red)' }}>
              {totalAll > 0 ? (100 - parseFloat(defectRate)).toFixed(1) : '100.0'}%
            </div>
          </div>
        </div>

        {/* Table */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
              <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 11 }}></i>
              <input type="text" placeholder="ค้นหาสินค้า..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <select value={filterReason} onChange={e => setFilterReason(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', background: 'white' }}>
              <option value="ทั้งหมด">สาเหตุ: ทั้งหมด</option>
              <option value="none">ไม่มีของเสีย</option>
              {Object.entries(DEFECT_REASONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            
            {/* Date Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px' }}>
                <input 
                  type="date" 
                  value={dateRange.start} 
                  onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))}
                  style={{ border: 'none', background: 'transparent', fontSize: 12, outline: 'none', color: 'var(--text-main)', cursor: 'pointer' }}
                />
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>-</span>
                <input 
                  type="date" 
                  value={dateRange.end} 
                  onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))}
                  style={{ border: 'none', background: 'transparent', fontSize: 12, outline: 'none', color: 'var(--text-main)', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => setDateRange(getTodayRange())}
                  style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-main)', cursor: 'pointer', transition: 'all 0.15s' }}
                >วันนี้</button>
                <button
                  onClick={() => setDateRange(getThisWeekRange())}
                  style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-main)', cursor: 'pointer', transition: 'all 0.15s' }}
                >สัปดาห์นี้</button>
                <button
                  onClick={() => setDateRange(getThisMonthRange())}
                  style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-main)', cursor: 'pointer', transition: 'all 0.15s' }}
                >เดือนนี้</button>
                {(dateRange.start || dateRange.end) && (
                  <button
                    onClick={() => setDateRange({ start: '', end: '' })}
                    style={{ padding: '6px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', background: 'var(--red-light)', color: 'var(--red)', cursor: 'pointer', marginLeft: 4 }}
                    title="ล้างตัวกรอง"
                  >
                    <i className="fas fa-times" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px' }}>
            {planGroups.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                <i className="fas fa-clipboard-check" style={{ fontSize: 28, opacity: 0.2, display: 'block', marginBottom: 10 }}></i>
                ไม่พบข้อมูล
              </div>
            ) : (
              planGroups.map(group => {
                const isOpen = expandedPlans.has(group.planId)
                return (
                  <div key={group.planId} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                    <button
                      onClick={() => togglePlan(group.planId)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', background: 'var(--surface)',
                        borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: isOpen ? '1px solid var(--border)' : 'none',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <i className={`fas ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ fontSize: 12, color: 'var(--text-muted)', width: 14 }} />
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: 'var(--text-main)' }}>{group.orderNumber}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)', fontSize: 12 }}>
                        <i className="fas fa-calendar-alt" style={{ fontSize: 11, color: 'var(--text-muted)' }} /> วันที่แผน: <strong style={{ color: 'var(--text-main)' }}>{fmtPlanDate(group.planDate)}</strong>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        <strong style={{ color: 'var(--text-main)' }}>{group.records.length}</strong> รายการ
                      </span>
                    </button>
                    {isOpen && (
                      <div style={{ overflowX: 'auto', background: 'var(--surface)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: 'var(--bg)' }}>
                              {['โรงผลิต', 'สินค้า', 'ชิ้นดี', 'ของเสีย', 'สาเหตุ', 'พนักงาน', 'เวลา'].map((h, i) => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: i >= 2 && i <= 3 ? 'center' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {group.records.map((r, idx) => {
                              const reason = r.defect_reason ? DEFECT_REASONS[r.defect_reason] : null
                              return (
                                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                                  <td style={{ padding: '12px 16px' }}>
                                    <span style={{
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      width: 36, height: 36, borderRadius: 8,
                                      background: 'var(--accent-light)', border: '1px solid var(--accent)',
                                      fontWeight: 800, fontSize: 15, color: 'var(--accent)',
                                    }}>
                                      {r.job_order?.bed ?? '—'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '12px 16px' }}>
                                    <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: 13, lineHeight: 1.3 }}>
                                      {r.job_order?.plan_item?.product?.name ?? '—'}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                                      {r.job_order?.plan_item?.product?.code ?? ''}
                                    </div>
                                  </td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, fontSize: 14, color: 'var(--green)' }}>{r.demold_qty_good}</td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, fontSize: 14, color: (r.demold_qty_defect || 0) > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{r.demold_qty_defect}</td>
                                  <td style={{ padding: '12px 16px' }}>
                                    {reason ? (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '4px 10px', borderRadius: 6, background: `${reason.color}18`, color: reason.color, fontWeight: 700 }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: reason.color, flexShrink: 0, display: 'inline-block' }}></span>
                                        {reason.label}
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>{r.qc_profile?.full_name ?? '—'}</td>
                                  <td style={{ padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
