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
  'ถอดแบบ & QC':               { bg: 'var(--green-light)',  color: '#059669',        icon: 'fa-hammer' },
  'ถอดแบบ & QC (Mobile)':      { bg: 'var(--green-light)',  color: '#059669',        icon: 'fa-hammer' },
  'ปรับสต็อก FG':              { bg: 'var(--accent-light)', color: 'var(--accent)',  icon: 'fa-boxes' },
  'จัดส่งสินค้า (FG Out)':       { bg: '#FFF0F5',             color: '#C2185B',        icon: 'fa-truck' },
  'เทคอนกรีต':                 { bg: 'var(--indigo-light)', color: 'var(--indigo)',   icon: 'fa-industry' },
  'สั่งคอนกรีต':               { bg: '#EEF2FF',             color: '#4F46E5',        icon: 'fa-truck-monster' },
  'สั่งคอนกรีต (Mobile)':      { bg: '#EEF2FF',             color: '#4F46E5',        icon: 'fa-truck-monster' },
  'จ่ายคอนกรีต':               { bg: '#FEF3C7',             color: '#D97706',        icon: 'fa-fill-drip' },
  'รับคอนกรีต':               { bg: '#ECFDF5',             color: '#059669',        icon: 'fa-check-circle' },
  'เริ่มการบ่ม':               { bg: '#FEF3C7',             color: '#B45309',        icon: 'fa-clock' },
  'เบิกวัตถุดิบ':               { bg: 'var(--amber-light)',  color: '#B45309',        icon: 'fa-box-open' },
  'รับวัตถุดิบ (เพิ่ม)':         { bg: '#ECFDF5',             color: '#10B981',        icon: 'fa-plus' },
  'เบิกวัตถุดิบ (ลด)':          { bg: '#FEF2F2',             color: '#EF4444',        icon: 'fa-minus' },
  'ปรับสต็อก':                 { bg: '#F3F4F6',             color: '#6B7280',        icon: 'fa-sliders' },
  'บันทึกแผนการผลิต (confirmed)': { bg: '#EFF6FF',             color: '#2563EB',        icon: 'fa-calendar-check' },
  'บันทึกแผนการผลิต (draft)':     { bg: '#F3F4F6',             color: '#6B7280',        icon: 'fa-file-signature' },
  'DELETE_PLAN_BY_PO':         { bg: '#FEF2F2',             color: '#EF4444',        icon: 'fa-trash-can' },
  'รับสินค้า FG (FG In)':       { bg: '#ECFDF5',             color: '#059669',        icon: 'fa-box' },
}
const DEFAULT_ACTION = { bg: 'var(--bg)', color: 'var(--text-muted)', icon: 'fa-circle-dot' }

const MOCK_LOGS: ActivityLog[] = [
  { id: '1', user_id: null, action_type: 'ถอดแบบ & QC', entity_type: 'demolding_record', entity_id: null, detail: 'แผ่นพื้น PL50 4@4 | ดี 48 / เสีย 2 แผ่น', created_at: new Date().toISOString(), profile: { full_name: 'สมชาย ใจดี', role: 'worker', employee_code: 'EMP-001' } },
  { id: '3', user_id: null, action_type: 'เบิกวัตถุดิบ', entity_type: 'raw_materials', entity_id: null, detail: 'เหล็ก DB12 (40 เส้น)', created_at: new Date(Date.now() - 7200000).toISOString(), profile: { full_name: 'สมหญิง คลังเป๊ะ', role: 'planner', employee_code: 'EMP-003' } },
  { id: '4', user_id: null, action_type: 'ปรับสต็อก FG', entity_type: 'fg_inventory', entity_id: null, detail: 'เสาเข็ม .15x.15 2.00 ม.: 0 → 50 ต้น', created_at: new Date(Date.now() - 86400000).toISOString(), profile: { full_name: 'ผู้ดูแลระบบ', role: 'admin', employee_code: null } },
  { id: '5', user_id: null, action_type: 'จัดส่งสินค้า (FG Out)', entity_type: 'fg_inventory', entity_id: null, detail: 'แผ่นพื้น PL50: -120 แผ่น | DO-2025-001', created_at: new Date(Date.now() - 172800000).toISOString(), profile: { full_name: 'ผู้ดูแลระบบ', role: 'admin', employee_code: null } },
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  planner: 'Planner',
  worker: 'Worker',
  qc: 'QC',
  material: 'Material Staff',
  concrete: 'Concrete Staff',
  warehouse: 'Warehouse Staff',
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin:     { bg: 'var(--indigo-light)', color: 'var(--indigo)' },
  planner:   { bg: 'var(--accent-light)', color: 'var(--accent)' },
  worker:    { bg: 'var(--green-light)',  color: '#059669' },
  qc:        { bg: 'var(--amber-light)',  color: '#B45309' },
  material:  { bg: '#FFF7ED',             color: '#C2410C' },
  concrete:  { bg: '#EFF6FF',             color: '#1D4ED8' },
  warehouse: { bg: '#F5F3FF',             color: '#6D28D9' },
}

const ROLE_ICONS: Record<string, string> = {
  admin: 'fa-user-shield',
  planner: 'fa-calendar-alt',
  worker: 'fa-user-cog',
  qc: 'fa-clipboard-check',
  material: 'fa-cubes',
  concrete: 'fa-truck-field',
  warehouse: 'fa-warehouse',
}

const getLocalDateString = (isoOrDate: string | Date) => {
  const d = new Date(isoOrDate)
  const offsetMs = d.getTimezoneOffset() * 60 * 1000
  return new Date(d.getTime() - offsetMs).toISOString().split('T')[0]
}

export default function LogsClient({ logs }: { logs: ActivityLog[] }) {
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null)
  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState('ทั้งหมด')
  const [filterRole, setFilterRole] = useState('ทั้งหมด')
  const [filterRange, setFilterRange] = useState('7')
  const [startDate, setStartDate] = useState(getLocalDateString(new Date()))
  const [endDate, setEndDate] = useState(getLocalDateString(new Date()))

  const displayLogs = logs.length > 0 ? logs : MOCK_LOGS

  const actionTypes = useMemo(() => ['ทั้งหมด', ...Array.from(new Set(displayLogs.map(l => l.action_type)))], [displayLogs])

  const cutoff = useMemo(() => {
    if (filterRange === 'custom') return null
    const d = new Date()
    d.setDate(d.getDate() - parseInt(filterRange))
    return d
  }, [filterRange])

  const filteredWithoutRole = useMemo(() => displayLogs.filter(l => {
    const matchSearch = !search ||
      l.profile?.full_name.toLowerCase().includes(search.toLowerCase()) ||
      l.action_type.toLowerCase().includes(search.toLowerCase()) ||
      (l.detail ?? '').toLowerCase().includes(search.toLowerCase())
    const matchAction = filterAction === 'ทั้งหมด' || l.action_type === filterAction
    
    let matchDate = true
    if (filterRange === 'custom') {
      const logDate = getLocalDateString(l.created_at)
      matchDate = logDate >= startDate && logDate <= endDate
    } else if (cutoff) {
      matchDate = new Date(l.created_at) >= cutoff
    }
    return matchSearch && matchAction && matchDate
  }), [displayLogs, search, filterAction, cutoff, filterRange, startDate, endDate])

  const filtered = useMemo(() => {
    if (filterRole === 'ทั้งหมด') return filteredWithoutRole
    return filteredWithoutRole.filter(l => (l.profile?.role ?? 'worker') === filterRole)
  }, [filteredWithoutRole, filterRole])

  // Excel Export Handler using SheetJS
  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx')
      
      const dataToExport = filtered.map(log => ({
        'เวลา': new Date(log.created_at).toLocaleString('th-TH'),
        'ชื่อผู้ดำเนินงาน': log.profile?.full_name ?? 'ไม่ระบุ',
        'รหัสพนักงาน': log.profile?.employee_code ?? '-',
        'บทบาท': ROLE_LABELS[log.profile?.role ?? ''] ?? log.profile?.role ?? '-',
        'ประเภทกิจกรรม': log.action_type,
        'รายละเอียด': log.detail ?? '-',
        'รหัสอ้างอิง (Log ID)': log.id
      }))

      const worksheet = XLSX.utils.json_to_sheet(dataToExport)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'ประวัติการทำงาน')

      // Auto column widths
      const maxLens = Object.keys(dataToExport[0] || {}).map(key => {
        let maxVal = key.length
        dataToExport.forEach(row => {
          const val = String((row as any)[key] ?? '')
          if (val.length > maxVal) maxVal = val.length
        })
        return { wch: Math.min(Math.max(maxVal + 3, 10), 50) }
      })
      worksheet['!cols'] = maxLens

      XLSX.writeFile(workbook, `activity_logs_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (err) {
      console.error('Failed to export Excel:', err)
      alert('เกิดข้อผิดพลาดในการดาวน์โหลด Excel')
    }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  // Role summary based on filteredWithoutRole to keep pill counts stable
  const roleSummary = useMemo(() => {
    const map: Record<string, number> = {}
    filteredWithoutRole.forEach(l => {
      const r = l.profile?.role ?? 'worker'
      map[r] = (map[r] ?? 0) + 1
    })
    // Sort roles by count descending
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filteredWithoutRole])

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
            <option value="custom">เลือกวันที่เอง...</option>
            <option value="9999">ทั้งหมด</option>
          </select>

          {/* Calendar date ranges (shows when 'custom' is selected) */}
          {filterRange === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input 
                type="date" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)}
                style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', background: 'white' }} 
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ถึง</span>
              <input 
                type="date" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)}
                style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', background: 'white' }} 
              />
            </div>
          )}

          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {filtered.length} รายการ
          </span>
        </div>

        {/* Role Summary Pills & Excel Export */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {roleSummary.length > 0 ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {roleSummary.map(([roleName, count]) => {
                const label = ROLE_LABELS[roleName] ?? roleName
                const style = ROLE_COLORS[roleName] ?? { bg: 'var(--bg)', color: 'var(--text-muted)' }
                const icon = ROLE_ICONS[roleName] ?? 'fa-user'
                const isSelected = filterRole === roleName
                
                return (
                  <button 
                    key={roleName} 
                    onClick={() => setFilterRole(isSelected ? 'ทั้งหมด' : roleName)}
                    style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: 6, 
                      padding: '6px 14px', 
                      borderRadius: 20, 
                      border: 'none', 
                      cursor: 'pointer', 
                      fontSize: 11, 
                      fontWeight: 600, 
                      background: isSelected ? style.color : style.bg, 
                      color: isSelected ? 'white' : style.color,
                      transition: 'all 0.2s'
                    }}
                  >
                    <i className={`fas ${icon}`} style={{ fontSize: 10 }}></i>
                    {label} <span style={{ fontWeight: 400, opacity: 0.8 }}>({count})</span>
                  </button>
                )
              })}
            </div>
          ) : <div />}

          {/* Export Excel Button (Placed in the circled area on the right) */}
          <button 
            onClick={handleExportExcel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 16px',
              border: '1px solid #10B981',
              background: '#10B981',
              color: 'white',
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = '#059669'
              e.currentTarget.style.borderColor = '#059669'
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = '#10B981'
              e.currentTarget.style.borderColor = '#10B981'
            }}
          >
            <i className="fas fa-file-excel" style={{ fontSize: 11 }}></i>
            Export Excel
          </button>
        </div>

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
                  <tr key={log.id} 
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-[var(--bg)] transition-colors cursor-pointer"
                    style={{ cursor: 'pointer' }}
                  >
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

      {/* Minimalist Log Details Modal */}
      {selectedLog && (() => {
        const role = selectedLog.profile?.role ?? 'worker'
        const roleStyle = ROLE_COLORS[role] ?? { bg: 'var(--bg)', color: 'var(--text-muted)' }
        const actionStyle = ACTION_COLORS[selectedLog.action_type] ?? DEFAULT_ACTION
        return (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() => setSelectedLog(null)}
          >
            <div 
              style={{
                background: '#ffffff',
                borderRadius: 16,
                padding: '32px',
                width: '90%',
                maxWidth: '520px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>รายละเอียดบันทึกกิจกรรม</span>
                <button 
                  onClick={() => setSelectedLog(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 20,
                    cursor: 'pointer',
                    color: '#9CA3AF',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'color 0.2s',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.color = '#374151')}
                  onMouseOut={(e) => (e.currentTarget.style.color = '#9CA3AF')}
                >
                  ✕
                </button>
              </div>

              {/* List of Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Time */}
                <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', paddingBottom: 12, alignItems: 'center' }}>
                  <span style={{ width: '120px', fontSize: 13, fontWeight: 500, color: '#6B7280', flexShrink: 0 }}>เวลาบันทึก</span>
                  <span style={{ fontSize: 13, color: '#111827' }}>
                    {new Date(selectedLog.created_at).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'medium' })}
                  </span>
                </div>

                {/* Employee Name */}
                <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', paddingBottom: 12, alignItems: 'center' }}>
                  <span style={{ width: '120px', fontSize: 13, fontWeight: 500, color: '#6B7280', flexShrink: 0 }}>ผู้ดำเนินงาน</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{selectedLog.profile?.full_name ?? 'ไม่ระบุ'}</span>
                    {selectedLog.profile?.employee_code && (
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>รหัสพนักงาน: {selectedLog.profile.employee_code}</span>
                    )}
                  </div>
                </div>

                {/* Role */}
                <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', paddingBottom: 12, alignItems: 'center' }}>
                  <span style={{ width: '120px', fontSize: 13, fontWeight: 500, color: '#6B7280', flexShrink: 0 }}>บทบาท</span>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: roleStyle.bg, color: roleStyle.color }}>
                      {ROLE_LABELS[role] ?? role}
                    </span>
                  </div>
                </div>

                {/* Action Type */}
                <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', paddingBottom: 12, alignItems: 'center' }}>
                  <span style={{ width: '120px', fontSize: 13, fontWeight: 500, color: '#6B7280', flexShrink: 0 }}>ประเภทกิจกรรม</span>
                  <div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 9px', borderRadius: 4, background: actionStyle.bg, color: actionStyle.color, fontWeight: 600 }}>
                      <i className={`fas ${actionStyle.icon}`} style={{ fontSize: 10 }}></i>
                      {selectedLog.action_type}
                    </span>
                  </div>
                </div>

                {/* Detail Text */}
                <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', paddingBottom: 12 }}>
                  <span style={{ width: '120px', fontSize: 13, fontWeight: 500, color: '#6B7280', flexShrink: 0 }}>รายละเอียด</span>
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>
                    {selectedLog.detail ?? '—'}
                  </div>
                </div>

                {/* Reference Database ID */}
                <div style={{ display: 'flex', paddingBottom: 6, alignItems: 'center' }}>
                  <span style={{ width: '120px', fontSize: 12, fontWeight: 500, color: '#9CA3AF', flexShrink: 0 }}>รหัสอ้างอิง (Log ID)</span>
                  <span style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace', wordBreak: 'break-all' }}>{selectedLog.id}</span>
                </div>
              </div>

              {/* Bottom Actions */}
              <div style={{ marginTop: 28, display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => setSelectedLog(null)}
                  style={{
                    padding: '8px 20px',
                    background: '#F3F4F6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = '#E5E7EB')}
                  onMouseOut={(e) => (e.currentTarget.style.background = '#F3F4F6')}
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
