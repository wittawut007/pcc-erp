'use client'

import { useState, useMemo, useTransition, useCallback } from 'react'
import { getMaterialSummary } from '@/app/actions/material'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SummaryItem {
  id: string
  plan_id: string
  raw_material_id: string
  qty_required: number
  qty_dispensed: number
  status: string
  dispensed_at: string | null
  created_at: string
  raw_material: {
    id: string
    name: string
    category: string
    unit: string
    material_code: string | null
    weight_per_meter: number | null
  } | null
  plan: {
    id: string
    plan_date: string
    total_concrete: number | null
  } | null
}

// รายการสรุปต่อ raw_material_id
interface AggRow {
  id: string
  material_code: string | null
  name: string
  category: string
  unit: string
  weight_per_meter: number | null
  totalRequired: number   // เมตร (ลวด) หรือหน่วยดั้งเดิม
  totalDispensed: number  // กก. (ลวด) หรือหน่วยดั้งเดิม
  planCount: number
  lastDispensedAt: string | null
  pendingCount: number    // plan_materials ที่ยัง pending/partial
  dispensedCount: number  // plan_materials ที่ dispensed แล้ว
}

interface Props {
  initialData: SummaryItem[]
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CAT_CONFIG: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  ลวด:       { icon: 'fa-wave-square', color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  เหล็กเส้น: { icon: 'fa-bars',        color: '#475569', bg: '#F8FAFC', border: '#CBD5E1' },
  เมช:       { icon: 'fa-border-all',  color: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD' },
}

const DATE_PRESETS = [
  { id: 'week',    label: 'สัปดาห์นี้' },
  { id: 'month',   label: 'เดือนนี้' },
  { id: 'quarter', label: 'ไตรมาสนี้' },
  { id: 'custom',  label: 'กำหนดเอง' },
]

function getPresetRange(preset: string): { from: string; to: string } {
  const now = new Date()
  const fmt  = (d: Date) => d.toISOString().split('T')[0]
  if (preset === 'week') {
    const dow = now.getDay() || 7
    const mon = new Date(now); mon.setDate(now.getDate() - dow + 1)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { from: fmt(mon), to: fmt(sun) }
  }
  if (preset === 'month') {
    return {
      from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
      to:   fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    }
  }
  if (preset === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    return {
      from: fmt(new Date(now.getFullYear(), q * 3, 1)),
      to:   fmt(new Date(now.getFullYear(), q * 3 + 3, 0)),
    }
  }
  return { from: '', to: '' }
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function RawMaterialSummaryTab({ initialData }: Props) {
  const [items, setItems] = useState<SummaryItem[]>(initialData)
  const [isPending, startTransition] = useTransition()

  const [preset, setPreset]           = useState('month')
  const [customFrom, setCustomFrom]   = useState('')
  const [customTo, setCustomTo]       = useState('')
  const [catFilter, setCatFilter]     = useState('ทั้งหมด')
  const [search, setSearch]           = useState('')
  const [sortBy, setSortBy]           = useState<'name' | 'required' | 'dispensed'>('name')

  const { from: pFrom, to: pTo } = getPresetRange(preset)
  const dateFrom = preset === 'custom' ? customFrom : pFrom
  const dateTo   = preset === 'custom' ? customTo   : pTo

  const refetch = useCallback(() => {
    startTransition(async () => {
      try {
        const data = await getMaterialSummary({
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          category: catFilter === 'ทั้งหมด' ? '' : catFilter,
        })
        setItems(data as unknown as SummaryItem[])
      } catch (e) {
        toast.error('โหลดข้อมูลล้มเหลว: ' + (e as Error).message)
      }
    })
  }, [dateFrom, dateTo, catFilter])

  // ─── Aggregate by raw_material_id ───────────────────────────────────────

  const aggMap = useMemo(() => {
    const map: Record<string, AggRow> = {}
    const planSeen: Record<string, Set<string>> = {}

    items.forEach(i => {
      const rid = i.raw_material_id
      const cat = i.raw_material?.category ?? ''
      const isWire = cat === 'ลวด'
      const wireFactor = i.raw_material?.weight_per_meter ?? 0.0989

      if (!map[rid]) {
        map[rid] = {
          id: rid,
          material_code: i.raw_material?.material_code ?? null,
          name: i.raw_material?.name ?? '—',
          category: cat,
          unit: i.raw_material?.unit ?? '',
          weight_per_meter: i.raw_material?.weight_per_meter ?? null,
          totalRequired: 0,
          totalDispensed: 0,
          planCount: 0,
          lastDispensedAt: null,
          pendingCount: 0,
          dispensedCount: 0,
        }
        planSeen[rid] = new Set()
      }

      const row = map[rid]
      // qty_required ลวด → เมตร, อื่น → หน่วยดั้งเดิม
      row.totalRequired += isWire ? i.qty_required : i.qty_required
      // qty_dispensed ลวด → กก. (ตามที่ระบบบันทึกจริง), อื่น → หน่วยดั้งเดิม
      row.totalDispensed += i.qty_dispensed

      if (!planSeen[rid].has(i.plan_id)) {
        planSeen[rid].add(i.plan_id)
        row.planCount++
      }

      if (i.dispensed_at) {
        if (!row.lastDispensedAt || i.dispensed_at > row.lastDispensedAt) {
          row.lastDispensedAt = i.dispensed_at
        }
      }

      if (i.status === 'dispensed') row.dispensedCount++
      else row.pendingCount++
    })

    return map
  }, [items])

  // ─── Group by category ─────────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    let rows = Object.values(aggMap)

    if (catFilter !== 'ทั้งหมด') {
      rows = rows.filter(r => r.category === catFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.material_code ?? '').toLowerCase().includes(q)
      )
    }

    rows.sort((a, b) => {
      if (sortBy === 'required')  return b.totalRequired  - a.totalRequired
      if (sortBy === 'dispensed') return b.totalDispensed - a.totalDispensed
      return a.name.localeCompare(b.name, 'th')
    })

    return rows
  }, [aggMap, catFilter, search, sortBy])

  const groupedByCategory = useMemo(() => {
    const cats: Record<string, AggRow[]> = {}
    filteredRows.forEach(r => {
      if (!cats[r.category]) cats[r.category] = []
      cats[r.category].push(r)
    })
    return cats
  }, [filteredRows])

  // ─── KPI totals ────────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    const agg: Record<string, { req: number; disp: number; items: number; reqInDispUnit: number }> = {}
    filteredRows.forEach(r => {
      if (!agg[r.category]) agg[r.category] = { req: 0, disp: 0, items: 0, reqInDispUnit: 0 }
      agg[r.category].req   += r.totalRequired
      agg[r.category].disp  += r.totalDispensed
      agg[r.category].items++

      const isWire = r.category === 'ลวด'
      const reqInDispUnit = isWire
        ? (r.weight_per_meter ? r.totalRequired * r.weight_per_meter : r.totalRequired * 0.0989)
        : r.totalRequired
      agg[r.category].reqInDispUnit += reqInDispUnit
    })
    return agg
  }, [filteredRows])

  const totalPlans = useMemo(() => {
    const seen = new Set<string>()
    items.forEach(i => seen.add(i.plan_id))
    return seen.size
  }, [items])
  const totalConcrete = useMemo(() => {
    const seen = new Set<string>()
    let sum = 0
    items.forEach(i => {
      if (!seen.has(i.plan_id)) {
        seen.add(i.plan_id)
        sum += i.plan?.total_concrete ?? 0
      }
    })
    return sum
  }, [items])

  // ─── Helpers ──────────────────────────────────────────────────────────

  const fmtNum = (n: number, d = 2) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d })

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })

  const pct = (disp: number, req: number) =>
    req > 0 ? Math.min(100, Math.round((disp / req) * 100)) : 0

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '14px 18px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* Row 1 – Date presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <i className="fas fa-calendar-alt" style={{ color: '#2563EB', fontSize: 12 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginRight: 2 }}>ช่วงเวลา:</span>
          {DATE_PRESETS.map(p => (
            <button key={p.id} onClick={() => setPreset(p.id)}
              style={{
                padding: '4px 13px', borderRadius: 50, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: preset === p.id ? '#2563EB' : 'transparent',
                color:      preset === p.id ? '#fff'    : 'var(--text-secondary)',
                border:     preset === p.id ? 'none'    : '1px solid var(--border)',
                transition: 'all 0.15s',
              }}
            >{p.label}</button>
          ))}
          {preset === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 11, outline: 'none' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ถึง</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 11, outline: 'none' }} />
            </div>
          )}
          <button onClick={refetch} disabled={isPending}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600,
              background: isPending ? '#D1D5DB' : '#2563EB', color: '#fff',
              border: 'none', cursor: isPending ? 'wait' : 'pointer', transition: 'all 0.15s',
            }}
          >
            <i className={isPending ? 'fas fa-spinner fa-spin' : 'fas fa-sync-alt'} />
            {isPending ? 'กำลังโหลด...' : 'โหลดข้อมูล'}
          </button>
        </div>

        {/* Row 2 – Category + Sort + Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <i className="fas fa-filter" style={{ color: '#475569', fontSize: 11 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>หมวดหมู่:</span>
          {['ทั้งหมด', 'ลวด', 'เหล็กเส้น', 'เมช'].map(cat => {
            const cfg = CAT_CONFIG[cat]
            return (
              <button key={cat} onClick={() => setCatFilter(cat)}
                style={{
                  padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: catFilter === cat
                    ? (cat === 'ทั้งหมด' ? '#1E293B' : (cfg?.color ?? '#1E293B'))
                    : 'transparent',
                  color:  catFilter === cat ? '#fff' : 'var(--text-secondary)',
                  border: catFilter === cat ? 'none' : `1px solid ${cfg?.border ?? 'var(--border)'}`,
                  transition: 'all 0.15s',
                }}
              >
                {cfg && <i className={`fas ${cfg.icon}`} style={{ fontSize: 9, marginRight: 5 }} />}
                {cat}
              </button>
            )
          })}

          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />

          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>เรียงตาม:</span>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
            style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 11, background: 'var(--surface)', outline: 'none' }}>
            <option value="name">ชื่อวัตถุดิบ</option>
            <option value="required">ปริมาณที่ต้องการ</option>
            <option value="dispensed">ปริมาณที่จ่าย</option>
          </select>

          <div style={{ position: 'relative', marginLeft: 'auto', minWidth: 190 }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 10 }} />
            <input type="text" placeholder="ค้นหารหัส / ชื่อวัตถุดิบ..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', paddingLeft: 28, paddingRight: 12, paddingTop: 5, paddingBottom: 5, border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, background: 'var(--bg)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>

      {/* ── KPI Row ────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>

        {/* Overview */}
        <div style={{ background: 'linear-gradient(135deg,#1E293B,#334155)', borderRadius: 'var(--radius)', padding: '16px 18px', color: '#fff' }}>
          <i className="fas fa-chart-pie" style={{ fontSize: 18, marginBottom: 8, display: 'block', opacity: 0.7 }} />
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{filteredRows.length}</div>
          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>รายการวัตถุดิบ</div>
          <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>จาก {totalPlans} แผนผลิต</div>
        </div>

        {/* Concrete */}
        {totalConcrete > 0 && (
          <div style={{ background: 'linear-gradient(135deg,#F0FDF4,#DCFCE7)', border: '1px solid #86EFAC', borderRadius: 'var(--radius)', padding: '16px 18px' }}>
            <i className="fas fa-fill-drip" style={{ color: '#16A34A', fontSize: 16, marginBottom: 8, display: 'block' }} />
            <div style={{ fontSize: 20, fontWeight: 800, color: '#166534', lineHeight: 1 }}>{fmtNum(totalConcrete)}</div>
            <div style={{ fontSize: 10, color: '#16A34A', marginTop: 4 }}>คิว (คอนกรีต)</div>
          </div>
        )}

        {/* Per category KPI */}
        {['ลวด', 'เหล็กเส้น', 'เมช'].map(cat => {
          const cfg = CAT_CONFIG[cat]
          const d   = kpi[cat]
          if (!d) return null
          const p = pct(d.disp, d.reqInDispUnit)
          const reqUnit  = cat === 'ลวด' ? 'เมตร' : (filteredRows.find(r => r.category === cat)?.unit ?? '')
          const dispUnit = cat === 'ลวด' ? 'กก.'  : reqUnit
          return (
            <div key={cat} style={{
              background: `linear-gradient(135deg,${cfg.bg},#fff)`,
              border: `1px solid ${cfg.border}`, borderRadius: 'var(--radius)', padding: '16px 18px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <i className={`fas ${cfg.icon}`} style={{ color: cfg.color, fontSize: 14 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>{cat}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: cfg.color, opacity: 0.65 }}>{d.items} รายการ</span>
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: cfg.color, lineHeight: 1 }}>
                {fmtNum(d.req, 1)} <span style={{ fontSize: 10, fontWeight: 500 }}>{reqUnit}</span>
              </div>
              <div style={{ fontSize: 10, color: cfg.color, opacity: 0.7, margin: '3px 0 6px' }}>
                จ่าย {fmtNum(d.disp, 1)} {dispUnit}
              </div>
              <div style={{ height: 3, background: `${cfg.color}25`, borderRadius: 4 }}>
                <div style={{ width: `${p}%`, height: 3, background: cfg.color, borderRadius: 4, transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: 9, color: cfg.color, opacity: 0.5, marginTop: 3 }}>{p}% จ่ายแล้ว</div>
            </div>
          )
        })}
      </div>

      {/* ── Grouped tables by category ─────────────────────────────────── */}
      {Object.keys(groupedByCategory).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
          <i className="fas fa-folder-open" style={{ fontSize: 38, opacity: 0.25, display: 'block', marginBottom: 10 }} />
          <p style={{ fontSize: 13, fontWeight: 600 }}>ไม่พบรายการที่ตรงกับเงื่อนไข</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>ลองปรับช่วงเวลาหรือกรองใหม่</p>
        </div>
      ) : (
        Object.entries(groupedByCategory)
          .sort(([a], [b]) => a.localeCompare(b, 'th'))
          .map(([cat, rows]) => {
            const cfg = CAT_CONFIG[cat]
            const catReq  = rows.reduce((s, r) => s + r.totalRequired, 0)
            const catDisp = rows.reduce((s, r) => s + r.totalDispensed, 0)
            const reqUnit  = cat === 'ลวด' ? 'เมตร' : (rows[0]?.unit ?? '')
            const dispUnit = cat === 'ลวด' ? 'กก.'  : reqUnit

            return (
              <div key={cat} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', overflow: 'hidden',
              }}>
                {/* Category header */}
                <div style={{
                  padding: '12px 18px', background: cfg ? `${cfg.bg}` : '#F8FAFC',
                  borderBottom: `2px solid ${cfg?.border ?? 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  {cfg && <i className={`fas ${cfg.icon}`} style={{ color: cfg.color, fontSize: 15 }} />}
                  <span style={{ fontSize: 14, fontWeight: 800, color: cfg?.color ?? 'var(--text-primary)' }}>
                    หมวดหมู่: {cat}
                  </span>
                  <span style={{ fontSize: 11, color: cfg?.color ?? 'var(--text-muted)', opacity: 0.7 }}>
                    ({rows.length} รายการ)
                  </span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
                    <span style={{ fontSize: 11, color: cfg?.color ?? 'var(--text-secondary)', fontWeight: 600 }}>
                      รวมต้องการ: <strong>{fmtNum(catReq, 1)} {reqUnit}</strong>
                    </span>
                    <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>
                      รวมจ่าย: <strong>{fmtNum(catDisp, 1)} {dispUnit}</strong>
                    </span>
                  </div>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {[
                          { label: 'รหัส', align: 'left' },
                          { label: 'ชื่อวัตถุดิบ', align: 'left' },
                          { label: 'ปริมาณที่ต้องการ', align: 'right' },
                          { label: 'ปริมาณที่จ่าย', align: 'right' },
                          { label: '% จ่ายแล้ว', align: 'right' },
                          { label: 'แผนผลิต', align: 'center' },
                          { label: 'เบิกจ่ายล่าสุด', align: 'center' },
                          { label: 'สถานะรวม', align: 'center' },
                        ].map(h => (
                          <th key={h.label} style={{
                            padding: '9px 14px', textAlign: h.align as any,
                            fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.05em',
                            borderBottom: '1px solid var(--border)',
                            background: 'var(--bg)', whiteSpace: 'nowrap',
                          }}>{h.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => {
                        const isWire = row.category === 'ลวด'
                        const p = pct(row.totalDispensed, isWire
                          ? (row.weight_per_meter ? row.totalRequired * row.weight_per_meter : row.totalRequired)
                          : row.totalRequired)
                        const allDone = row.pendingCount === 0 && row.dispensedCount > 0
                        const mixed   = row.pendingCount > 0 && row.dispensedCount > 0

                        const reqDisplay  = `${fmtNum(row.totalRequired, 2)} ${isWire ? 'เมตร' : row.unit}`
                        const dispDisplay = `${fmtNum(row.totalDispensed, 2)} ${isWire ? 'กก.' : row.unit}`

                        return (
                          <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            {/* Code */}
                            <td style={{ padding: '10px 14px' }}>
                              {row.material_code ? (
                                <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '2px 6px', borderRadius: 4 }}>
                                  {row.material_code}
                                </span>
                              ) : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                            </td>
                            {/* Name */}
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {row.name}
                            </td>
                            {/* Required */}
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {reqDisplay}
                            </td>
                            {/* Dispensed */}
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: row.totalDispensed > 0 ? '#16A34A' : 'var(--text-muted)' }}>
                              {row.totalDispensed > 0 ? dispDisplay : '—'}
                            </td>
                            {/* Progress % */}
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                                <span style={{ fontWeight: 700, fontSize: 12, color: p >= 100 ? '#16A34A' : p > 50 ? '#2563EB' : '#D97706' }}>
                                  {p}%
                                </span>
                                <div style={{ width: 60, height: 3, background: 'var(--border)', borderRadius: 3 }}>
                                  <div style={{ width: `${p}%`, height: 3, borderRadius: 3, transition: 'width 0.3s',
                                    background: p >= 100 ? '#16A34A' : p > 50 ? '#2563EB' : '#D97706' }} />
                                </div>
                              </div>
                            </td>
                            {/* Plan count */}
                            <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#475569' }}>
                              {row.planCount}
                            </td>
                            {/* Last dispensed */}
                            <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                              {row.lastDispensedAt ? fmtDate(row.lastDispensedAt) : '—'}
                            </td>
                            {/* Status */}
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              {allDone ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700, background: '#F0FDF4', color: '#16A34A', border: '1px solid #86EFAC', whiteSpace: 'nowrap' }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
                                  เบิกจ่ายแล้ว
                                </span>
                              ) : mixed ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', whiteSpace: 'nowrap' }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', flexShrink: 0 }} />
                                  บางส่วน
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', whiteSpace: 'nowrap' }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />
                                  รอจ่าย
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>

                    {/* Category subtotal */}
                    <tfoot>
                      <tr style={{ background: `${cfg?.bg ?? '#F8FAFC'}` }}>
                        <td colSpan={2} style={{ padding: '8px 14px', fontWeight: 700, fontSize: 11, color: cfg?.color ?? 'var(--text-primary)', borderTop: '2px solid var(--border)' }}>
                          รวม {cat} ({rows.length} รายการ)
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 800, fontSize: 12, color: cfg?.color ?? 'var(--text-primary)', borderTop: '2px solid var(--border)', fontFamily: 'monospace' }}>
                          {fmtNum(catReq, 2)} {reqUnit}
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 800, fontSize: 12, color: '#16A34A', borderTop: '2px solid var(--border)', fontFamily: 'monospace' }}>
                          {fmtNum(catDisp, 2)} {dispUnit}
                        </td>
                        <td colSpan={4} style={{ borderTop: '2px solid var(--border)' }} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )
          })
      )}
    </div>
  )
}
