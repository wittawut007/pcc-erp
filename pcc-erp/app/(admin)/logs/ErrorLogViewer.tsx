'use client'

import { useState, useMemo, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ErrorLog {
  id: string
  created_at: string
  action: string
  error_msg: string
  error_code: string | null
  user_id: string | null
  context: Record<string, unknown> | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** จัดกลุ่ม action name เป็น category สั้นๆ สำหรับ filter */
function getCategory(action: string): string {
  if (action.includes('concrete') || action.includes('Concrete')) return 'คอนกรีต'
  if (action.includes('qc') || action.includes('Qc') || action.includes('QC')) return 'QC'
  if (action.includes('material') || action.includes('Material')) return 'วัตถุดิบ'
  if (action.includes('Plan') || action.includes('plan')) return 'แผนผลิต'
  if (action.includes('reset') || action.includes('Reset') || action.includes('nuclear') || action.includes('Nuclear') || action.includes('purge') || action.includes('Purge')) return 'Reset/Purge'
  if (action.includes('warehouse') || action.includes('FGReceipt')) return 'คลังสินค้า'
  if (action.includes('settings') || action.includes('Stats') || action.includes('Usage')) return 'ตั้งค่า'
  return 'อื่นๆ'
}

const CATEGORY_COLORS: Record<string, { bg: string; color: string; icon: string }> = {
  'คอนกรีต':   { bg: '#EEF2FF', color: '#4F46E5', icon: 'fa-industry' },
  'QC':         { bg: '#ECFDF5', color: '#059669', icon: 'fa-clipboard-check' },
  'วัตถุดิบ':   { bg: '#FFF7ED', color: '#C2410C', icon: 'fa-box-open' },
  'แผนผลิต':   { bg: '#EFF6FF', color: '#2563EB', icon: 'fa-calendar-check' },
  'Reset/Purge':{ bg: '#FEF2F2', color: '#DC2626', icon: 'fa-triangle-exclamation' },
  'คลังสินค้า': { bg: '#F5F3FF', color: '#6D28D9', icon: 'fa-warehouse' },
  'ตั้งค่า':    { bg: '#F3F4F6', color: '#374151', icon: 'fa-gear' },
  'อื่นๆ':      { bg: '#F9FAFB', color: '#6B7280', icon: 'fa-circle-dot' },
}

function fmtDateFull(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'เมื่อกี้'
  if (mins < 60) return `${mins} นาทีที่แล้ว`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`
  const days = Math.floor(hours / 24)
  return `${days} วันที่แล้ว`
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ErrorLogViewer({ logs }: { logs: ErrorLog[] }) {
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('ทั้งหมด')
  const [filterRange, setFilterRange] = useState('7')
  const [selectedLog, setSelectedLog] = useState<ErrorLog | null>(null)
  const [copied, setCopied] = useState(false)

  // Categories จาก data จริง
  const categories = useMemo(() => {
    const cats = Array.from(new Set(logs.map(l => getCategory(l.action))))
    return ['ทั้งหมด', ...cats.sort()]
  }, [logs])

  // Cutoff date
  const cutoff = useMemo(() => {
    if (filterRange === 'all') return null
    const d = new Date()
    d.setDate(d.getDate() - parseInt(filterRange))
    return d
  }, [filterRange])

  // Filtered logs
  const filtered = useMemo(() => {
    return logs.filter(l => {
      const matchSearch = !search ||
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.error_msg.toLowerCase().includes(search.toLowerCase()) ||
        (l.error_code ?? '').toLowerCase().includes(search.toLowerCase()) ||
        JSON.stringify(l.context ?? {}).toLowerCase().includes(search.toLowerCase())
      const matchCat = filterCategory === 'ทั้งหมด' || getCategory(l.action) === filterCategory
      const matchDate = !cutoff || new Date(l.created_at) >= cutoff
      return matchSearch && matchCat && matchDate
    })
  }, [logs, search, filterCategory, cutoff])

  // KPI
  const todayCount = useMemo(() =>
    logs.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length
  , [logs])

  const uniqueActions = useMemo(() => new Set(logs.map(l => l.action)).size, [logs])
  const withCode = useMemo(() => logs.filter(l => l.error_code).length, [logs])

  // Copy context to clipboard
  const handleCopyContext = useCallback(async (log: ErrorLog) => {
    const text = JSON.stringify(
      { action: log.action, error_msg: log.error_msg, error_code: log.error_code, context: log.context, created_at: log.created_at },
      null, 2
    )
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 36px' }}>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'Error ทั้งหมด', value: logs.length, icon: 'fa-triangle-exclamation', color: '#DC2626', bg: '#FEF2F2' },
          { label: 'วันนี้', value: todayCount, icon: 'fa-calendar-day', color: '#D97706', bg: '#FFFBEB' },
          { label: 'Action ที่พบปัญหา', value: uniqueActions, icon: 'fa-code', color: '#6D28D9', bg: '#F5F3FF' },
          { label: 'มี DB Error Code', value: withCode, icon: 'fa-database', color: '#2563EB', bg: '#EFF6FF' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className={`fas ${k.icon}`} style={{ color: k.color, fontSize: 16 }} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {logs.length === 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '72px 24px', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <i className="fas fa-shield-check" style={{ fontSize: 32, color: '#10B981' }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
            ระบบทำงานปกติ ไม่มี Error
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Error จาก Server Actions จะปรากฏที่นี่โดยอัตโนมัติ
          </div>
        </div>
      )}

      {/* Main card */}
      {logs.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>

          {/* Toolbar */}
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <i className="fas fa-search" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }} />
              <input
                type="text"
                placeholder="ค้นหา action, error message, context..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: 33, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box', background: 'var(--bg)' }}
              />
            </div>

            {/* Category filter */}
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', background: 'white' }}
            >
              {categories.map(c => <option key={c} value={c}>{c === 'ทั้งหมด' ? 'หมวด: ทั้งหมด' : c}</option>)}
            </select>

            {/* Date range */}
            <select
              value={filterRange}
              onChange={e => setFilterRange(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', background: 'white' }}
            >
              <option value="1">วันนี้</option>
              <option value="7">7 วันล่าสุด</option>
              <option value="30">30 วันล่าสุด</option>
              <option value="all">ทั้งหมด</option>
            </select>

            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {filtered.length} รายการ
            </span>
          </div>

          {/* Category Pills */}
          {categories.length > 2 && (
            <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {categories.filter(c => c !== 'ทั้งหมด').map(cat => {
                const style = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS['อื่นๆ']
                const isSelected = filterCategory === cat
                const catCount = logs.filter(l => getCategory(l.action) === cat).length
                return (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(isSelected ? 'ทั้งหมด' : cat)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 600,
                      background: isSelected ? style.color : style.bg,
                      color: isSelected ? 'white' : style.color,
                      transition: 'all 0.18s',
                    }}
                  >
                    <i className={`fas ${style.icon}`} style={{ fontSize: 9 }} />
                    {cat}
                    <span style={{ fontWeight: 400, opacity: 0.75 }}>({catCount})</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['เวลา', 'Action', 'Error Message', 'Code', 'Context'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => {
                  const cat = getCategory(log.action)
                  const catStyle = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS['อื่นๆ']
                  const hasContext = log.context && Object.keys(log.context).length > 0
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Time */}
                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDateShort(log.created_at)}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.65, marginTop: 1 }}>{timeAgo(log.created_at)}</div>
                      </td>

                      {/* Action */}
                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '2px 8px', borderRadius: 4, background: catStyle.bg, color: catStyle.color, fontWeight: 700, width: 'fit-content' }}>
                            <i className={`fas ${catStyle.icon}`} style={{ fontSize: 9 }} />
                            {cat}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                            {log.action.replace('/activityLog', '')}
                          </span>
                        </div>
                      </td>

                      {/* Error Message */}
                      <td style={{ padding: '11px 14px', maxWidth: 300 }}>
                        <div style={{ fontSize: 12, color: '#DC2626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                          {log.error_msg}
                        </div>
                      </td>

                      {/* Error Code */}
                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                        {log.error_code ? (
                          <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#FEF2F2', color: '#DC2626' }}>
                            {log.error_code}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                        )}
                      </td>

                      {/* Context preview */}
                      <td style={{ padding: '11px 14px' }}>
                        {hasContext ? (
                          <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#6D28D9', background: '#F5F3FF', padding: '2px 8px', borderRadius: 4, display: 'inline-block', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {JSON.stringify(log.context)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                      <i className="fas fa-magnifying-glass" style={{ fontSize: 28, opacity: 0.15, display: 'block', marginBottom: 10 }} />
                      ไม่พบ Error ที่ตรงกับเงื่อนไข
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Detail Modal ──────────────────────────────────────────────── */}
      {selectedLog && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={() => setSelectedLog(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.15)', boxSizing: 'border-box' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', borderRadius: '16px 16px 0 0', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fas fa-bug" style={{ color: '#DC2626', fontSize: 16 }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>รายละเอียด Error</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{fmtDateFull(selectedLog.created_at)}</div>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                style={{ width: 30, height: 30, border: 'none', background: 'var(--bg)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Action + Category */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Action</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {(() => {
                    const cat = getCategory(selectedLog.action)
                    const s = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS['อื่นๆ']
                    return (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '3px 10px', borderRadius: 6, background: s.bg, color: s.color, fontWeight: 700 }}>
                        <i className={`fas ${s.icon}`} style={{ fontSize: 10 }} /> {cat}
                      </span>
                    )
                  })()}
                  <code style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#1A1B23', background: '#F3F4F6', padding: '3px 10px', borderRadius: 6 }}>
                    {selectedLog.action}
                  </code>
                </div>
              </div>

              {/* Error Message */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Error Message</div>
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#991B1B', fontFamily: 'monospace', lineHeight: 1.6, wordBreak: 'break-word' }}>
                  {selectedLog.error_msg}
                </div>
              </div>

              {/* Error Code */}
              {selectedLog.error_code && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>PostgreSQL Error Code</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <code style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, padding: '4px 12px', borderRadius: 6, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                      {selectedLog.error_code}
                    </code>
                    {/* Common error code hints */}
                    {selectedLog.error_code === '23503' && (
                      <span style={{ fontSize: 11, color: '#6B7280', background: '#F9FAFB', padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                        Foreign Key Violation
                      </span>
                    )}
                    {selectedLog.error_code === '23505' && (
                      <span style={{ fontSize: 11, color: '#6B7280', background: '#F9FAFB', padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                        Unique Constraint Violation
                      </span>
                    )}
                    {selectedLog.error_code === '42P01' && (
                      <span style={{ fontSize: 11, color: '#6B7280', background: '#F9FAFB', padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                        Table Not Found
                      </span>
                    )}
                    {selectedLog.error_code === 'PGRST116' && (
                      <span style={{ fontSize: 11, color: '#6B7280', background: '#F9FAFB', padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                        Row Not Found (single)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Context */}
              {selectedLog.context && Object.keys(selectedLog.context).length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Context (ข้อมูลช่วย Debug)</div>
                  <div style={{ position: 'relative' }}>
                    <pre style={{ background: '#1E1E2E', color: '#CDD6F4', borderRadius: 10, padding: '14px 16px', fontSize: 12, fontFamily: 'monospace', overflowX: 'auto', lineHeight: 1.7, margin: 0 }}>
                      {JSON.stringify(selectedLog.context, null, 2)}
                    </pre>
                    <button
                      onClick={() => handleCopyContext(selectedLog)}
                      style={{ position: 'absolute', top: 8, right: 8, padding: '4px 10px', background: copied ? '#10B981' : 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'background 0.2s' }}
                    >
                      <i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`} style={{ fontSize: 9 }} />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              {/* Meta */}
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                  <span style={{ color: 'var(--text-muted)', width: 70, flexShrink: 0 }}>Log ID</span>
                  <code style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: 10, wordBreak: 'break-all' }}>{selectedLog.id}</code>
                </div>
                {selectedLog.user_id && (
                  <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)', width: 70, flexShrink: 0 }}>User ID</span>
                    <code style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: 10, wordBreak: 'break-all' }}>{selectedLog.user_id}</code>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedLog(null)}
                style={{ padding: '8px 20px', background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
