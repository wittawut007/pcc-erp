'use client'

import { useState, useMemo } from 'react'

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
  plan_item: {
    qty_target: number
    bed: string
    product: { id: string; code: string; name: string; category: string; unit: string }
    plan?: { plan_date: string }
  } | null
  worker: { full_name: string; employee_code: string | null } | null
}

interface Worker {
  id: string
  full_name: string
  employee_code: string | null
}

// ── Status config (inline styles for consistency with production-order page) ──
const STATUS_CONFIG = {
  pending: {
    label: 'รอเริ่ม',
    icon: 'fa-clock',
    badgeBg: '#F3F4F6', badgeBorder: '#E5E7EB', badgeText: '#6B7280',
    kpiBg: '#F9FAFB', kpiBorder: '#E5E7EB', kpiText: '#6B7280',
    ring: 'rgba(107,114,128,0.2)',
    next: 'casting' as string | null,
    nextLabel: 'เริ่มเทปูน',
  },
  casting: {
    label: 'กำลังเท',
    icon: 'fa-truck-monster',
    badgeBg: '#DBEAFE', badgeBorder: '#BFDBFE', badgeText: '#1D4ED8',
    kpiBg: '#EFF6FF', kpiBorder: '#BFDBFE', kpiText: '#2563EB',
    ring: 'rgba(37,99,235,0.2)',
    next: 'curing' as string | null,
    nextLabel: 'บ่มปูนแล้ว',
  },
  curing: {
    label: 'กำลังบ่ม',
    icon: 'fa-hourglass-half',
    badgeBg: '#FEF3C7', badgeBorder: '#FDE68A', badgeText: '#B45309',
    kpiBg: '#FFFBEB', kpiBorder: '#FDE68A', kpiText: '#D97706',
    ring: 'rgba(217,119,6,0.2)',
    next: 'ready_demold' as string | null,
    nextLabel: 'พร้อมถอดแบบ',
  },
  ready_demold: {
    label: 'พร้อมถอดแบบ',
    icon: 'fa-check-circle',
    badgeBg: '#D1FAE5', badgeBorder: '#A7F3D0', badgeText: '#065F46',
    kpiBg: '#ECFDF5', kpiBorder: '#A7F3D0', kpiText: '#059669',
    ring: 'rgba(5,150,105,0.2)',
    next: 'demolded' as string | null,
    nextLabel: 'ถอดแบบแล้ว',
  },
  demolded: {
    label: 'ถอดแบบแล้ว',
    icon: 'fa-cubes',
    badgeBg: '#ECFDF5', badgeBorder: '#6EE7B7', badgeText: '#065F46',
    kpiBg: '#F0FDF4', kpiBorder: '#86EFAC', kpiText: '#16A34A',
    ring: 'rgba(22,163,74,0.2)',
    next: null,
    nextLabel: '',
  },
  cancelled: {
    label: 'ยกเลิก',
    icon: 'fa-times-circle',
    badgeBg: '#FEE2E2', badgeBorder: '#FECACA', badgeText: '#991B1B',
    kpiBg: '#FEF2F2', kpiBorder: '#FECACA', kpiText: '#DC2626',
    ring: 'rgba(220,38,38,0.2)',
    next: null,
    nextLabel: '',
  },
} as const

type StatusKey = keyof typeof STATUS_CONFIG

const beds = ['all', '1', '2', '3', '4']

export default function JobOrdersClient({ jobOrders: initial, workers }: { jobOrders: JobOrder[]; workers: Worker[] }) {
  const jobs = initial
  const [filterStatus, setFilterStatus] = useState<StatusKey | 'all'>('all')
  const [filterBed, setFilterBed] = useState('all')
  const [search, setSearch] = useState('')

  // ── KPI counts ──
  const statusCounts = useMemo(() => ({
    pending:      jobs.filter(j => j.status === 'pending').length,
    casting:      jobs.filter(j => j.status === 'casting').length,
    curing:       jobs.filter(j => j.status === 'curing').length,
    ready_demold: jobs.filter(j => j.status === 'ready_demold').length,
    demolded:     jobs.filter(j => j.status === 'demolded').length,
  }), [jobs])

  // ── Filtered rows ──
  const filtered = useMemo(() => jobs.filter(j => {
    const matchStatus = filterStatus === 'all' || j.status === filterStatus
    const matchBed = filterBed === 'all' || j.bed === filterBed
    const matchSearch = !search.trim() ||
      (j.plan_item?.product?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (j.plan_item?.product?.code ?? '').toLowerCase().includes(search.toLowerCase()) ||
      j.bed.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchBed && matchSearch
  }), [jobs, filterStatus, filterBed, search])

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const getElapsed = (startIso: string | null) => {
    if (!startIso) return null
    const diff = Date.now() - new Date(startIso).getTime()
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    return h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`
  }

  // ── KPI card data ──
  const kpiCards = [
    { key: 'pending'      as StatusKey, label: 'รอเริ่ม' },
    { key: 'casting'      as StatusKey, label: 'กำลังเท' },
    { key: 'curing'       as StatusKey, label: 'กำลังบ่ม' },
    { key: 'ready_demold' as StatusKey, label: 'พร้อมถอดแบบ' },
    { key: 'demolded'     as StatusKey, label: 'ถอดแบบแล้ว' },
  ]

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: '#F7F8FA', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {kpiCards.map(({ key, label }) => {
          const cfg = STATUS_CONFIG[key]
          const isActive = filterStatus === key
          const count = statusCounts[key as keyof typeof statusCounts]
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(isActive ? 'all' : key)}
              style={{
                padding: '16px 18px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                border: `2px solid ${isActive ? cfg.kpiBorder : '#E5E7EB'}`,
                background: isActive ? cfg.kpiBg : '#fff',
                boxShadow: isActive ? `0 0 0 3px ${cfg.ring}` : '0 1px 3px rgba(0,0,0,0.05)',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <i className={`fas ${cfg.icon}`} style={{ fontSize: 16, color: isActive ? cfg.kpiText : '#9CA3AF' }} />
                <span style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: isActive ? cfg.kpiText : '#374151' }}>
                  {count}
                </span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.03em' }}>{label}</div>
            </button>
          )
        })}
      </div>

      {/* ── Table Card ── */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* Table Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>

          {/* Bed filter pills */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', marginRight: 2 }}>โรงผลิต:</span>
            {beds.map(b => (
              <button
                key={b}
                onClick={() => setFilterBed(b)}
                style={{
                  padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: filterBed === b ? '1px solid transparent' : '1px solid #E5E7EB',
                  background: filterBed === b ? '#2563EB' : '#F9FAFB',
                  color: filterBed === b ? '#fff' : '#6B7280',
                  transition: 'all 0.12s',
                }}
              >
                {b === 'all' ? 'ทุกโรงผลิต' : `โรงผลิต ${b}`}
              </button>
            ))}
          </div>

          {/* Row count */}
          <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 4 }}>
            แสดง <strong style={{ color: '#374151' }}>{filtered.length}</strong> รายการ
          </span>

          {/* Search — push right */}
          <div style={{ marginLeft: 'auto', position: 'relative' }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#9CA3AF' }} />
            <input
              type="text"
              placeholder="ค้นหาสินค้า, รหัส, โรงผลิต..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                paddingLeft: 32, paddingRight: 12, height: 34, width: 230,
                border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12,
                outline: 'none', color: '#374151', background: '#F9FAFB',
              }}
            />
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '80px 24px', textAlign: 'center' }}>
              <i className="fas fa-clipboard-list" style={{ fontSize: 48, color: '#E5E7EB', display: 'block', marginBottom: 16 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#9CA3AF' }}>ไม่พบรายการ</div>
              <div style={{ fontSize: 12, color: '#D1D5DB', marginTop: 4 }}>ลองปรับตัวกรองสถานะหรือโรงผลิต</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                  <th style={thStyle}>โรงผลิต</th>
                  <th style={thStyle}>สินค้า</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>เป้า / เทแล้ว</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>ความคืบหน้า</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>สถานะ</th>
                  <th style={thStyle}>พนักงาน</th>
                  <th style={thStyle}>เริ่ม / เทปูน</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>ถอดแบบได้</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((job, idx) => {
                  const cfg = STATUS_CONFIG[job.status as StatusKey] ?? STATUS_CONFIG.pending
                  const pct = job.qty_target > 0 ? Math.round((job.qty_cast / job.qty_target) * 100) : 0
                  const elapsed = getElapsed(job.cast_at || job.started_at)

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
                      <td style={{ padding: '12px 20px' }}>
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
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ fontWeight: 700, color: '#111827', fontSize: 13, lineHeight: 1.3 }}>
                          {job.plan_item?.product?.name ?? '—'}
                        </div>
                        <div style={{ fontSize: 10, color: '#9CA3AF', fontFamily: 'monospace', marginTop: 2 }}>
                          {job.plan_item?.product?.code ?? ''}
                          {job.plan_item?.plan?.plan_date && <span style={{ marginLeft: 6, color: '#6B7280' }}>| แผน: {fmtDate(job.plan_item.plan.plan_date).split(',')[0]}</span>}
                        </div>
                        {elapsed && (
                          <div style={{ fontSize: 10, color: cfg.kpiText, marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <i className="far fa-clock" style={{ fontSize: 9 }} />
                            {elapsed}
                          </div>
                        )}
                      </td>

                      {/* Target / Cast */}
                      <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: '#2563EB' }}>{job.qty_cast}</span>
                        <span style={{ color: '#9CA3AF', fontSize: 12 }}> / {job.qty_target}</span>
                        <div style={{ fontSize: 10, color: '#9CA3AF' }}>{job.plan_item?.product?.unit ?? 'ชิ้น'}</div>
                      </td>

                      {/* Progress bar */}
                      <td style={{ padding: '12px 20px', textAlign: 'center', minWidth: 120 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: '#F3F4F6', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 99, transition: 'width 0.3s',
                              background: pct === 100 ? '#10B981' : '#2563EB',
                              width: `${pct}%`,
                            }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? '#10B981' : '#2563EB', minWidth: 32 }}>
                            {pct}%
                          </span>
                        </div>
                      </td>

                      {/* Status badge */}
                      <td style={{ padding: '12px 20px', textAlign: 'center' }}>
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

                      {/* Worker */}
                      <td style={{ padding: '12px 20px' }}>
                        {job.worker ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <div style={{
                              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                              background: '#DBEAFE', color: '#2563EB',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 700,
                            }}>
                              {job.worker.full_name.charAt(0)}
                            </div>
                            <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{job.worker.full_name}</span>
                          </div>
                        ) : (
                          <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>
                        )}
                      </td>

                      {/* Timeline */}
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ fontSize: 11, color: '#6B7280', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {job.started_at && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <i className="fas fa-play-circle" style={{ fontSize: 10, color: '#2563EB', width: 12 }} />
                              <span>{fmtDate(job.started_at)}</span>
                            </div>
                          )}
                          {job.cast_at && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <i className="fas fa-fill-drip" style={{ fontSize: 10, color: '#F59E0B', width: 12 }} />
                              <span>{fmtDate(job.cast_at)}</span>
                            </div>
                          )}
                          {!job.started_at && !job.cast_at && (
                            <span style={{ color: '#D1D5DB' }}>—</span>
                          )}
                        </div>
                      </td>

                      {/* Expected demold */}
                      <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                        {job.expected_demold_at ? (
                          <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                            <i className="fas fa-calendar-check" style={{ marginRight: 4, fontSize: 10 }} />
                            {fmtDate(job.expected_demold_at)}
                          </div>
                        ) : (
                          <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Table Footer */}
        {filtered.length > 0 && (
          <div style={{
            padding: '10px 20px', borderTop: '1px solid #F3F4F6',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#FAFAFA', flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>
              แสดง {filtered.length} จาก {jobs.length} รายการทั้งหมด
            </span>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>
              รวมเป้าหมาย:{' '}
              <strong style={{ color: '#2563EB' }}>
                {filtered.reduce((s, j) => s + j.qty_target, 0).toLocaleString()}
              </strong>{' '}ชิ้น
              {' '}|{' '}เทแล้ว:{' '}
              <strong style={{ color: '#10B981' }}>
                {filtered.reduce((s, j) => s + j.qty_cast, 0).toLocaleString()}
              </strong>{' '}ชิ้น
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Shared styles ──
const thStyle: React.CSSProperties = {
  padding: '11px 20px',
  textAlign: 'left',
  fontWeight: 700,
  color: '#6B7280',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: '#6B7280',
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
  background: '#fff',
  color: '#111827',
  boxSizing: 'border-box',
}
