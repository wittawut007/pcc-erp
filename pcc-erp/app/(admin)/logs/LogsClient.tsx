'use client'

import { useState, useMemo } from 'react'

interface ActivityLog {
  id: string
  user_id: string | null
  action_type: string
  entity_type: string
  entity_id: string | null
  detail: string | null
  created_at: string
  profile: { full_name: string; role: string; employee_code: string | null } | null
}

const ACTION_COLORS: Record<string, { bg: string; color: string; icon: string }> = {
  'ถอดแบบ & QC':         { bg: 'var(--green-light)',  color: '#059669',        icon: 'fa-hammer' },
  'ปรับสต็อก FG':        { bg: 'var(--accent-light)', color: 'var(--accent)',  icon: 'fa-boxes' },
  'จัดส่งสินค้า (FG Out)': { bg: '#FFF0F5', color: '#C2185B', icon: 'fa-truck' },
  'เทคอนกรีต':           { bg: 'var(--indigo-light)', color: 'var(--indigo)', icon: 'fa-industry' },
  'บันทึกยอด WIP':       { bg: '#FFF7ED',             color: '#EA580C',        icon: 'fa-layer-group' },
  'เบิกวัตถุดิบ':         { bg: 'var(--amber-light)',  color: '#B45309',        icon: 'fa-box-open' },
}
const DEFAULT_ACTION = { bg: 'var(--bg)', color: 'var(--text-muted)', icon: 'fa-circle-dot' }

const MOCK_LOGS: ActivityLog[] = [
  { id: '1', user_id: null, action_type: 'ถอดแบบ & QC', entity_type: 'demolding_record', entity_id: null, detail: 'แผ่นพื้น PL50 4@4 | ดี 48 / เสีย 2 แผ่น', created_at: new Date().toISOString(), profile: { full_name: 'สมชาย ใจดี', role: 'worker', employee_code: 'EMP-001' } },
  { id: '2', user_id: null, action_type: 'บันทึกยอด WIP', entity_type: 'wip_inventory', entity_id: null, detail: 'โครงเสาเข็ม (+50 ชุด)', created_at: new Date(Date.now() - 3600000).toISOString(), profile: { full_name: 'วิชัย รักดี', role: 'worker', employee_code: 'EMP-002' } },
  { id: '3', user_id: null, action_type: 'เบิกวัตถุดิบ', entity_type: 'raw_materials', entity_id: null, detail: 'เหล็ก DB12 (40 เส้น)', created_at: new Date(Date.now() - 7200000).toISOString(), profile: { full_name: 'สมหญิง คลังเป๊ะ', role: 'planner', employee_code: 'EMP-003' } },
  { id: '4', user_id: null, action_type: 'ปรับสต็อก FG', entity_type: 'fg_inventory', entity_id: null, detail: 'เสาเข็ม .15x.15 2.00 ม.: 0 → 50 ต้น', created_at: new Date(Date.now() - 86400000).toISOString(), profile: { full_name: 'ผู้ดูแลระบบ', role: 'admin', employee_code: null } },
  { id: '5', user_id: null, action_type: 'จัดส่งสินค้า (FG Out)', entity_type: 'fg_inventory', entity_id: null, detail: 'แผ่นพื้น PL50: -120 แผ่น | DO-2025-001', created_at: new Date(Date.now() - 172800000).toISOString(), profile: { full_name: 'ผู้ดูแลระบบ', role: 'admin', employee_code: null } },
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  planner: 'Planner',
  worker: 'Worker',
  qc: 'QC',
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin:   { bg: 'var(--indigo-light)', color: 'var(--indigo)' },
  planner: { bg: 'var(--accent-light)', color: 'var(--accent)' },
  worker:  { bg: 'var(--green-light)',  color: '#059669' },
  qc:      { bg: 'var(--amber-light)',  color: '#B45309' },
}

export default function LogsClient({ logs }: { logs: ActivityLog[] }) {
  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState('ทั้งหมด')
  const [filterRange, setFilterRange] = useState('7')

  const displayLogs = logs.length > 0 ? logs : MOCK_LOGS

  const actionTypes = useMemo(() => ['ทั้งหมด', ...Array.from(new Set(displayLogs.map(l => l.action_type)))], [displayLogs])

  const cutoff = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - parseInt(filterRange))
    return d
  }, [filterRange])

  const filtered = useMemo(() => displayLogs.filter(l => {
    const matchSearch = !search ||
      l.profile?.full_name.toLowerCase().includes(search.toLowerCase()) ||
      l.action_type.toLowerCase().includes(search.toLowerCase()) ||
      (l.detail ?? '').toLowerCase().includes(search.toLowerCase())
    const matchAction = filterAction === 'ทั้งหมด' || l.action_type === filterAction
    const matchDate = new Date(l.created_at) >= cutoff
    return matchSearch && matchAction && matchDate
  }), [displayLogs, search, filterAction, cutoff])

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  // Action summary
  const actionSummary = useMemo(() => {
    const map: Record<string, number> = {}
    filtered.forEach(l => { map[l.action_type] = (map[l.action_type] ?? 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 4)
  }, [filtered])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 36px' }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'บันทึกทั้งหมด', value: filtered.length, icon: 'fa-list', color: 'var(--accent)' },
          { label: 'วันนี้', value: filtered.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length, icon: 'fa-calendar-day', color: 'var(--green)' },
          { label: 'ผู้ใช้งาน', value: new Set(filtered.map(l => l.user_id)).size, icon: 'fa-users', color: 'var(--indigo)' },
          { label: 'ประเภทกิจกรรม', value: new Set(filtered.map(l => l.action_type)).size, icon: 'fa-tags', color: 'var(--amber)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: `${k.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className={`fas ${k.icon}`} style={{ color: k.color, fontSize: 16 }}></i>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main card */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}></i>
            <input type="text" placeholder="ค้นหาชื่อ, กิจกรรม, รายละเอียด..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', paddingLeft: 33, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', background: 'white', maxWidth: 180 }}>
            {actionTypes.map(a => <option key={a} value={a}>{a === 'ทั้งหมด' ? 'กิจกรรม: ทั้งหมด' : a}</option>)}
          </select>
          <select value={filterRange} onChange={e => setFilterRange(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', background: 'white' }}>
            <option value="1">วันนี้</option>
            <option value="7">7 วันล่าสุด</option>
            <option value="30">30 วันล่าสุด</option>
            <option value="9999">ทั้งหมด</option>
          </select>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {filtered.length} รายการ
          </span>
        </div>

        {/* Action Summary Pills */}
        {actionSummary.length > 0 && (
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {actionSummary.map(([type, count]) => {
              const style = ACTION_COLORS[type] ?? DEFAULT_ACTION
              return (
                <button key={type} onClick={() => setFilterAction(type === filterAction ? 'ทั้งหมด' : type)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: filterAction === type ? style.color : style.bg, color: filterAction === type ? 'white' : style.color }}>
                  <i className={`fas ${style.icon}`} style={{ fontSize: 10 }}></i>
                  {type} <span style={{ fontWeight: 400, opacity: 0.8 }}>({count})</span>
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
                {['เวลา', 'พนักงาน', 'บทบาท', 'กิจกรรม', 'รายละเอียด'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((log, i) => {
                const actionStyle = ACTION_COLORS[log.action_type] ?? DEFAULT_ACTION
                const role = log.profile?.role ?? 'worker'
                const roleStyle = ROLE_COLORS[role] ?? { bg: 'var(--bg)', color: 'var(--text-muted)' }
                return (
                  <tr key={log.id} className="hover:bg-[var(--bg)] transition-colors">
                    <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="far fa-clock" style={{ color: 'var(--accent)', fontSize: 11 }}></i>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{fmtDate(log.created_at)}</span>
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                          {(log.profile?.full_name ?? '?').charAt(0)}
                        </div>
                        <span style={{ fontWeight: 600 }}>{log.profile?.full_name ?? 'ไม่ระบุ'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: roleStyle.bg, color: roleStyle.color }}>
                        {ROLE_LABELS[role] ?? role}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 9px', borderRadius: 4, background: actionStyle.bg, color: actionStyle.color, fontWeight: 600 }}>
                        <i className={`fas ${actionStyle.icon}`} style={{ fontSize: 10 }}></i>
                        {log.action_type}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.detail ?? '—'}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <i className="fas fa-history" style={{ fontSize: 32, opacity: 0.15, display: 'block', marginBottom: 12 }}></i>
                    ไม่พบประวัติการทำงาน
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
