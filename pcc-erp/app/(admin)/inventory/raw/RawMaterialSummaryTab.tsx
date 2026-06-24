'use client'

import { useState, useMemo, useTransition, useCallback, Fragment } from 'react'
import { getMaterialSummary, getConcreteSummary } from '@/app/actions/material'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SummaryItem {
  id: string
  plan_id: string
  raw_material_id: string
  qty_required: number
  qty_dispensed: number
  status: string           // plan_materials.status: 'pending' | 'partial' | 'dispensed'
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
    status: string           // production_plans.status: 'draft' | 'confirmed' | 'completed'
    total_concrete: number | null
    production_orders: {
      id: string
      order_number: string
      status: string
      job_orders: {
        id: string
        status: string
      }[]
    }[]
    items: {
      id: string
      qty_target: number
      product: {
        id: string
        code: string
        name: string
        category: string
        unit: string
        size: string | null
        concrete_per_unit: number | null
        wire_per_unit: number | null
        mesh_per_unit: number | null
        rebar_per_unit: number | null
        product_bom_items: {
          qty_per_unit: number
          raw_materials: {
            id: string
            name: string
            material_code: string | null
            unit: string
          } | null
        }[]
      } | null
    }[]
  } | null
}

interface ConcreteOrder {
  id: string
  phase: string
  qty_requested: number
  status: string        // 'requested' | 'supplied'
  mix_ratio: string | null
  requested_at: string
  job_order: {
    id: string
    plan_item: {
      id: string
      qty_target: number
      product: {
        id: string
        code: string
        name: string
        category: string  // e.g. "A13 แผ่นพื้นตัน"
        concrete_per_unit: number | null
      } | null
    } | null
    production_order: {
      id: string
      order_number: string
      plan_id: string
      status: string
      job_orders: {
        id: string
        status: string
      }[]
      plan: {
        id: string
        plan_date: string
        status: string   // 'confirmed' | 'completed'
        total_concrete: number | null
      } | null
    } | null
  } | null
}

/**
 * รายการสรุปต่อ raw_material_id
 * แบ่งเป็น 2 bucket ตาม plan.status:
 *   ip* = in-progress: plan.status = 'confirmed' (กำลังผลิต)
 *   cp* = completed: plan.status = 'completed' (ผลิตสำเร็จ / QC ผ่านแล้ว)
 */
interface AggRow {
  id: string
  material_code: string | null
  name: string
  category: string
  unit: string
  weight_per_meter: number | null
  planCount: number
  lastDispensedAt: string | null

  // Bucket A: แผนกำลังดำเนินการ (plan.status = 'confirmed')
  ipReq: number        // qty_required รวม
  ipDispRaw: number    // qty_dispensed รวม (raw unit จากฐานข้อมูล)
  ipEntryCount: number
  ipMatPending: number // plan_materials ที่ mat.status != 'dispensed' ในแผน confirmed
  ipMatDone: number    // plan_materials ที่ mat.status = 'dispensed' ในแผน confirmed

  // Bucket B: แผนเสร็จสิ้น QC ผ่านแล้ว (plan.status = 'completed')
  cpReq: number
  cpDispRaw: number
  cpEntryCount: number

  // เก็บ entries ดิบทั้งหมดสำหรับเจาะลึก
  entries: SummaryItem[]
}

/** สรุปคอนกรีตต่อหมวดหมู่สินค้า */
interface ConcreteCatRow {
  category: string
  totalQty: number
  suppliedQty: number    // concrete.status = 'supplied'
  requestedQty: number   // concrete.status = 'requested'
  orderCount: number
  suppliedCount: number
  requestedCount: number
  systemRequiredQty: number
}

interface Props {
  initialData: SummaryItem[]
  initialConcrete?: ConcreteOrder[]
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function getPlanComputedStatus(plan: any): 'completed' | 'in_progress' {
  if (!plan) return 'in_progress'
  if (plan.status === 'completed') return 'completed'

  const orders = plan.production_orders || []
  if (orders.length === 0) return 'in_progress'

  const allOrdersFinished = orders.every((o: any) => {
    if (o.status === 'erp_synced') return true
    
    const jobOrders = o.job_orders || []
    if (jobOrders.length === 0) return false
    return jobOrders.every((j: any) => j.status === 'demolded' || j.status === 'qc_passed')
  })

  return allOrdersFinished ? 'completed' : 'in_progress'
}

function getProductMaterialQty(product: any, rawMaterialId: string, category: string): { perUnit: number; isBom: boolean } {
  if (!product) return { perUnit: 0, isBom: false }

  // 1. Check product_bom_items
  const bomItems = product.product_bom_items || []
  const bomMatch = bomItems.find((b: any) => b.raw_materials?.id === rawMaterialId)
  if (bomMatch) {
    const perUnit = Number(bomMatch.qty_per_unit) || 0
    return { perUnit, isBom: true }
  }

  // 2. Fallback check by category
  let perUnit = 0
  if (category === 'ลวด') {
    perUnit = product.wire_per_unit || product.length || 0
  } else if (category === 'เมช') {
    perUnit = product.mesh_per_unit || 0
  } else if (category === 'เหล็กเส้น') {
    perUnit = product.rebar_per_unit || 0
  }
  
  return { perUnit, isBom: false }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CAT_CONFIG: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  ลวด:       { icon: 'fa-wave-square', color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  เหล็กเส้น: { icon: 'fa-bars',        color: '#475569', bg: '#F8FAFC', border: '#CBD5E1' },
  เมช:       { icon: 'fa-border-all',  color: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD' },
}

// สีตามรหัส prefix ของสินค้า A13/A30/A42...
const PRODUCT_CODE_COLORS: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  A13: { color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', icon: 'fa-layer-group' },
  A30: { color: '#7C3AED', bg: '#F5F3FF', border: '#C4B5FD', icon: 'fa-border-top-left' },
  A35: { color: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD', icon: 'fa-columns' },
  A36: { color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', icon: 'fa-grip-lines' },
  A41: { color: '#065F46', bg: '#ECFDF5', border: '#6EE7B7', icon: 'fa-arrow-down' },
  A42: { color: '#9A3412', bg: '#FFF7ED', border: '#FED7AA', icon: 'fa-shield-alt' },
}

function getProductCodeStyle(category: string) {
  const prefix = category.split(' ')[0] ?? ''
  return PRODUCT_CODE_COLORS[prefix] ?? { color: '#475569', bg: '#F8FAFC', border: '#CBD5E1', icon: 'fa-fill-drip' }
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

// ─── Unit Helpers ─────────────────────────────────────────────────────────────

/**
 * ลวด: qty_dispensed ในฐานข้อมูล = กก. → แปลงกลับเป็น เมตร
 * qty_required ของลวด = เมตร
 */
function wireDispToMeters(dispRaw: number, wpm: number | null): number {
  const f = wpm ?? 0.0989
  return f > 0 ? dispRaw / f : 0
}

function getCatUnit(cat: string): string {
  if (cat === 'ลวด')       return 'เมตร'
  if (cat === 'เมช')       return 'ตร.ม.'
  if (cat === 'เหล็กเส้น') return 'เมตร'
  return ''
}

function dispToDisplay(cat: string, dispRaw: number, wpm: number | null): number {
  return cat === 'ลวด' ? wireDispToMeters(dispRaw, wpm) : dispRaw
}

// ─── Status Badges ────────────────────────────────────────────────────────────

function BadgePending({ label = 'รอจ่าย' }: { label?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />{label}
    </span>
  )
}

function BadgePartial() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', flexShrink: 0 }} />จ่ายบางส่วน
    </span>
  )
}

function BadgeDone({ label = 'เบิกจ่ายแล้ว' }: { label?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700, background: '#F0FDF4', color: '#16A34A', border: '1px solid #86EFAC', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />{label}
    </span>
  )
}

function BadgeInProd() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700, background: '#F5F3FF', color: '#7C3AED', border: '1px solid #C4B5FD', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8B5CF6', flexShrink: 0 }} />จ่ายครบ-รอ QC
    </span>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function RawMaterialSummaryTab({ initialData, initialConcrete = [] }: Props) {
  const [items, setItems]               = useState<SummaryItem[]>(initialData)
  const [concreteItems, setConcreteItems] = useState<ConcreteOrder[]>(initialConcrete as ConcreteOrder[])
  const [isPending, startTransition]    = useTransition()

  const [preset, setPreset]         = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [catFilter, setCatFilter]   = useState('ทั้งหมด')
  const [search, setSearch]         = useState('')
  const [sortBy, setSortBy]         = useState<'name' | 'required' | 'dispensed'>('name')
  const [statusFilter, setStatusFilter] = useState<'ทั้งหมด' | 'กำลังผลิต' | 'ผลิตสำเร็จ'>('ทั้งหมด')
  
  const [expandedConcrete, setExpandedConcrete] = useState<Record<string, boolean>>({})
  const toggleConcrete = (cat: string) => {
    setExpandedConcrete(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  const { from: pFrom, to: pTo } = getPresetRange(preset)
  const dateFrom = preset === 'custom' ? customFrom : pFrom
  const dateTo   = preset === 'custom' ? customTo   : pTo

  const refetch = useCallback(() => {
    startTransition(async () => {
      try {
        const [matData, concData] = await Promise.all([
          getMaterialSummary({
            dateFrom: dateFrom || undefined,
            dateTo:   dateTo   || undefined,
            category: (catFilter === 'ทั้งหมด' || catFilter === 'คอนกรีต') ? '' : catFilter,
          }),
          getConcreteSummary({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
        ])
        setItems(matData as unknown as SummaryItem[])
        setConcreteItems(concData as unknown as ConcreteOrder[])
      } catch (e) {
        toast.error('โหลดข้อมูลล้มเหลว: ' + (e as Error).message)
      }
    })
  }, [dateFrom, dateTo, catFilter])

  // ─── Aggregate by raw_material_id ─────────────────────────────────────────
  // แบ่ง 2 bucket: ip (plan confirmed = กำลังผลิต) vs cp (plan completed = QC ผ่านแล้ว)

  const aggMap = useMemo(() => {
    const map: Record<string, AggRow> = {}
    const planSeen: Record<string, Set<string>> = {}

    items.forEach(i => {
      const rid = i.raw_material_id
      const cat = i.raw_material?.category ?? ''
      const planStatus = getPlanComputedStatus(i.plan)
      const isCompleted = planStatus === 'completed'

      if (!map[rid]) {
        map[rid] = {
          id: rid,
          material_code: i.raw_material?.material_code ?? null,
          name: i.raw_material?.name ?? '—',
          category: cat,
          unit: i.raw_material?.unit ?? '',
          weight_per_meter: i.raw_material?.weight_per_meter ?? null,
          planCount: 0,
          lastDispensedAt: null,
          ipReq: 0, ipDispRaw: 0, ipEntryCount: 0, ipMatPending: 0, ipMatDone: 0,
          cpReq: 0, cpDispRaw: 0, cpEntryCount: 0,
          entries: [],
        }
        planSeen[rid] = new Set()
      }

      const row = map[rid]
      row.entries.push(i)

      if (isCompleted) {
        // Bucket B: แผนเสร็จสิ้น → ผ่าน QC สินค้าแล้ว
        row.cpReq     += i.qty_required
        row.cpDispRaw += i.qty_dispensed
        row.cpEntryCount++
      } else {
        // Bucket A: แผนกำลังดำเนินการ
        row.ipReq     += i.qty_required
        row.ipDispRaw += i.qty_dispensed
        row.ipEntryCount++
        if (i.status === 'dispensed') row.ipMatDone++
        else row.ipMatPending++
      }

      if (!planSeen[rid].has(i.plan_id)) {
        planSeen[rid].add(i.plan_id)
        row.planCount++
      }

      if (i.dispensed_at) {
        if (!row.lastDispensedAt || i.dispensed_at > row.lastDispensedAt) {
          row.lastDispensedAt = i.dispensed_at
        }
      }
    })

    return map
  }, [items])

  // ─── Aggregate concrete by product category ───────────────────────────────
  // แยกตามหมวดหมู่สินค้า A13/A30/A42 (ไม่ใช่ phase)

  const concreteByCat = useMemo(() => {
    const map: Record<string, ConcreteCatRow & { seenPlanItems: Set<string> }> = {}
    const showIp = statusFilter === 'ทั้งหมด' || statusFilter === 'กำลังผลิต'
    const showCp = statusFilter === 'ทั้งหมด' || statusFilter === 'ผลิตสำเร็จ'

    concreteItems.forEach(c => {
      const isSupplied = c.status === 'supplied' || c.status === 'received'
      if (isSupplied && !showCp) return
      if (!isSupplied && !showIp) return

      const cat = c.job_order?.plan_item?.product?.category ?? 'ไม่ระบุหมวดหมู่'
      if (!map[cat]) {
        map[cat] = {
          category: cat,
          totalQty: 0,
          suppliedQty: 0,
          requestedQty: 0,
          orderCount: 0,
          suppliedCount: 0,
          requestedCount: 0,
          systemRequiredQty: 0,
          seenPlanItems: new Set()
        }
      }
      const row = map[cat]
      row.totalQty += c.qty_requested
      row.orderCount++
      
      if (isSupplied) {
        row.suppliedQty += c.qty_requested
        row.suppliedCount++
      } else {
        row.requestedQty += c.qty_requested
        row.requestedCount++
      }

      // คำนวณความต้องการของระบบ (ไม่นับซ้ำสำหรับ plan_item เดียวกัน)
      const planItemId = c.job_order?.plan_item?.id
      if (planItemId && !row.seenPlanItems.has(planItemId)) {
        row.seenPlanItems.add(planItemId)
        const qtyTarget = c.job_order?.plan_item?.qty_target ?? 0
        const concretePerUnit = c.job_order?.plan_item?.product?.concrete_per_unit ?? 0
        row.systemRequiredQty += qtyTarget * concretePerUnit
      }
    })

    return map
  }, [concreteItems, statusFilter])

  // ─── Filter & group raw material rows ────────────────────────────────────

  const filteredRows = useMemo(() => {
    if (catFilter === 'คอนกรีต') return []

    let rows = Object.values(aggMap)
    if (catFilter !== 'ทั้งหมด') rows = rows.filter(r => r.category === catFilter)

    const showIp = statusFilter === 'ทั้งหมด' || statusFilter === 'กำลังผลิต'
    const showCp = statusFilter === 'ทั้งหมด' || statusFilter === 'ผลิตสำเร็จ'

    // กรองเอาเฉพาะแถวที่มีข้อมูลของสถานะที่เลือก
    rows = rows.filter(r => (showIp && r.ipEntryCount > 0) || (showCp && r.cpEntryCount > 0))

    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.material_code ?? '').toLowerCase().includes(q)
      )
    }

    rows.sort((a, b) => {
      if (sortBy === 'required') {
        const reqA = (showIp ? a.ipReq : 0) + (showCp ? a.cpReq : 0)
        const reqB = (showIp ? b.ipReq : 0) + (showCp ? b.cpReq : 0)
        return reqB - reqA
      }
      if (sortBy === 'dispensed') {
        const dispA = (showIp ? a.ipDispRaw : 0) + (showCp ? a.cpDispRaw : 0)
        const dispB = (showIp ? b.ipDispRaw : 0) + (showCp ? b.cpDispRaw : 0)
        return dispB - dispA
      }
      return a.name.localeCompare(b.name, 'th')
    })
    return rows
  }, [aggMap, catFilter, search, sortBy, statusFilter])

  const groupedByCategory = useMemo(() => {
    const cats: Record<string, AggRow[]> = {}
    filteredRows.forEach(r => {
      if (!cats[r.category]) cats[r.category] = []
      cats[r.category].push(r)
    })
    return cats
  }, [filteredRows])

  // ─── KPI totals ──────────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    const showIp = statusFilter === 'ทั้งหมด' || statusFilter === 'กำลังผลิต'
    const showCp = statusFilter === 'ทั้งหมด' || statusFilter === 'ผลิตสำเร็จ'

    const agg: Record<string, { reqTotal: number; dispMeters: number; items: number }> = {}
    Object.values(aggMap).forEach(r => {
      const req = (showIp ? r.ipReq : 0) + (showCp ? r.cpReq : 0)
      const disp = (showIp ? r.ipDispRaw : 0) + (showCp ? r.cpDispRaw : 0)
      const hasEntries = (showIp && r.ipEntryCount > 0) || (showCp && r.cpEntryCount > 0)

      if (hasEntries) {
        if (!agg[r.category]) agg[r.category] = { reqTotal: 0, dispMeters: 0, items: 0 }
        agg[r.category].reqTotal  += req
        agg[r.category].dispMeters += dispToDisplay(r.category, disp, r.weight_per_meter)
        agg[r.category].items++
      }
    })
    return agg
  }, [aggMap, statusFilter])

  const totalConcrete = useMemo(() =>
    Object.values(concreteByCat).reduce((s, r) => s + r.totalQty, 0),
    [concreteByCat]
  )
  const totalPlans = useMemo(() => {
    const showIp = statusFilter === 'ทั้งหมด' || statusFilter === 'กำลังผลิต'
    const showCp = statusFilter === 'ทั้งหมด' || statusFilter === 'ผลิตสำเร็จ'

    const seen = new Set<string>()
    items.forEach(i => {
      const computedStatus = getPlanComputedStatus(i.plan)
      if (computedStatus === 'completed' && !showCp) return
      if (computedStatus === 'in_progress' && !showIp) return
      seen.add(i.plan_id)
    })
    return seen.size
  }, [items, statusFilter])

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const fmtNum = (n: number, d = 2) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d })

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })

  const pct = (disp: number, req: number) =>
    req > 0 ? Math.min(100, Math.round((disp / req) * 100)) : 0

  const showConcrete  = catFilter === 'ทั้งหมด' || catFilter === 'คอนกรีต'
  const showMaterials = catFilter !== 'คอนกรีต'

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Row 1 – Date presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <i className="fas fa-calendar-alt" style={{ color: '#2563EB', fontSize: 12 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>ช่วงเวลา:</span>
          {DATE_PRESETS.map(p => (
            <button key={p.id} onClick={() => setPreset(p.id)} style={{ padding: '4px 13px', borderRadius: 50, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: preset === p.id ? '#2563EB' : 'transparent', color: preset === p.id ? '#fff' : 'var(--text-secondary)', border: preset === p.id ? 'none' : '1px solid var(--border)', transition: 'all 0.15s' }}>
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 11, outline: 'none' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ถึง</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 11, outline: 'none' }} />
            </div>
          )}
          <button onClick={refetch} disabled={isPending} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: isPending ? '#D1D5DB' : '#2563EB', color: '#fff', border: 'none', cursor: isPending ? 'wait' : 'pointer', transition: 'all 0.15s' }}>
            <i className={isPending ? 'fas fa-spinner fa-spin' : 'fas fa-sync-alt'} />
            {isPending ? 'กำลังโหลด...' : 'โหลดข้อมูล'}
          </button>
        </div>

        {/* Row 2 – Category + Sort + Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <i className="fas fa-filter" style={{ color: '#475569', fontSize: 11 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>หมวดหมู่:</span>
          {['ทั้งหมด', 'ลวด', 'เหล็กเส้น', 'เมช', 'คอนกรีต'].map(cat => {
            const cfg = CAT_CONFIG[cat]
            const isConcrete = cat === 'คอนกรีต'
            const activeColor = isConcrete ? '#065F46' : cfg?.color ?? '#1E293B'
            const activeBorder = isConcrete ? '#6EE7B7' : cfg?.border ?? 'var(--border)'
            return (
              <button key={cat} onClick={() => setCatFilter(cat)} style={{ padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: catFilter === cat ? (cat === 'ทั้งหมด' ? '#1E293B' : activeColor) : 'transparent', color: catFilter === cat ? '#fff' : 'var(--text-secondary)', border: catFilter === cat ? 'none' : `1px solid ${activeBorder}`, transition: 'all 0.15s' }}>
                {isConcrete ? <><i className="fas fa-fill-drip" style={{ fontSize: 9, marginRight: 5 }} />คอนกรีต</> : <>{cfg && <i className={`fas ${cfg.icon}`} style={{ fontSize: 9, marginRight: 5 }} />}{cat}</>}
              </button>
            )
          })}

          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>เรียงตาม:</span>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as 'name' | 'required' | 'dispensed')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 11, background: 'var(--surface)', outline: 'none' }}>
            <option value="name">ชื่อวัตถุดิบ</option>
            <option value="required">ปริมาณที่ต้องการ</option>
            <option value="dispensed">ปริมาณที่จ่าย</option>
          </select>

          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>สถานะแผน:</span>
          {(['ทั้งหมด', 'กำลังผลิต', 'ผลิตสำเร็จ'] as const).map(st => (
            <button key={st} onClick={() => setStatusFilter(st)} style={{ padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: statusFilter === st ? '#2563EB' : 'transparent', color: statusFilter === st ? '#fff' : 'var(--text-secondary)', border: statusFilter === st ? 'none' : '1px solid var(--border)', transition: 'all 0.15s' }}>
              {st}
            </button>
          ))}

          <div style={{ position: 'relative', marginLeft: 'auto', minWidth: 190 }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 10 }} />
            <input type="text" placeholder="ค้นหารหัส / ชื่อวัตถุดิบ..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', paddingLeft: 28, paddingRight: 12, paddingTop: 5, paddingBottom: 5, border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, background: 'var(--bg)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {/* Overview */}
        <div style={{ background: 'linear-gradient(135deg,#1E293B,#334155)', borderRadius: 'var(--radius)', padding: '16px 18px', color: '#fff' }}>
          <i className="fas fa-chart-pie" style={{ fontSize: 18, marginBottom: 8, display: 'block', opacity: 0.7 }} />
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{Object.values(aggMap).length}</div>
          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>รายการวัตถุดิบ</div>
          <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>จาก {totalPlans} แผนผลิต</div>
        </div>

        {/* Concrete total */}
        {totalConcrete > 0 && (
          <div style={{ background: 'linear-gradient(135deg,#F0FDF4,#DCFCE7)', border: '1px solid #86EFAC', borderRadius: 'var(--radius)', padding: '16px 18px' }}>
            <i className="fas fa-fill-drip" style={{ color: '#16A34A', fontSize: 16, marginBottom: 8, display: 'block' }} />
            <div style={{ fontSize: 20, fontWeight: 800, color: '#166534', lineHeight: 1 }}>
              {fmtNum(totalConcrete)} <span style={{ fontSize: 10, fontWeight: 500 }}>ลบ.ม.</span>
            </div>
            <div style={{ fontSize: 10, color: '#16A34A', marginTop: 4 }}>คอนกรีตรวม (สั่งแล้ว)</div>
            <div style={{ fontSize: 10, color: '#059669', marginTop: 2 }}>
              จ่ายแล้วจริง: {fmtNum(Object.values(concreteByCat).reduce((s, r) => s + r.suppliedQty, 0))} ลบ.ม.
            </div>
          </div>
        )}

        {/* Per-category KPI */}
        {(['ลวด', 'เหล็กเส้น', 'เมช'] as const).map(cat => {
          const cfg = CAT_CONFIG[cat]; const d = kpi[cat]; if (!d) return null
          const unit = getCatUnit(cat)
          const p = pct(d.dispMeters, d.reqTotal)
          return (
            <div key={cat} style={{ background: `linear-gradient(135deg,${cfg.bg},#fff)`, border: `1px solid ${cfg.border}`, borderRadius: 'var(--radius)', padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <i className={`fas ${cfg.icon}`} style={{ color: cfg.color, fontSize: 14 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>{cat}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: cfg.color, opacity: 0.65 }}>{d.items} รายการ</span>
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: cfg.color, lineHeight: 1 }}>
                {fmtNum(d.reqTotal, 1)} <span style={{ fontSize: 10, fontWeight: 500 }}>{unit}</span>
              </div>
              <div style={{ fontSize: 10, color: cfg.color, opacity: 0.7, margin: '3px 0 6px' }}>จ่าย {fmtNum(d.dispMeters, 1)} {unit}</div>
              <div style={{ height: 3, background: `${cfg.color}25`, borderRadius: 4 }}>
                <div style={{ width: `${p}%`, height: 3, background: cfg.color, borderRadius: 4, transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: 9, color: cfg.color, opacity: 0.5, marginTop: 3 }}>{p}% จ่ายแล้ว</div>
            </div>
          )
        })}
      </div>

      {/* ── Raw Material Tables grouped by category ──────────────────────── */}
      {showMaterials && Object.entries(groupedByCategory)
        .sort(([a], [b]) => a.localeCompare(b, 'th'))
        .map(([cat, rows]) => {
          const cfg = CAT_CONFIG[cat]
          const unit = getCatUnit(cat) || rows[0]?.unit || ''

          const showIp = statusFilter === 'ทั้งหมด' || statusFilter === 'กำลังผลิต'
          const showCp = statusFilter === 'ทั้งหมด' || statusFilter === 'ผลิตสำเร็จ'

          // แยก rows ตาม bucket
          const ipRows = showIp ? rows.filter(r => r.ipEntryCount > 0) : []
          const cpRows = showCp ? rows.filter(r => r.cpEntryCount > 0) : []

          // Header totals (รวมทั้งหมด)
          const allReqTotal  = rows.reduce((s, r) => s + (showIp ? r.ipReq : 0) + (showCp ? r.cpReq : 0), 0)
          const allDispTotal = rows.reduce((s, r) => s + dispToDisplay(cat, (showIp ? r.ipDispRaw : 0) + (showCp ? r.cpDispRaw : 0), r.weight_per_meter), 0)

          // ip totals
          const ipReqTotal  = ipRows.reduce((s, r) => s + r.ipReq, 0)
          const ipDispTotal = ipRows.reduce((s, r) => s + dispToDisplay(cat, r.ipDispRaw, r.weight_per_meter), 0)

          // cp totals
          const cpReqTotal  = cpRows.reduce((s, r) => s + r.cpReq, 0)
          const cpDispTotal = cpRows.reduce((s, r) => s + dispToDisplay(cat, r.cpDispRaw, r.weight_per_meter), 0)

          return (
            <div key={cat} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>

              {/* Category header */}
              <div style={{ padding: '12px 18px', background: cfg ? cfg.bg : '#F8FAFC', borderBottom: `2px solid ${cfg?.border ?? 'var(--border)'}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                {cfg && <i className={`fas ${cfg.icon}`} style={{ color: cfg.color, fontSize: 15 }} />}
                <span style={{ fontSize: 14, fontWeight: 800, color: cfg?.color ?? 'var(--text-primary)' }}>หมวดหมู่: {cat}</span>
                <span style={{ fontSize: 11, color: cfg?.color, opacity: 0.7 }}>({rows.length} รายการ)</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
                  <span style={{ fontSize: 11, color: cfg?.color ?? 'var(--text-secondary)', fontWeight: 600 }}>
                    รวมต้องการ: <strong>{fmtNum(allReqTotal, 1)} {unit}</strong>
                  </span>
                  <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>
                    รวมจ่าย: <strong>{fmtNum(allDispTotal, 1)} {unit}</strong>
                  </span>
                </div>
              </div>

              {/* ── Sub-section A: กำลังผลิต (plan.status = confirmed) ── */}
              {ipRows.length > 0 && (
                <>
                  <div style={{ padding: '8px 18px', background: '#FFFBEB', borderBottom: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="fas fa-cogs" style={{ color: '#D97706', fontSize: 11 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E' }}>
                      🔄 กำลังผลิต — แผนกำลังดำเนินการ ({ipRows.length} รายการ)
                    </span>
                    <span style={{ fontSize: 10, color: '#B45309', marginLeft: 'auto' }}>
                      อ้างอิง: แผนที่ยังไม่เสร็จสิ้น — QC สินค้ายังไม่ผ่าน
                    </span>
                    <span style={{ fontSize: 11, color: '#D97706', fontWeight: 600, marginLeft: 16 }}>
                      ต้องการ: {fmtNum(ipReqTotal, 1)} {unit} · จ่ายแล้ว: {fmtNum(ipDispTotal, 1)} {unit}
                    </span>
                  </div>
                  <MaterialTable rows={ipRows} cat={cat} unit={unit} bucket="ip" fmtNum={fmtNum} pct={pct} dispToDisplay={dispToDisplay} />
                </>
              )}

              {/* ── Sub-section B: ผลิตสำเร็จ / QC ผ่านแล้ว (plan.status = completed) ── */}
              {cpRows.length > 0 && (
                <>
                  <div style={{ padding: '8px 18px', background: '#F0FDF4', borderTop: ipRows.length > 0 ? '2px dashed #D1FAE5' : undefined, borderBottom: '1px solid #D1FAE5', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="fas fa-check-double" style={{ color: '#16A34A', fontSize: 11 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#14532D' }}>
                      ✅ ผลิตสำเร็จ / QC ผ่านแล้ว — แผนเสร็จสิ้น ({cpRows.length} รายการ)
                    </span>
                    <span style={{ fontSize: 10, color: '#16A34A', marginLeft: 'auto' }}>
                      สินค้าผ่าน QC แล้ว — ตัดสต็อกวัตถุดิบจริง
                    </span>
                    <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 600, marginLeft: 16 }}>
                      จ่ายสุทธิ: {fmtNum(cpDispTotal, 1)} {unit}
                    </span>
                  </div>
                  <MaterialTable rows={cpRows} cat={cat} unit={unit} bucket="cp" fmtNum={fmtNum} pct={pct} dispToDisplay={dispToDisplay} />
                </>
              )}

              {ipRows.length === 0 && cpRows.length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  <i className="fas fa-inbox" style={{ fontSize: 24, opacity: 0.3, display: 'block', marginBottom: 8 }} />
                  ไม่พบรายการในช่วงเวลาที่เลือก
                </div>
              )}
            </div>
          )
        })}

      {/* Empty state for material filter */}
      {showMaterials && Object.keys(groupedByCategory).length === 0 && catFilter !== 'คอนกรีต' && (
        <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
          <i className="fas fa-folder-open" style={{ fontSize: 38, opacity: 0.25, display: 'block', marginBottom: 10 }} />
          <p style={{ fontSize: 13, fontWeight: 600 }}>ไม่พบรายการที่ตรงกับเงื่อนไข</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>ลองปรับช่วงเวลาหรือกรองใหม่</p>
        </div>
      )}

      {/* ── Concrete Section: แยกตามหมวดหมู่สินค้า A13/A30/A42 ─────────── */}
      {showConcrete && Object.keys(concreteByCat).length > 0 && (
        <div style={{ background: 'var(--surface)', border: '2px solid #6EE7B7', borderRadius: 'var(--radius)', overflow: 'hidden' }}>

          {/* Concrete header */}
          <div style={{ padding: '12px 18px', background: 'linear-gradient(135deg,#ECFDF5,#F0FDF4)', borderBottom: '2px solid #6EE7B7', display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="fas fa-fill-drip" style={{ color: '#059669', fontSize: 15 }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: '#065F46' }}>หมวดหมู่: คอนกรีต</span>
            <span style={{ fontSize: 11, color: '#059669', opacity: 0.8 }}>
              ({concreteItems.length} คำสั่ง · {Object.keys(concreteByCat).length} หมวดสินค้า)
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
              <span style={{ fontSize: 11, color: '#065F46', fontWeight: 600 }}>
                สั่งผลิตรวม: <strong>{fmtNum(totalConcrete, 2)} ลบ.ม.</strong>
              </span>
              <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>
                จ่ายแล้วจริง: <strong>{fmtNum(Object.values(concreteByCat).reduce((s, r) => s + r.suppliedQty, 0), 2)} ลบ.ม.</strong>
              </span>
            </div>
          </div>

          {/* ── ระหว่างดำเนินการ (requested) ── */}
          {Object.values(concreteByCat).some(r => r.requestedCount > 0) && (
            <>
              <div style={{ padding: '8px 18px', background: '#FFFBEB', borderBottom: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-clock" style={{ color: '#D97706', fontSize: 11 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E' }}>
                  🔄 ระหว่างดำเนินการ — รอรับคอนกรีต
                </span>
                <span style={{ fontSize: 10, color: '#B45309', marginLeft: 'auto' }}>
                  คำสั่งที่ยังไม่ได้ส่งคอนกรีต (status = requested)
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {[
                        { label: 'หมวดหมู่สินค้า / คลิกดูคำสั่ง', align: 'left' },
                        { label: 'สั่งแล้ว (ลบ.ม.)', align: 'right' },
                        { label: 'จ่ายแล้วจริง (ลบ.ม.)', align: 'right' },
                        { label: 'รอจ่าย (ลบ.ม.)', align: 'right' },
                        { label: 'จำนวน Order', align: 'center' },
                        { label: 'สถานะ', align: 'center' },
                      ].map(h => (
                        <th key={h.label} style={{ padding: '8px 14px', textAlign: h.align as 'left' | 'right' | 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', background: '#FFFDF0', whiteSpace: 'nowrap' }}>{h.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(concreteByCat)
                      .filter(([, r]) => r.requestedCount > 0)
                      .sort(([a], [b]) => a.localeCompare(b, 'th'))
                      .map(([cat, row]) => {
                        const style = getProductCodeStyle(cat)
                        const prefix = cat.split(' ')[0] ?? ''
                        const isExpanded = !!expandedConcrete[`req-${cat}`]
                        
                        // กรองคำสั่งซื้อคอนกรีตในหมวดหมู่ที่ยังรอรับ
                        const catOrders = concreteItems.filter(c => {
                          const itemCat = c.job_order?.plan_item?.product?.category ?? 'ไม่ระบุหมวดหมู่'
                          return itemCat === cat && c.status !== 'supplied' && c.status !== 'received'
                        })

                        return (
                          <Fragment key={`req-${cat}`}>
                            <tr onClick={() => setExpandedConcrete(prev => ({ ...prev, [`req-${cat}`]: !prev[`req-${cat}`] }))} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} className="hover:bg-slate-50 transition-colors">
                              <td style={{ padding: '11px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <i className={`fas ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ color: 'var(--text-muted)', fontSize: 9, width: 8 }} />
                                  <div style={{ width: 32, height: 32, borderRadius: 8, background: style.bg, border: `1px solid ${style.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <i className={`fas ${style.icon}`} style={{ color: style.color, fontSize: 12 }} />
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 700, color: style.color, fontSize: 12 }}>{cat}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>รหัสสินค้า: {prefix}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>
                                {fmtNum(row.totalQty, 2)} ลบ.ม.
                              </td>
                              <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#16A34A' }}>
                                {fmtNum(row.suppliedQty, 2)} ลบ.ม.
                              </td>
                              <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#D97706' }}>
                                {fmtNum(row.requestedQty, 2)} ลบ.ม.
                              </td>
                              <td style={{ padding: '11px 14px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#475569' }}>
                                {row.requestedCount}
                              </td>
                              <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                                <BadgePending label="รอจ่ายคอนกรีต" />
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={6} style={{ padding: '12px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {catOrders.map(c => {
                                      const plan = c.job_order?.production_order?.plan
                                      const planDateStr = plan?.plan_date ? new Date(plan.plan_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
                                      const poNumber = c.job_order?.production_order?.order_number ?? '—'
                                      
                                      // Compute status using helper
                                      const computedStatus = getPlanComputedStatus({
                                        status: plan?.status,
                                        production_orders: c.job_order?.production_order ? [
                                          {
                                            status: c.job_order.production_order.status,
                                            job_orders: c.job_order.production_order.job_orders || []
                                          }
                                        ] : []
                                      })

                                      const planStatusText = computedStatus === 'completed' ? 'ผลิตสำเร็จ' : 'กำลังดำเนินการ'
                                      const planStatusColor = computedStatus === 'completed' ? '#16A34A' : '#D97706'
                                      const planStatusBg = computedStatus === 'completed' ? '#F0FDF4' : '#FFFBEB'
                                      const planStatusBorder = computedStatus === 'completed' ? '#86EFAC' : '#FDE68A'

                                      return (
                                        <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: '#fff', border: '1px solid var(--border)', borderRadius: 8 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>แผนผลิต: {planDateStr}</span>
                                              <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, background: '#F1F5F9', color: '#475569', padding: '1px 5px', borderRadius: 4 }}>{poNumber}</span>
                                            </div>
                                            <span style={{ fontSize: 9, fontWeight: 700, color: planStatusColor, background: planStatusBg, border: `1px solid ${planStatusBorder}`, padding: '1px 6px', borderRadius: 50 }}>
                                              แผน: {planStatusText}
                                            </span>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, borderTop: '1px dashed #E2E8F0', paddingTop: 4, marginTop: 2 }}>
                                            <div style={{ display: 'flex', gap: 12 }}>
                                              <span>เฟสเทปูน: <strong style={{ color: '#1E293B' }}>{c.phase}</strong></span>
                                              {c.mix_ratio && <span>สูตรผสม: <strong style={{ color: '#1E293B' }}>{c.mix_ratio}</strong></span>}
                                              <span>เวลาขอคอนกรีต: <span style={{ color: 'var(--text-muted)' }}>{c.requested_at ? new Date(c.requested_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '—'}</span></span>
                                            </div>
                                            <span style={{ fontWeight: 700, color: '#D97706' }}>
                                              รอจ่าย: {fmtNum(c.qty_requested, 2)} ลบ.ม.
                                            </span>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#FFFDF0' }}>
                      <td style={{ padding: '7px 14px', fontWeight: 700, fontSize: 11, color: '#B45309', borderTop: '2px solid #FDE68A' }}>รวมคอนกรีตระหว่างดำเนินการ</td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', fontWeight: 800, fontSize: 12, color: '#475569', borderTop: '2px solid #FDE68A', fontFamily: 'monospace' }}>
                        {fmtNum(Object.values(concreteByCat).filter(r => r.requestedCount > 0).reduce((s, r) => s + r.totalQty, 0), 2)} ลบ.ม.
                      </td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', fontWeight: 800, fontSize: 12, color: '#16A34A', borderTop: '2px solid #FDE68A', fontFamily: 'monospace' }}>
                        {fmtNum(Object.values(concreteByCat).filter(r => r.requestedCount > 0).reduce((s, r) => s + r.suppliedQty, 0), 2)} ลบ.ม.
                      </td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', fontWeight: 800, fontSize: 12, color: '#D97706', borderTop: '2px solid #FDE68A', fontFamily: 'monospace' }}>
                        {fmtNum(Object.values(concreteByCat).filter(r => r.requestedCount > 0).reduce((s, r) => s + r.requestedQty, 0), 2)} ลบ.ม.
                      </td>
                      <td colSpan={2} style={{ borderTop: '2px solid #FDE68A' }} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

          {/* ── ส่งแล้ว / QC ผ่านแล้ว (supplied) ── */}
          {Object.values(concreteByCat).some(r => r.suppliedCount > 0) && (
            <>
              <div style={{ padding: '8px 18px', background: '#F0FDF4', borderTop: Object.values(concreteByCat).some(r => r.requestedCount > 0) ? '2px dashed #D1FAE5' : undefined, borderBottom: '1px solid #D1FAE5', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-check-double" style={{ color: '#16A34A', fontSize: 11 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#14532D' }}>
                  ✅ ส่งคอนกรีตแล้ว / QC ผ่านแล้ว
                </span>
                <span style={{ fontSize: 10, color: '#16A34A', marginLeft: 'auto' }}>
                  คอนกรีตที่ส่งแล้ว (status = supplied) — นับเป็นการใช้งานจริง
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {[
                        { label: 'หมวดหมู่สินค้า / คลิกดูคำสั่ง', align: 'left' },
                        { label: 'สั่งผลิตรวม (ลบ.ม.)', align: 'right' },
                        { label: 'จ่ายแล้วจริง (ลบ.ม.)', align: 'right' },
                        { label: '% จ่าย', align: 'right' },
                        { label: 'จำนวน Order', align: 'center' },
                        { label: 'สถานะ', align: 'center' },
                      ].map(h => (
                        <th key={h.label} style={{ padding: '8px 14px', textAlign: h.align as 'left' | 'right' | 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', background: '#F9FFF9', whiteSpace: 'nowrap' }}>{h.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(concreteByCat)
                      .filter(([, r]) => r.suppliedCount > 0)
                      .sort(([a], [b]) => a.localeCompare(b, 'th'))
                      .map(([cat, row]) => {
                        const style = getProductCodeStyle(cat)
                        const prefix = cat.split(' ')[0] ?? ''
                        const p = pct(row.suppliedQty, row.totalQty)
                        const isExpanded = !!expandedConcrete[`sup-${cat}`]

                        // กรองคำสั่งซื้อคอนกรีตในหมวดหมู่ที่ส่งคอนกรีตเรียบร้อยแล้ว
                        const catOrders = concreteItems.filter(c => {
                          const itemCat = c.job_order?.plan_item?.product?.category ?? 'ไม่ระบุหมวดหมู่'
                          return itemCat === cat && (c.status === 'supplied' || c.status === 'received')
                        })

                        return (
                          <Fragment key={`sup-${cat}`}>
                            <tr onClick={() => setExpandedConcrete(prev => ({ ...prev, [`sup-${cat}`]: !prev[`sup-${cat}`] }))} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} className="hover:bg-slate-50 transition-colors">
                              <td style={{ padding: '11px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <i className={`fas ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ color: 'var(--text-muted)', fontSize: 9, width: 8 }} />
                                  <div style={{ width: 32, height: 32, borderRadius: 8, background: style.bg, border: `1px solid ${style.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <i className={`fas ${style.icon}`} style={{ color: style.color, fontSize: 12 }} />
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 700, color: style.color, fontSize: 12 }}>{cat}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>รหัสสินค้า: {prefix}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>
                                {fmtNum(row.totalQty, 2)} ลบ.ม.
                              </td>
                              <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#16A34A' }}>
                                {fmtNum(row.suppliedQty, 2)} ลบ.ม.
                              </td>
                              <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                                  <span style={{ fontWeight: 700, fontSize: 12, color: p >= 100 ? '#16A34A' : '#2563EB' }}>{p}%</span>
                                  <div style={{ width: 60, height: 3, background: 'var(--border)', borderRadius: 3 }}>
                                    <div style={{ width: `${p}%`, height: 3, borderRadius: 3, background: p >= 100 ? '#16A34A' : '#2563EB' }} />
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '11px 14px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#475569' }}>
                                {row.suppliedCount}
                              </td>
                              <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                                <BadgeDone label="ส่งแล้ว" />
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={6} style={{ padding: '12px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {catOrders.map(c => {
                                      const plan = c.job_order?.production_order?.plan
                                      const planDateStr = plan?.plan_date ? new Date(plan.plan_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
                                      const poNumber = c.job_order?.production_order?.order_number ?? '—'
                                      
                                      // Compute status using helper
                                      const computedStatus = getPlanComputedStatus({
                                        status: plan?.status,
                                        production_orders: c.job_order?.production_order ? [
                                          {
                                            status: c.job_order.production_order.status,
                                            job_orders: c.job_order.production_order.job_orders || []
                                          }
                                        ] : []
                                      })

                                      const planStatusText = computedStatus === 'completed' ? 'ผลิตสำเร็จ' : 'กำลังดำเนินการ'
                                      const planStatusColor = computedStatus === 'completed' ? '#16A34A' : '#D97706'
                                      const planStatusBg = computedStatus === 'completed' ? '#F0FDF4' : '#FFFBEB'
                                      const planStatusBorder = computedStatus === 'completed' ? '#86EFAC' : '#FDE68A'

                                      return (
                                        <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: '#fff', border: '1px solid var(--border)', borderRadius: 8 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>แผนผลิต: {planDateStr}</span>
                                              <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, background: '#F1F5F9', color: '#475569', padding: '1px 5px', borderRadius: 4 }}>{poNumber}</span>
                                            </div>
                                            <span style={{ fontSize: 9, fontWeight: 700, color: planStatusColor, background: planStatusBg, border: `1px solid ${planStatusBorder}`, padding: '1px 6px', borderRadius: 50 }}>
                                              แผน: {planStatusText}
                                            </span>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, borderTop: '1px dashed #E2E8F0', paddingTop: 4, marginTop: 2 }}>
                                            <div style={{ display: 'flex', gap: 12 }}>
                                              <span>เฟสเทปูน: <strong style={{ color: '#1E293B' }}>{c.phase}</strong></span>
                                              {c.mix_ratio && <span>สูตรผสม: <strong style={{ color: '#1E293B' }}>{c.mix_ratio}</strong></span>}
                                              <span>เวลาส่งคอนกรีต: <span style={{ color: 'var(--text-muted)' }}>{c.requested_at ? new Date(c.requested_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '—'}</span></span>
                                              <span style={{ color: 'var(--text-muted)' }}>สถานะ: <strong style={{ color: c.status === 'received' ? '#16A34A' : '#0284C7' }}>{c.status === 'received' ? 'รับแล้ว' : 'ส่งแล้ว'}</strong></span>
                                            </div>
                                            <span style={{ fontWeight: 700, color: '#16A34A' }}>
                                              จ่ายคอนกรีตแล้ว: {fmtNum(c.qty_requested, 2)} ลบ.ม.
                                            </span>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#F0FDF4' }}>
                      <td style={{ padding: '7px 14px', fontWeight: 700, fontSize: 11, color: '#16A34A', borderTop: '2px solid #D1FAE5' }}>รวมคอนกรีตที่จ่ายแล้ว</td>
                      {/* สั่งผลิตรวม */}
                      <td style={{ padding: '7px 14px', textAlign: 'right', fontWeight: 800, fontSize: 12, color: '#065F46', borderTop: '2px solid #D1FAE5', fontFamily: 'monospace' }}>
                        {fmtNum(Object.values(concreteByCat).filter(r => r.suppliedCount > 0).reduce((s, r) => s + r.totalQty, 0), 2)} ลบ.ม.
                      </td>
                      {/* จ่ายแล้วจริง */}
                      <td style={{ padding: '7px 14px', textAlign: 'right', fontWeight: 800, fontSize: 12, color: '#16A34A', borderTop: '2px solid #D1FAE5', fontFamily: 'monospace' }}>
                        {fmtNum(Object.values(concreteByCat).filter(r => r.suppliedCount > 0).reduce((s, r) => s + r.suppliedQty, 0), 2)} ลบ.ม.
                      </td>
                      <td colSpan={3} style={{ borderTop: '2px solid #D1FAE5' }} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

          {concreteItems.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              <i className="fas fa-fill-drip" style={{ fontSize: 24, opacity: 0.3, display: 'block', marginBottom: 8 }} />
              ไม่พบข้อมูลคอนกรีตในช่วงเวลาที่เลือก
            </div>
          )}
        </div>
      )}

      {catFilter === 'คอนกรีต' && Object.keys(concreteByCat).length === 0 && (
        <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
          <i className="fas fa-fill-drip" style={{ fontSize: 38, opacity: 0.25, display: 'block', marginBottom: 10 }} />
          <p style={{ fontSize: 13, fontWeight: 600 }}>ไม่พบข้อมูลคอนกรีตในช่วงเวลาที่เลือก</p>
        </div>
      )}
    </div>
  )
}

// ─── MaterialTable sub-component ─────────────────────────────────────────────

function MaterialTable({
  rows, cat, unit, bucket, fmtNum, pct, dispToDisplay,
}: {
  rows: AggRow[]
  cat: string
  unit: string
  bucket: 'ip' | 'cp'
  fmtNum: (n: number, d?: number) => string
  pct: (disp: number, req: number) => number
  dispToDisplay: (cat: string, raw: number, wpm: number | null) => number
}) {
  const cfg = CAT_CONFIG[cat]
  const isIp = bucket === 'ip'

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})
  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const req  = (r: AggRow) => isIp ? r.ipReq  : r.cpReq
  const disp = (r: AggRow) => dispToDisplay(cat, isIp ? r.ipDispRaw : r.cpDispRaw, r.weight_per_meter)

  const totalReq  = rows.reduce((s, r) => s + req(r),  0)
  const totalDisp = rows.reduce((s, r) => s + disp(r), 0)

  function MatStatusBadge({ row }: { row: AggRow }) {
    if (!isIp) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700, background: '#F0FDF4', color: '#16A34A', border: '1px solid #86EFAC' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E' }} />ผลิตสำเร็จ</span>
    // ip bucket: show material dispensing status
    if (row.ipMatPending > 0 && row.ipMatDone === 0)
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }} />รอจ่ายวัตถุดิบ</span>
    if (row.ipMatPending > 0 && row.ipMatDone > 0)
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6' }} />จ่ายบางส่วน</span>
    // all done but plan still confirmed
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700, background: '#F5F3FF', color: '#7C3AED', border: '1px solid #C4B5FD' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8B5CF6' }} />จ่ายครบ-รอ QC</span>
  }

  const headers = isIp ? [
    { label: 'รหัสวัตถุดิบ / คลิกดูแผนผลิต', align: 'left' },
    { label: 'ชื่อวัตถุดิบ', align: 'left' },
    { label: `ต้องการ (${unit})`, align: 'right' },
    { label: `จ่ายแล้ว (${unit})`, align: 'right' },
    { label: '% จ่าย', align: 'right' },
    { label: 'แผนผลิต', align: 'center' },
    { label: 'สถานะวัตถุดิบ', align: 'center' },
  ] : [
    { label: 'รหัสวัตถุดิบ / คลิกดูแผนผลิต', align: 'left' },
    { label: 'ชื่อวัตถุดิบ', align: 'left' },
    { label: `ต้องการ (${unit})`, align: 'right' },
    { label: `จ่ายแล้ว (${unit})`, align: 'right' },
    { label: '% จ่าย', align: 'right' },
    { label: 'แผนผลิต', align: 'center' },
    { label: 'เบิกจ่ายล่าสุด', align: 'center' },
    { label: 'สถานะ', align: 'center' },
  ]

  const bgHead = isIp ? '#FFFDF0' : '#F9FFF9'
  const bgFoot = isIp ? '#FFFBEB' : '#F0FDF4'
  const borderFoot = isIp ? '#FDE68A' : '#D1FAE5'
  const colorFoot  = isIp ? '#D97706' : '#16A34A'

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h.label} style={{ padding: '8px 14px', textAlign: h.align as 'left' | 'right' | 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', background: bgHead, whiteSpace: 'nowrap' }}>{h.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const rq  = req(row)
            const dp  = disp(row)
            const p   = pct(dp, rq)
            const isExpanded = !!expandedRows[row.id]
            
            // กรองเฉพาะ entry ที่ตรงกับ bucket นี้
            const filteredEntries = row.entries.filter(i => {
              const status = getPlanComputedStatus(i.plan)
              return isIp ? status === 'in_progress' : status === 'completed'
            })

            return (
              <Fragment key={row.id}>
                <tr onClick={() => toggleRow(row.id)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} className="hover:bg-slate-50 transition-colors">
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className={`fas ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ color: 'var(--text-muted)', fontSize: 9, width: 8 }} />
                      {row.material_code
                        ? <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '2px 6px', borderRadius: 4 }}>{row.material_code}</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{row.name}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                    {fmtNum(rq, 2)} {unit}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: dp > 0 ? (isIp ? '#D97706' : '#16A34A') : 'var(--text-muted)' }}>
                    {dp > 0 ? `${fmtNum(dp, 2)} ${unit}` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: p >= 100 ? '#16A34A' : p > 50 ? '#2563EB' : '#D97706' }}>{p}%</span>
                      <div style={{ width: 60, height: 3, background: 'var(--border)', borderRadius: 3 }}>
                        <div style={{ width: `${p}%`, height: 3, borderRadius: 3, background: p >= 100 ? '#16A34A' : p > 50 ? '#2563EB' : '#D97706' }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#475569' }}>
                    {filteredEntries.length}
                  </td>
                  {!isIp && (
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                      {row.lastDispensedAt ? new Date(row.lastDispensedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '—'}
                    </td>
                  )}
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <MatStatusBadge row={row} />
                  </td>
                </tr>

                {isExpanded && (
                  <tr>
                    <td colSpan={headers.length} style={{ padding: '12px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className="fas fa-network-wired" /> รายการแผนการผลิตที่ระบุใช้วัตถุดิบนี้ ({filteredEntries.length} แผน)
                        </div>
                        {filteredEntries.length === 0 ? (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>ไม่มีรายละเอียดแผนการผลิตในส่วนนี้</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {filteredEntries.map(entry => {
                              const planDateStr = entry.plan?.plan_date ? new Date(entry.plan.plan_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
                              const poNumber = entry.plan?.production_orders?.[0]?.order_number ?? `PO-${entry.plan?.plan_date?.replace(/-/g, '')}-xxx`
                              
                              // Compute detailed status from nested orders
                              const orders = entry.plan?.production_orders || []
                              let detailStatusText = 'กำลังดำเนินการ'
                              let detailStatusColor = '#D97706'
                              let detailStatusBg = '#FFFBEB'
                              let detailStatusBorder = '#FDE68A'
                              
                              if (orders.length > 0) {
                                const o = orders[0]
                                const isErpSynced = o.status === 'erp_synced'
                                const jobOrders = o.job_orders || []
                                const isFullyDemolded = jobOrders.length > 0 && jobOrders.every((j: any) => j.status === 'demolded' || j.status === 'qc_passed')
                                
                                if (isErpSynced) {
                                  detailStatusText = 'บันทึกเข้าระบบแล้ว (FG)'
                                  detailStatusColor = '#16A34A'
                                  detailStatusBg = '#F0FDF4'
                                  detailStatusBorder = '#86EFAC'
                                } else if (isFullyDemolded) {
                                  detailStatusText = 'QC ตรวจสอบแล้ว'
                                  detailStatusColor = '#2563EB'
                                  detailStatusBg = '#EFF6FF'
                                  detailStatusBorder = '#BFDBFE'
                                }
                              }

                              const planItems = entry.plan?.items || []

                              return (
                                <div key={entry.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: '#fff', border: '1px solid var(--border)', borderRadius: 8 }}>
                                  
                                  {/* Plan Header */}
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid #F1F5F9', paddingBottom: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 11 }}>
                                        <i className="fas fa-calendar-day" style={{ marginRight: 6, color: '#3B82F6' }} />
                                        แผนผลิต: {planDateStr}
                                      </span>
                                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#475569', fontSize: 10, background: '#F1F5F9', padding: '1px 5px', borderRadius: 4 }}>
                                        {poNumber}
                                      </span>
                                    </div>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: detailStatusColor, background: detailStatusBg, border: `1px solid ${detailStatusBorder}`, padding: '1px 6px', borderRadius: 50 }}>
                                      {detailStatusText}
                                    </span>
                                  </div>

                                  {/* Plan items / Products */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>สินค้าที่ผลิตในแผน:</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 6 }}>
                                      {planItems.length === 0 ? (
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>ไม่พบข้อมูลรายการสินค้า</span>
                                      ) : (
                                        planItems.map((item: any) => {
                                          const prod = item.product
                                          if (!prod) return null
                                          const qtyInfo = getProductMaterialQty(prod, entry.raw_material_id, cat)
                                          const totalForProduct = qtyInfo.perUnit * item.qty_target
                                          
                                          return (
                                            <div key={item.id} style={{ display: 'flex', flexDirection: 'column', padding: '6px 10px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1E293B', fontSize: 11 }}>
                                                <span>{prod.name} ({prod.code})</span>
                                                <span style={{ color: '#2563EB' }}>{item.qty_target} {prod.unit || 'ชิ้น'}</span>
                                              </div>
                                              
                                              {qtyInfo.perUnit > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                                                  <span>อัตราส่วนวัตถุดิบต่อชิ้น:</span>
                                                  <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                                                    {fmtNum(qtyInfo.perUnit)} {unit} {qtyInfo.isBom ? '(BOM)' : '(ค่าประมาณ)'}
                                                  </span>
                                                </div>
                                              )}
                                              {totalForProduct > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9A3412', borderTop: '1px dashed #E2E8F0', marginTop: 3, paddingTop: 3, fontWeight: 700 }}>
                                                  <span>ความต้องการในรายการนี้:</span>
                                                  <span style={{ fontFamily: 'monospace' }}>
                                                    {fmtNum(totalForProduct)} {unit}
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          )
                                        })
                                      )}
                                    </div>
                                  </div>

                                  {/* Entry Material Summary */}
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, fontSize: 10, fontWeight: 700, borderTop: '1px solid #F1F5F9', paddingTop: 6, marginTop: 4 }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                      ต้องการในแผนนี้: <strong style={{ color: '#1E293B' }}>{fmtNum(entry.qty_required, 2)} {unit}</strong>
                                    </span>
                                    <span style={{ color: '#16A34A' }}>
                                      เบิกจ่ายจริงในแผนนี้: <strong style={{ color: '#16A34A' }}>{fmtNum(dispToDisplay(cat, entry.qty_dispensed, entry.raw_material?.weight_per_meter ?? null), 2)} {unit}</strong>
                                    </span>
                                  </div>

                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: bgFoot }}>
            <td colSpan={2} style={{ padding: '7px 14px', fontWeight: 700, fontSize: 11, color: colorFoot, borderTop: `2px solid ${borderFoot}` }}>
              รวม ({rows.length} รายการ)
            </td>
            <td style={{ padding: '7px 14px', textAlign: 'right', fontWeight: 800, fontSize: 12, color: cfg?.color ?? 'var(--text-primary)', borderTop: `2px solid ${borderFoot}`, fontFamily: 'monospace' }}>
              {fmtNum(totalReq, 2)} {unit}
            </td>
            <td style={{ padding: '7px 14px', textAlign: 'right', fontWeight: 800, fontSize: 12, color: colorFoot, borderTop: `2px solid ${borderFoot}`, fontFamily: 'monospace' }}>
              {fmtNum(totalDisp, 2)} {unit}
            </td>
            <td colSpan={isIp ? 3 : 4} style={{ borderTop: `2px solid ${borderFoot}` }} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
