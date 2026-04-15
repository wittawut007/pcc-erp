'use client'

import { useState, useMemo } from 'react'

interface DemoldingRecord {
  id: string
  qty_good: number
  qty_defect: number
  defect_reason: string | null
  defect_detail: string | null
  created_at: string
  job_order: {
    bed: string
    plan_item: { product: { name: string; category: string; unit: string } | null } | null
  } | null
  worker: { full_name: string } | null
}

interface SummaryRecord {
  qty_good: number
  qty_defect: number
  defect_reason: string | null
  created_at: string
}

const DEFECT_REASONS: Record<string, { label: string; color: string }> = {
  crack:     { label: 'แตก / ร้าว',      color: '#EF4444' },
  chip:      { label: 'บิ่น / มุมหัก',   color: '#F59E0B' },
  honeycomb: { label: 'Honeycomb',        color: '#3B82F6' },
  other:     { label: 'อื่นๆ',            color: '#8B5CF6' },
}

const MOCK_RECORDS: DemoldingRecord[] = [
  { id: '1', qty_good: 48, qty_defect: 2, defect_reason: 'crack', defect_detail: 'ขอบด้านซ้าย', created_at: new Date().toISOString(), job_order: { bed: 'A', plan_item: { product: { name: 'แผ่นพื้น PL50 4@4', category: 'A13 แผ่นพื้นตัน', unit: 'แผ่น' } } }, worker: { full_name: 'สมชาย ใจดี' } },
  { id: '2', qty_good: 50, qty_defect: 0, defect_reason: null, defect_detail: null, created_at: new Date(Date.now() - 3600000).toISOString(), job_order: { bed: 'B', plan_item: { product: { name: 'เสาเข็ม .15x.15 2.00 ม.', category: 'A41 เสาเข็ม', unit: 'ต้น' } } }, worker: { full_name: 'วิชัย รักดี' } },
  { id: '3', qty_good: 37, qty_defect: 3, defect_reason: 'chip', defect_detail: null, created_at: new Date(Date.now() - 7200000).toISOString(), job_order: { bed: 'C', plan_item: { product: { name: 'ผนังรั้วสำเร็จรูป 0.50x2.90 ม.', category: 'A30 ผนังรั้วสำเร็จรูป', unit: 'แผ่น' } } }, worker: { full_name: 'มานะ ถอดเก่ง' } },
  { id: '4', qty_good: 22, qty_defect: 3, defect_reason: 'honeycomb', defect_detail: 'บริเวณก้น', created_at: new Date(Date.now() - 86400000).toISOString(), job_order: { bed: 'A', plan_item: { product: { name: 'กำแพงกันดิน Type 1', category: 'A42 กำแพงกันดิน', unit: 'ชิ้น' } } }, worker: { full_name: 'สมชาย ใจดี' } },
  { id: '5', qty_good: 115, qty_defect: 5, defect_reason: 'other', defect_detail: null, created_at: new Date(Date.now() - 172800000).toISOString(), job_order: { bed: 'D', plan_item: { product: { name: 'เสารั้ว 0.15x0.15 1.60 ม.', category: 'A35 รั้วสำเร็จรูป', unit: 'ต้น' } } }, worker: { full_name: 'วิชัย รักดี' } },
]

const MOCK_SUMMARY: SummaryRecord[] = MOCK_RECORDS.map(r => ({ qty_good: r.qty_good, qty_defect: r.qty_defect, defect_reason: r.defect_reason, created_at: r.created_at }))

export default function QcClient({ records, summary }: { records: DemoldingRecord[]; summary: SummaryRecord[] }) {
  const [search, setSearch] = useState('')
  const [filterReason, setFilterReason] = useState('ทั้งหมด')
  const [filterRange, setFilterRange] = useState('7')

  const displayRecords = records.length > 0 ? records : MOCK_RECORDS
  const displaySummary = summary.length > 0 ? summary : MOCK_SUMMARY

  // Filter
  const cutoff = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - parseInt(filterRange))
    return d
  }, [filterRange])

  const filtered = useMemo(() => displayRecords.filter(r => {
    const matchSearch = !search || r.job_order?.plan_item?.product?.name.toLowerCase().includes(search.toLowerCase())
    const matchReason = filterReason === 'ทั้งหมด' || (filterReason === 'none' ? r.qty_defect === 0 : r.defect_reason === filterReason)
    const matchDate = new Date(r.created_at) >= cutoff
    return matchSearch && matchReason && matchDate
  }), [displayRecords, search, filterReason, cutoff])

  // KPIs
  const totalGood = displaySummary.reduce((s, r) => s + r.qty_good, 0)
  const totalDefect = displaySummary.reduce((s, r) => s + r.qty_defect, 0)
  const totalAll = totalGood + totalDefect
  const defectRate = totalAll > 0 ? ((totalDefect / totalAll) * 100).toFixed(2) : '0.00'

  const defectByReason = useMemo(() => {
    const map: Record<string, number> = {}
    displaySummary.forEach(r => {
      if (r.qty_defect > 0 && r.defect_reason) {
        map[r.defect_reason] = (map[r.defect_reason] ?? 0) + r.qty_defect
      }
    })
    return map
  }, [displaySummary])

  const maxDefect = Math.max(...Object.values(defectByReason), 1)

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

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
            <select value={filterRange} onChange={e => setFilterRange(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', background: 'white' }}>
              <option value="1">วันนี้</option>
              <option value="7">7 วันล่าสุด</option>
              <option value="30">30 วันล่าสุด</option>
              <option value="9999">ทั้งหมด</option>
            </select>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['สินค้า', 'แท่น', 'ชิ้นดี', 'ของเสีย', 'สาเหตุ', 'พนักงาน', 'เวลา'].map((h, i) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: i >= 2 && i <= 3 ? 'center' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const reason = r.defect_reason ? DEFECT_REASONS[r.defect_reason] : null
                  return (
                    <tr key={r.id} className="hover:bg-[var(--bg)] transition-colors">
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.job_order?.plan_item?.product?.name ?? '—'}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                        <span style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>{r.job_order?.bed ?? '—'}</span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'center', fontWeight: 700, fontSize: 14, color: 'var(--green)' }}>{r.qty_good}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'center', fontWeight: 700, fontSize: 14, color: r.qty_defect > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{r.qty_defect}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                        {reason ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '2px 8px', borderRadius: 4, background: `${reason.color}18`, color: reason.color, fontWeight: 600 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: reason.color, flexShrink: 0, display: 'inline-block' }}></span>
                            {reason.label}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)' }}>{r.worker?.full_name ?? '—'}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                      <i className="fas fa-clipboard-check" style={{ fontSize: 28, opacity: 0.2, display: 'block', marginBottom: 10 }}></i>
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
