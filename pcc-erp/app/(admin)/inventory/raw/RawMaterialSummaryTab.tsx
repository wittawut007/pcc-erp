'use client'

import { useState, useMemo, useTransition, useCallback, Fragment, useRef, useEffect } from 'react'
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
      bed?: string | null
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
  dispensed_by_profile?: {
    full_name: string
  } | null
}

interface ConcreteOrder {
  id: string
  phase: string
  qty_requested: number
  status: string        // 'requested' | 'supplied'
  mix_ratio: string | null
  requested_at: string
  requested_by_profile?: {
    full_name: string
  } | null
  supplied_by_profile?: {
    full_name: string
  } | null
  job_order: {
    id: string
    bed?: string | null
    plan_item: {
      id: string
      qty_target: number
      bed?: string | null
      product: {
        id: string
        code: string
        name: string
        category: string  // e.g. "A13 แผ่นพื้นตัน"
        concrete_per_unit: number | null
        size?: string | null
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
        bed?: string | null
      }[]
      plan: {
        id: string
        plan_date: string
        status: string   // 'confirmed' | 'completed'
        total_concrete: number | null
        production_orders?: any[]
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

// ─── Production Order (PO) Aggregation Types ───────────────────────────────────

interface PoMaterialRow {
  id: string
  rawMaterialId: string
  materialCode: string | null
  name: string
  category: string
  unit: string
  weight_per_meter: number | null
  qtyRequired: number
  qtyDispensedRaw: number
  qtyDispensedDisplay: number
  percent: number
  status: string
  dispensedAt: string | null
  dispensedBy: string | null
}

interface PoProductInfo {
  id: string
  planItemId?: string
  code: string
  name: string
  qtyTarget: number
  unit: string
  size?: string | null
  bed?: string | null
  concretePerUnit?: number | null
  wirePerUnit?: number | null
  rebarPerUnit?: number | null
  meshPerUnit?: number | null
  productBomItems?: any[]
}

interface PoConcreteOrderInfo {
  id: string
  phase: string
  qtyRequested: number
  status: string
  mixRatio: string | null
  requestedAt: string
  bed: string | null
  requestedBy?: string | null
  suppliedBy?: string | null
}

interface PoDashboard {
  concreteVol: number
  concreteWeightTon: number
  wireWeightKg: number
  wireLengthM: number
  rebarLengthM: number
  rebarWeightKg: number
  meshAreaSqm: number
  meshWeightKg: number
}

interface PoGroupRow {
  key: string
  poNumber: string
  planId: string
  planDate: string
  computedStatus: 'completed' | 'in_progress'
  statusInfo: { text: string; color: string; bg: string; border: string }
  products: PoProductInfo[]
  materials: PoMaterialRow[]
  concreteOrders: PoConcreteOrderInfo[]
  dashboard: PoDashboard
  totalsByCategory: Record<string, { req: number; disp: number; unit: string }>
}

interface ConcretePoSummaryRow {
  key: string
  poNumber: string
  planId: string
  planDate: string
  beds: string[]
  requesters: string[]
  productSummary: string
  totalRequested: number
  suppliedQty: number
  requestedQty: number
  weightTon: number
  orderCount: number
  statusText: string
  computedStatus: 'completed' | 'in_progress'
  orders: PoConcreteOrderInfo[]
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function getPlanComputedStatus(plan: any): 'completed' | 'in_progress' {
  if (!plan) return 'in_progress'
  if (plan.status === 'completed') return 'completed'

  const orders = plan.production_orders || []
  if (orders.length === 0) return 'in_progress'

  const allOrdersFinished = orders.every((o: any) => {
    // หาก production_order ถูกซิงค์เข้า FG หรือมีสถานะเป็น completed ถือว่าเสร็จสิ้นแล้ว
    if (o.status === 'completed' || o.status === 'erp_synced') return true
    
    const jobOrders = o.job_orders || []
    if (jobOrders.length === 0) return false
    return jobOrders.every((j: any) => 
      j.status === 'demolded' || j.status === 'qc_passed' || j.status === 'completed'
    )
  })

  return allOrdersFinished ? 'completed' : 'in_progress'
}

function getPoDetailStatus(plan: any) {
  const computedStatus = getPlanComputedStatus(plan)
  const orders = plan?.production_orders || []
  if (orders.length > 0) {
    const o = orders[0]
    if (o.status === 'erp_synced') {
      return { text: 'บันทึกเข้าระบบแล้ว (FG)', color: '#16A34A', bg: '#F0FDF4', border: '#86EFAC' }
    }
    if (o.status === 'completed') {
      return { text: 'ผลิตสำเร็จ', color: '#16A34A', bg: '#F0FDF4', border: '#86EFAC' }
    }
    const jobOrders = o.job_orders || []
    const isFullyDemolded = jobOrders.length > 0 && jobOrders.every((j: any) => 
      j.status === 'demolded' || j.status === 'qc_passed' || j.status === 'completed'
    )
    if (isFullyDemolded) {
      return { text: 'QC ตรวจสอบแล้ว', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' }
    }
  }
  if (computedStatus === 'completed') {
    return { text: 'ผลิตสำเร็จ', color: '#16A34A', bg: '#F0FDF4', border: '#86EFAC' }
  }
  return { text: 'กำลังดำเนินการ', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' }
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
  { id: 'year',    label: 'ปีนี้' },
  { id: 'all',     label: 'ทั้งหมด' },
  { id: 'custom',  label: 'กำหนดเอง' },
]

function getPresetRange(preset: string): { from: string; to: string } {
  const now = new Date()
  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
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
  if (preset === 'year') {
    return {
      from: fmt(new Date(now.getFullYear(), 0, 1)),
      to:   fmt(new Date(now.getFullYear(), 11, 31)),
    }
  }
  if (preset === 'all') {
    return { from: '', to: '' }
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

function pct(disp: number, req: number): number {
  return req > 0 ? Math.min(100, Math.round((disp / req) * 100)) : 0
}

function fmtNum(n: number, d = 2): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
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
  const [items, setItems]                 = useState<SummaryItem[]>(initialData)
  const [concreteItems, setConcreteItems] = useState<ConcreteOrder[]>(initialConcrete as ConcreteOrder[])
  const [isPending, startTransition]      = useTransition()

  // Filter States – สไตล์เดียวกับหน้าสินค้าพร้อมขาย สามารถเลือกวันที่ย้อนหลังได้อิสระ
  const initialRange = getPresetRange('month')
  const [preset, setPreset]             = useState<string>('month')
  const [dateFrom, setDateFrom]         = useState<string>(initialRange.from)
  const [dateTo, setDateTo]             = useState<string>(initialRange.to)
  const [catFilter, setCatFilter]       = useState<string>('ทั้งหมด')
  const [search, setSearch]             = useState<string>('')
  const [sortBy, setSortBy]             = useState<'name' | 'required' | 'dispensed'>('name')
  const [statusFilter, setStatusFilter] = useState<'ทั้งหมด' | 'กำลังผลิต' | 'ผลิตสำเร็จ'>('ทั้งหมด')

  // Toggle View: แยกตามหมวดวัตถุดิบ vs แยกตามใบสั่งผลิต (PO)
  const [viewMode, setViewMode]         = useState<'by-material' | 'by-po'>('by-material')
  const [defaultExpanded, setDefaultExpanded] = useState<boolean>(true)
  const [expandedPo, setExpandedPo]     = useState<Record<string, boolean>>({})
  const [concreteViewMode, setConcreteViewMode] = useState<'by-po' | 'by-cat'>('by-po')
  
  const [expandedConcrete, setExpandedConcrete] = useState<Record<string, boolean>>({})
  const toggleConcrete = (cat: string) => {
    setExpandedConcrete(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  // Auto-fetch เมื่อเปลี่ยนช่วงวันที่หรือหมวดหมู่ (เว้น initial mount)
  const isInitialMount = useRef(true)

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

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    refetch()
  }, [dateFrom, dateTo, catFilter, refetch])

  // Handle Preset selection
  const handleSelectPreset = (pId: string) => {
    setPreset(pId)
    if (pId !== 'custom') {
      const range = getPresetRange(pId)
      setDateFrom(range.from)
      setDateTo(range.to)
    }
  }

  // Handle manual date changes
  const handleDateFromChange = (val: string) => {
    setDateFrom(val)
    setPreset('custom')
  }

  const handleDateToChange = (val: string) => {
    setDateTo(val)
    setPreset('custom')
  }

  // ─── PO (ใบสั่งผลิต) Groups Aggregation ──────────────────────────────────────
  const poGroups = useMemo(() => {
    const map: Record<string, PoGroupRow> = {}

    // 1. จัดกลุ่มจากรายการวัตถุดิบ (items)
    items.forEach(i => {
      const plan = i.plan
      if (!plan) return

      const computedStatus = getPlanComputedStatus(plan)
      const isCompleted = computedStatus === 'completed'
      const showIp = statusFilter === 'ทั้งหมด' || statusFilter === 'กำลังผลิต'
      const showCp = statusFilter === 'ทั้งหมด' || statusFilter === 'ผลิตสำเร็จ'

      if (isCompleted && !showCp) return
      if (!isCompleted && !showIp) return

      const orders = plan.production_orders || []
      const poNumber = orders[0]?.order_number ?? `PO-${plan.plan_date?.replace(/-/g, '') || 'PENDING'}-${plan.id.slice(0, 4)}`
      const key = `${plan.id}_${poNumber}`

      if (!map[key]) {
        const statusInfo = getPoDetailStatus(plan)

        const products: PoProductInfo[] = (plan.items || []).map(it => ({
          planItemId: it?.id || '',
          id: it?.product?.id || it?.id || '',
          code: it?.product?.code || '—',
          name: it?.product?.name || '—',
          qtyTarget: it?.qty_target || 0,
          unit: it?.product?.unit || 'ชิ้น',
          size: it?.product?.size || null,
          bed: it?.bed || null,
          concretePerUnit: it?.product?.concrete_per_unit || 0,
          wirePerUnit: it?.product?.wire_per_unit || 0,
          rebarPerUnit: it?.product?.rebar_per_unit || 0,
          meshPerUnit: it?.product?.mesh_per_unit || 0,
          productBomItems: (it?.product as any)?.product_bom_items || [],
        }))

        map[key] = {
          key,
          poNumber,
          planId: plan.id,
          planDate: plan.plan_date,
          computedStatus,
          statusInfo,
          products,
          materials: [],
          concreteOrders: [],
          dashboard: {
            concreteVol: 0,
            concreteWeightTon: 0,
            wireWeightKg: 0,
            wireLengthM: 0,
            rebarLengthM: 0,
            rebarWeightKg: 0,
            meshAreaSqm: 0,
            meshWeightKg: 0,
          },
          totalsByCategory: {},
        }
      }

      const rawMat = i.raw_material
      const cat = rawMat?.category ?? ''
      const unit = getCatUnit(cat) || rawMat?.unit || ''
      const dispDisplay = dispToDisplay(cat, i.qty_dispensed, rawMat?.weight_per_meter ?? null)
      const p = pct(dispDisplay, i.qty_required)

      map[key].materials.push({
        id: i.id,
        rawMaterialId: i.raw_material_id,
        materialCode: rawMat?.material_code ?? null,
        name: rawMat?.name ?? '—',
        category: cat,
        unit,
        weight_per_meter: rawMat?.weight_per_meter ?? null,
        qtyRequired: i.qty_required,
        qtyDispensedRaw: i.qty_dispensed,
        qtyDispensedDisplay: dispDisplay,
        percent: p,
        status: i.status,
        dispensedAt: i.dispensed_at,
        dispensedBy: i.dispensed_by_profile?.full_name ?? null,
      })

      if (!map[key].totalsByCategory[cat]) {
        map[key].totalsByCategory[cat] = { req: 0, disp: 0, unit }
      }
      map[key].totalsByCategory[cat].req += i.qty_required
      map[key].totalsByCategory[cat].disp += dispDisplay
    })

    // 2. เชื่อมโยงข้อมูลคำสั่งคอนกรีตจริง (concreteItems) และคำนวณ Dashboard 4 กล่องของแต่ละ PO
    Object.values(map).forEach(po => {
      // ค้นหาคำสั่งคอนกรีตที่สัมพันธ์กับ PO นี้
      const matchingConcrete = concreteItems.filter(c => {
        const oNum = c.job_order?.production_order?.order_number
        const pId = c.job_order?.production_order?.plan_id
        if (oNum && po.poNumber) {
          return oNum === po.poNumber
        }
        return pId && pId === po.planId
      })

      po.concreteOrders = matchingConcrete.map(c => ({
        id: c.id,
        phase: c.phase,
        qtyRequested: c.qty_requested,
        status: c.status,
        mixRatio: c.mix_ratio,
        requestedAt: c.requested_at,
        bed: c.job_order?.bed ?? c.job_order?.plan_item?.bed ?? null,
        requestedBy: c.requested_by_profile?.full_name ?? null,
        suppliedBy: c.supplied_by_profile?.full_name ?? null,
      }))

      // คำนวณปริมาณคอนกรีต
      let concreteReq = 0
      let concreteSupplied = 0
      if (matchingConcrete.length > 0) {
        concreteReq = matchingConcrete.reduce((s, c) => s + c.qty_requested, 0)
        concreteSupplied = matchingConcrete
          .filter(c => c.status === 'supplied' || c.status === 'received')
          .reduce((s, c) => s + c.qty_requested, 0)
      } else {
        // Fallback จากสูตรสินค้าในแผน
        concreteReq = po.products.reduce((s, p) => s + (p.qtyTarget * (p.concretePerUnit || 0)), 0)
        concreteSupplied = po.computedStatus === 'completed' ? concreteReq : 0
      }

      // นำคอนกรีตผสมเสร็จเข้ามาแสดงเป็นหนึ่งในวัตถุดิบหลักของ PO นั้น
      if (concreteReq > 0 || matchingConcrete.length > 0) {
        const isDone = concreteSupplied >= concreteReq && concreteReq > 0
        const isPart = concreteSupplied > 0 && !isDone
        const concStatus = isDone ? 'dispensed' : isPart ? 'partial' : 'pending'
        const concPercent = pct(concreteSupplied, concreteReq)

        // ดึงชื่อผู้สั่งคอนกรีตมาแสดงในช่องผู้บันทึกจ่าย/ผู้สั่ง
        const concRequesters = matchingConcrete
          .map(c => c.requested_by_profile?.full_name)
          .filter(Boolean) as string[]
        const concRequesterStr = concRequesters.length > 0
          ? Array.from(new Set(concRequesters)).join(', ')
          : (matchingConcrete[0]?.mix_ratio ? `สูตร: ${matchingConcrete[0].mix_ratio}` : null)

        po.materials.unshift({
          id: `concrete-${po.planId}`,
          rawMaterialId: 'rmc-concrete',
          materialCode: 'CONC-RMC',
          name: 'คอนกรีตผสมเสร็จ (Ready-mixed Concrete)',
          category: 'คอนกรีต',
          unit: 'ม.³',
          weight_per_meter: null,
          qtyRequired: concreteReq,
          qtyDispensedRaw: concreteSupplied,
          qtyDispensedDisplay: concreteSupplied,
          percent: concPercent,
          status: concStatus,
          dispensedAt: matchingConcrete.find(c => c.status === 'supplied' || c.status === 'received')?.requested_at || null,
          dispensedBy: concRequesterStr,
        })

        po.totalsByCategory['คอนกรีต'] = {
          req: concreteReq,
          disp: concreteSupplied,
          unit: 'ม.³',
        }
      }

      // 3. คำนวณ Dashboard สรุป 4 กล่อง (เหมือน RAW MATERIAL SUMMARY REPORT)
      // 3.1 คอนกรีต
      const concVol = concreteReq
      const concWeightTon = concVol * 2.4

      // 3.2 ลวดเหล็ก
      let wireLen = 0
      let wireWeight = 0
      const wireMats = po.materials.filter(m => m.category === 'ลวด')
      if (wireMats.length > 0) {
        wireLen = wireMats.reduce((s, m) => s + (m.qtyDispensedDisplay || m.qtyRequired), 0)
        wireWeight = wireMats.reduce((s, m) => s + (m.qtyDispensedRaw || (m.qtyRequired * (m.weight_per_meter || 0.154))), 0)
      } else {
        wireWeight = po.products.reduce((s, p) => s + (p.qtyTarget * (p.wirePerUnit || 0)), 0)
        wireLen = wireWeight > 0 ? wireWeight / 0.154 : 0
      }

      // 3.3 เหล็กเส้น
      let rebarLen = 0
      let rebarWeight = 0
      const rebarMats = po.materials.filter(m => m.category === 'เหล็กเส้น')
      if (rebarMats.length > 0) {
        rebarLen = rebarMats.reduce((s, m) => s + (m.qtyDispensedDisplay || m.qtyRequired), 0)
        rebarWeight = rebarMats.reduce((s, m) => s + ((m.qtyDispensedDisplay || m.qtyRequired) * (m.weight_per_meter || 0.888)), 0)
      } else {
        rebarLen = po.products.reduce((s, p) => s + (p.qtyTarget * (p.rebarPerUnit || 0)), 0)
        rebarWeight = rebarLen * 0.888
      }

      // 3.4 ตะแกรง Mesh
      let meshArea = 0
      let meshWeight = 0
      const meshMats = po.materials.filter(m => m.category === 'เมช')
      if (meshMats.length > 0) {
        meshArea = meshMats.reduce((s, m) => s + (m.qtyDispensedDisplay || m.qtyRequired), 0)
        meshWeight = meshArea * 1.32
      } else {
        meshArea = po.products.reduce((s, p) => s + (p.qtyTarget * (p.meshPerUnit || 0)), 0)
        meshWeight = meshArea * 1.32
      }

      po.dashboard = {
        concreteVol: concVol,
        concreteWeightTon: concWeightTon,
        wireWeightKg: wireWeight,
        wireLengthM: wireLen,
        rebarLengthM: rebarLen,
        rebarWeightKg: rebarWeight,
        meshAreaSqm: meshArea,
        meshWeightKg: meshWeight,
      }
    })

    return Object.values(map)
  }, [items, concreteItems, statusFilter])

  // ─── Aggregate concrete by PO (อ้างอิงตามใบสั่งผลิต) ──────────────────────
  const concreteByPo = useMemo(() => {
    const map: Record<string, ConcretePoSummaryRow> = {}
    const showIp = statusFilter === 'ทั้งหมด' || statusFilter === 'กำลังผลิต'
    const showCp = statusFilter === 'ทั้งหมด' || statusFilter === 'ผลิตสำเร็จ'

    // 1. นำข้อมูลจาก concreteItems จัดกลุ่มตาม PO
    concreteItems.forEach(c => {
      const isSupplied = c.status === 'supplied' || c.status === 'received'
      if (isSupplied && !showCp) return
      if (!isSupplied && !showIp) return

      const poOrder = c.job_order?.production_order
      const plan = poOrder?.plan
      // ตรวจสอบเลขที่ PO: ดึง order_number จริงเสมอ หากไม่มีให้ fallback ตาม format PO-YYYYMMDD-001
      const poNum = poOrder?.order_number || (plan?.plan_date ? `PO-${plan.plan_date.replace(/-/g, '')}-001` : '—')
      const planId = poOrder?.plan_id ?? ''
      
      // ดึงสถานะที่แท้จริง: เชื่อมโยงกับ poGroups หรือใช้ poOrder
      const matchingPo = poGroups.find(p => (poNum && p.poNumber === poNum) || (planId && p.planId === planId))
      const computedStatus = matchingPo?.computedStatus ?? getPlanComputedStatus({
        status: plan?.status,
        production_orders: poOrder ? [poOrder] : (plan?.production_orders || [])
      })

      const key = `${planId}_${poNum}`

      if (!map[key]) {
        const prod = c.job_order?.plan_item?.product
        const prodName = prod?.name ?? 'สินค้าทั่วไป'
        const size = prod?.size ? ` (${prod.size})` : ''

        map[key] = {
          key,
          poNumber: poNum,
          planId,
          planDate: plan?.plan_date ?? '',
          beds: [],
          requesters: [],
          productSummary: `${prodName}${size}`,
          totalRequested: 0,
          suppliedQty: 0,
          requestedQty: 0,
          weightTon: 0,
          orderCount: 0,
          statusText: 'รอจ่ายคอนกรีต',
          computedStatus,
          orders: [],
        }
      }

      const row = map[key]
      const bed = c.job_order?.bed ?? c.job_order?.plan_item?.bed
      if (bed && !row.beds.includes(bed)) {
        row.beds.push(bed)
      }
      if (matchingPo) {
        matchingPo.products.forEach(p => {
          if (p.bed && !row.beds.includes(p.bed)) {
            row.beds.push(p.bed)
          }
        })
      }

      const reqName = c.requested_by_profile?.full_name
      if (reqName && !row.requesters.includes(reqName)) {
        row.requesters.push(reqName)
      }

      row.totalRequested += c.qty_requested
      row.orderCount++

      if (isSupplied) {
        row.suppliedQty += c.qty_requested
      } else {
        row.requestedQty += c.qty_requested
      }

      row.orders.push({
        id: c.id,
        phase: c.phase,
        qtyRequested: c.qty_requested,
        status: c.status,
        mixRatio: c.mix_ratio,
        requestedAt: c.requested_at,
        bed: bed ?? null,
        requestedBy: c.requested_by_profile?.full_name ?? null,
        suppliedBy: c.supplied_by_profile?.full_name ?? null,
      })
    })

    // 2. เติมเต็มข้อมูลจาก poGroups เพื่อให้ครอบคลุมทุกใบสั่งผลิตที่มีคอนกรีต (ป้องกันรายการซ้ำซ้อน)
    poGroups.forEach(po => {
      const isAlreadyInMap = Object.values(map).some(
        r => r.poNumber === po.poNumber || (po.planId && r.planId === po.planId)
      )
      if (!isAlreadyInMap && po.dashboard.concreteVol > 0) {
        const isCompleted = po.computedStatus === 'completed'
        const key = `${po.planId}_${po.poNumber}`
        const poBeds: string[] = []
        po.products.forEach(p => {
          if (p.bed && !poBeds.includes(p.bed)) poBeds.push(p.bed)
        })
        po.concreteOrders.forEach(c => {
          if (c.bed && !poBeds.includes(c.bed)) poBeds.push(c.bed)
        })

        const poRequesters: string[] = []
        po.concreteOrders.forEach(c => {
          if (c.requestedBy && !poRequesters.includes(c.requestedBy)) {
            poRequesters.push(c.requestedBy)
          }
        })

        map[key] = {
          key,
          poNumber: po.poNumber,
          planId: po.planId,
          planDate: po.planDate ?? '',
          beds: poBeds,
          requesters: poRequesters,
          productSummary: po.products.map(p => `${p.name}${p.size ? ` (${p.size})` : ''}`).join(', ') || 'สินค้าตามแผน',
          totalRequested: po.dashboard.concreteVol,
          suppliedQty: isCompleted ? po.dashboard.concreteVol : 0,
          requestedQty: isCompleted ? 0 : po.dashboard.concreteVol,
          weightTon: po.dashboard.concreteWeightTon,
          orderCount: po.concreteOrders.length,
          statusText: isCompleted ? 'จ่ายครบแล้ว' : 'รอจ่ายคอนกรีต',
          computedStatus: po.computedStatus,
          orders: po.concreteOrders.map(c => ({
            id: c.id,
            phase: c.phase,
            qtyRequested: c.qtyRequested,
            status: c.status,
            mixRatio: c.mixRatio,
            requestedAt: c.requestedAt,
            bed: c.bed,
            requestedBy: c.requestedBy ?? null,
            suppliedBy: c.suppliedBy ?? null,
          })),
        }
      }
    })

    // คำนวณน้ำหนักและสถานะ
    Object.values(map).forEach(r => {
      r.weightTon = r.totalRequested * 2.4
      r.statusText = r.suppliedQty >= r.totalRequested && r.totalRequested > 0
        ? 'จ่ายครบแล้ว'
        : r.suppliedQty > 0
          ? 'จ่ายบางส่วน'
          : 'รอจ่ายคอนกรีต'
    })

    const rows = Object.values(map)
    rows.sort((a, b) => (b.planDate ?? '').localeCompare(a.planDate ?? ''))
    return rows
  }, [concreteItems, poGroups, statusFilter])

  const filteredPoGroups = useMemo(() => {
    let rows = poGroups

    if (catFilter !== 'ทั้งหมด' && catFilter !== 'คอนกรีต') {
      rows = rows.filter(po => po.materials.some(m => m.category === catFilter))
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(po => {
        const matchPo = po.poNumber.toLowerCase().includes(q)
        const matchDate = (po.planDate ?? '').includes(q)
        const matchProd = po.products.some(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
        const matchMat = po.materials.some(m => m.name.toLowerCase().includes(q) || (m.materialCode ?? '').toLowerCase().includes(q))
        return matchPo || matchDate || matchProd || matchMat
      })
    }

    // เรียงตามวันที่แผนผลิต (ล่าสุดก่อน)
    rows.sort((a, b) => (b.planDate ?? '').localeCompare(a.planDate ?? ''))
    return rows
  }, [poGroups, catFilter, search])

  // ─── Export Excel Function ──────────────────────────────────────────────────
  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx')
      const showIp = statusFilter === 'ทั้งหมด' || statusFilter === 'กำลังผลิต'
      const showCp = statusFilter === 'ทั้งหมด' || statusFilter === 'ผลิตสำเร็จ'

      const wb = XLSX.utils.book_new()

      // ── Sheet 1: สรุปแยกรายใบสั่งผลิต (PO) – ตามความต้องการหลักของผู้ใช้ ──
      if (showMaterials && filteredPoGroups.length > 0) {
        const aoaPo: any[][] = [
          ['Report No. PCC-MAT-01: รายงานสรุปการเบิกจ่ายวัตถุดิบ แยกรายใบสั่งผลิต (PO)'],
          [`ตั้งแต่วันที่ ${dateFrom || 'ทั้งหมด'} ถึง ${dateTo || 'ทั้งหมด'}`],
          [`หมวดหมู่วัตถุดิบ: ${catFilter} | สถานะแผน: ${statusFilter}`],
          [`ส่งออกข้อมูลเมื่อ: ${new Date().toLocaleString('th-TH')}`],
          [],
          [
            'No.',
            'เลขที่ใบสั่งผลิต (PO)',
            'วันที่แผนผลิต',
            'สถานะแผน',
            'สินค้าที่ผลิตในแผน',
            'รหัสวัตถุดิบ',
            'ชื่อวัตถุดิบ',
            'หมวดหมู่',
            'ปริมาณต้องการ',
            'ปริมาณจ่ายจริง',
            'หน่วย',
            'น้ำหนักโดยประมาณ (ตัน/กก.)',
            'ร้อยละการจ่าย (%)',
            'สถานะการเบิกจ่าย',
            'วันเวลาที่จ่าย',
            'ผู้บันทึกจ่าย / ผู้สั่งคอนกรีต',
          ]
        ]

        let globalIndex = 1

        filteredPoGroups.forEach(po => {
          const productSummary = po.products.map(p => `${p.name} (${p.qtyTarget} ${p.unit})`).join(', ') || '—'
          const planDateStr = po.planDate ? new Date(po.planDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
          
          // แถว Banner คั่นแต่ละ PO
          aoaPo.push([
            `ใบสั่งผลิต: ${po.poNumber} | วันที่: ${planDateStr} | สถานะ: ${po.statusInfo.text} | สินค้า: ${productSummary}`
          ])

          const visibleMaterials = catFilter === 'ทั้งหมด' || catFilter === 'คอนกรีต' 
            ? po.materials 
            : po.materials.filter(m => m.category === catFilter)

          visibleMaterials.forEach(m => {
            const matStatusText = m.status === 'dispensed' ? 'เบิกจ่ายแล้ว' : m.status === 'partial' ? 'จ่ายบางส่วน' : 'รอจ่าย'
            const dispDateStr = m.dispensedAt ? new Date(m.dispensedAt).toLocaleString('th-TH') : '—'

            // คำนวณน้ำหนักโดยประมาณ
            let approxWeightStr = '—'
            if (m.category === 'คอนกรีต') {
              approxWeightStr = `${(m.qtyDispensedDisplay * 2.4).toFixed(2)} ตัน`
            } else if (m.category === 'ลวด') {
              approxWeightStr = `${(m.qtyDispensedRaw || (m.qtyDispensedDisplay * (m.weight_per_meter || 0.154))).toFixed(2)} กก.`
            } else if (m.category === 'เหล็กเส้น') {
              approxWeightStr = `${(m.qtyDispensedDisplay * (m.weight_per_meter || 0.888)).toFixed(2)} กก.`
            } else if (m.category === 'เมช') {
              approxWeightStr = `${(m.qtyDispensedDisplay * 1.32).toFixed(2)} กก.`
            }

            aoaPo.push([
              globalIndex++,
              po.poNumber,
              planDateStr,
              po.statusInfo.text,
              productSummary,
              m.materialCode || '—',
              m.name,
              m.category,
              Number(m.qtyRequired.toFixed(2)),
              Number(m.qtyDispensedDisplay.toFixed(2)),
              m.unit,
              approxWeightStr,
              m.percent,
              matStatusText,
              dispDateStr,
              m.dispensedBy || '—'
            ])
          })

          // แถว Subtotal สำหรับแต่ละ PO
          const subtotalParts: string[] = []
          if (po.dashboard.concreteVol > 0) {
            subtotalParts.push(`คอนกรีต: ${po.dashboard.concreteVol.toFixed(2)} ม.³ (≈ ${po.dashboard.concreteWeightTon.toFixed(2)} ตัน)`)
          }
          if (po.dashboard.wireWeightKg > 0 || po.dashboard.wireLengthM > 0) {
            subtotalParts.push(`ลวด: ${po.dashboard.wireWeightKg.toFixed(1)} กก. (≈ ${po.dashboard.wireLengthM.toFixed(1)} ม.)`)
          }
          if (po.dashboard.rebarLengthM > 0 || po.dashboard.rebarWeightKg > 0) {
            subtotalParts.push(`เหล็กเส้น: ${po.dashboard.rebarLengthM.toFixed(1)} ม. (≈ ${po.dashboard.rebarWeightKg.toFixed(2)} กก.)`)
          }
          if (po.dashboard.meshAreaSqm > 0 || po.dashboard.meshWeightKg > 0) {
            subtotalParts.push(`เมช: ${po.dashboard.meshAreaSqm.toFixed(1)} ตร.ม. (≈ ${po.dashboard.meshWeightKg.toFixed(2)} กก.)`)
          }

          aoaPo.push([
            '',
            `รวมใบสั่งผลิต ${po.poNumber} (${visibleMaterials.length} รายการ)`,
            '',
            '',
            subtotalParts.join(' | ') || '—',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            ''
          ])
        })

        const wsPo = XLSX.utils.aoa_to_sheet(aoaPo)
        wsPo['!cols'] = [
          { wch: 6 },   // No.
          { wch: 22 },  // เลขที่ใบสั่งผลิต
          { wch: 14 },  // วันที่แผน
          { wch: 24 },  // สถานะแผน
          { wch: 38 },  // สินค้า
          { wch: 15 },  // รหัสวัตถุดิบ
          { wch: 32 },  // ชื่อวัตถุดิบ
          { wch: 12 },  // หมวดหมู่
          { wch: 14 },  // ต้องการ
          { wch: 14 },  // จ่ายจริง
          { wch: 10 },  // หน่วย
          { wch: 22 },  // น้ำหนักโดยประมาณ
          { wch: 14 },  // % การจ่าย
          { wch: 15 },  // สถานะการจ่าย
          { wch: 20 },  // วันเวลาที่จ่าย
          { wch: 18 },  // ผู้จ่าย
        ]
        XLSX.utils.book_append_sheet(wb, wsPo, 'แยกรายใบสั่งผลิต')
      }

      // ── Sheet 2: สรุปภาพรวมวัตถุดิบ ──
      if (showMaterials) {
        const summaryData = filteredRows.map(r => {
          const rq = (showIp ? r.ipReq : 0) + (showCp ? r.cpReq : 0)
          const dp = dispToDisplay(r.category, (showIp ? r.ipDispRaw : 0) + (showCp ? r.cpDispRaw : 0), r.weight_per_meter)
          const p = pct(dp, rq)
          
          let statusText = '—'
          if (statusFilter === 'กำลังผลิต') {
            if (r.ipMatPending > 0 && r.ipMatDone === 0) statusText = 'รอจ่ายวัตถุดิบ'
            else if (r.ipMatPending > 0 && r.ipMatDone > 0) statusText = 'จ่ายบางส่วน'
            else statusText = 'จ่ายครบ-รอ QC'
          } else if (statusFilter === 'ผลิตสำเร็จ') {
            statusText = 'ผลิตสำเร็จ'
          } else {
            // 'ทั้งหมด'
            if (r.ipEntryCount > 0) {
              if (r.ipMatPending > 0 && r.ipMatDone === 0) statusText = 'กำลังผลิต (รอจ่ายวัตถุดิบ)'
              else if (r.ipMatPending > 0 && r.ipMatDone > 0) statusText = 'กำลังผลิต (จ่ายบางส่วน)'
              else statusText = 'กำลังผลิต (จ่ายครบ-รอ QC)'
            } else if (r.cpEntryCount > 0) {
              statusText = 'ผลิตสำเร็จ'
            }
          }

          return {
            'รหัสวัตถุดิบ': r.material_code || '—',
            'ชื่อวัตถุดิบ': r.name,
            'หมวดหมู่': r.category,
            'ความต้องการ': rq,
            'จ่ายแล้ว': dp,
            'หน่วย': getCatUnit(r.category) || r.unit,
            'ร้อยละการจ่าย (%)': p,
            'สถานะ': statusText,
            'เบิกจ่ายล่าสุด': r.lastDispensedAt ? new Date(r.lastDispensedAt).toLocaleString('th-TH') : '—'
          }
        })

        const wsSummary = XLSX.utils.json_to_sheet(summaryData)
        XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุปภาพรวมวัตถุดิบ')
      }

      // ── Sheet 3: รายละเอียดการเบิกจ่าย ──
      if (showMaterials) {
        const detailsData: any[] = []
        filteredRows.forEach(r => {
          const filteredEntries = r.entries.filter(i => {
            const status = getPlanComputedStatus(i.plan)
            return statusFilter === 'ทั้งหมด' 
              ? true 
              : statusFilter === 'กำลังผลิต' 
                ? status === 'in_progress' 
                : status === 'completed'
          })

          filteredEntries.forEach(entry => {
            const planDateStr = entry.plan?.plan_date 
              ? new Date(entry.plan.plan_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) 
              : '—'
            const poNumber = entry.plan?.production_orders?.[0]?.order_number ?? `PO-${entry.plan?.plan_date?.replace(/-/g, '')}-xxx`
            
            const orders = entry.plan?.production_orders || []
            let detailStatusText = 'กำลังดำเนินการ'
            if (orders.length > 0) {
              const o = orders[0]
              const isErpSynced = o.status === 'erp_synced'
              const jobOrders = o.job_orders || []
              const isFullyDemolded = jobOrders.length > 0 && jobOrders.every((j: any) => j.status === 'demolded' || j.status === 'qc_passed')
              
              if (isErpSynced) {
                detailStatusText = 'บันทึกเข้าระบบแล้ว (FG)'
              } else if (isFullyDemolded) {
                detailStatusText = 'QC ตรวจสอบแล้ว'
              }
            }

            detailsData.push({
              'วันที่แผนผลิต': planDateStr,
              'เลขที่ใบสั่งผลิต (PO)': poNumber,
              'รหัสวัตถุดิบ': r.material_code || '—',
              'ชื่อวัตถุดิบ': r.name,
              'หมวดหมู่': r.category,
              'ปริมาณต้องการ': entry.qty_required,
              'ปริมาณจ่ายจริง': dispToDisplay(r.category, entry.qty_dispensed, r.weight_per_meter),
              'หน่วย': getCatUnit(r.category) || r.unit,
              'สถานะแผน': detailStatusText,
              'วันเวลาที่จ่าย': entry.dispensed_at ? new Date(entry.dispensed_at).toLocaleString('th-TH') : '—',
              'ผู้บันทึกจ่าย': entry.dispensed_by_profile?.full_name || '—'
            })
          })
        })

        if (detailsData.length > 0) {
          const wsDetails = XLSX.utils.json_to_sheet(detailsData)
          XLSX.utils.book_append_sheet(wb, wsDetails, 'รายละเอียดการเบิกจ่าย')
        }
      }

      // ── Sheet 4: สรุปคอนกรีตแยกตามใบสั่งผลิต (PO) ──
      if (showConcrete && concreteByPo.length > 0) {
        const concretePoData = concreteByPo.map((r, idx) => ({
          'No.': idx + 1,
          'เลขที่ใบสั่งผลิต (PO)': r.poNumber,
          'วันที่แผนผลิต': r.planDate ? new Date(r.planDate).toLocaleDateString('th-TH') : '—',
          'สินค้าในแผน': r.productSummary,
          'โรงผลิต (Bed)': r.beds.length > 0 
            ? r.beds.map(b => b.startsWith('โรงผลิต') ? b : `โรงผลิต ${b}`).join(', ') 
            : '—',
          'ผู้สั่งคอนกรีต': r.requesters.length > 0 ? r.requesters.join(', ') : '—',
          'สั่งผลิตคอนกรีตรวม (ม.³)': Number(r.totalRequested.toFixed(2)),
          'จ่ายแล้วจริง (ม.³)': Number(r.suppliedQty.toFixed(2)),
          'รอจ่าย (ม.³)': Number(r.requestedQty.toFixed(2)),
          'น้ำหนักรวม (ตัน)': Number(r.weightTon.toFixed(2)),
          'จำนวนคำสั่ง (Orders)': r.orderCount,
          'สถานะคอนกรีต': r.statusText,
          'สถานะแผน': r.computedStatus === 'completed' ? 'ผลิตสำเร็จ' : 'กำลังดำเนินการ',
        }))

        const wsConcretePo = XLSX.utils.json_to_sheet(concretePoData)
        XLSX.utils.book_append_sheet(wb, wsConcretePo, 'สรุปคอนกรีตรายPO')
      }

      // ── Sheet 5: รายการสั่งคอนกรีตทั้งหมด ──
      if (showConcrete) {
        const concreteData = concreteItems
          .filter(c => {
            const isSupplied = c.status === 'supplied' || c.status === 'received'
            if (isSupplied && !showCp) return false
            if (!isSupplied && !showIp) return false
            return true
          })
          .map(c => {
            const requestedAtStr = c.requested_at ? new Date(c.requested_at).toLocaleString('th-TH') : '—'
            const poNumber = c.job_order?.production_order?.order_number ?? '—'
            const rawBed = c.job_order?.plan_item?.bed ?? c.job_order?.bed
            const bedStr = rawBed ? (rawBed.startsWith('โรงผลิต') ? rawBed : `โรงผลิต ${rawBed}`) : '—'
            const productName = c.job_order?.plan_item?.product?.name ?? 'สั่งแบบรวม'
            const size = c.job_order?.plan_item?.product?.size ?? '—'
            const statusText = c.status === 'supplied' || c.status === 'received' ? 'จ่ายครบแล้ว' : 'รอจ่ายคอนกรีต'

            return {
              'วันเวลาที่สั่ง': requestedAtStr,
              'เลขที่ใบสั่งผลิต (PO)': poNumber,
              'โรงผลิต (Bed)': bedStr,
              'ชื่อสินค้า': productName,
              'ขนาด': size,
              'ผู้สั่งคอนกรีต': c.requested_by_profile?.full_name || '—',
              'ปริมาณสั่ง (ม.³)': c.qty_requested,
              'น้ำหนักโดยประมาณ (ตัน)': Number((c.qty_requested * 2.4).toFixed(2)),
              'เฟสเทปูน': c.phase || '—',
              'อัตราส่วนผสม': c.mix_ratio || '—',
              'สถานะ': statusText,
            }
          })

        if (concreteData.length > 0) {
          const wsConcrete = XLSX.utils.json_to_sheet(concreteData)
          XLSX.utils.book_append_sheet(wb, wsConcrete, 'รายการสั่งคอนกรีต')
        }
      }

      const dateStr = `${dateFrom || 'ทั้งหมด'}_ถึง_${dateTo || 'ทั้งหมด'}`
      XLSX.writeFile(wb, `สรุปการเบิกจ่ายวัตถุดิบ_แยกรายPO_${dateStr}.xlsx`)
      toast.success('ดาวน์โหลดไฟล์ Excel แยกรายใบสั่งผลิตสำเร็จ!')
    } catch (e: unknown) {
      toast.error('เกิดข้อผิดพลาดในการสร้างไฟล์ Excel: ' + (e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ'))
    }
  }

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

    let rows = Object.values(aggMap).filter(r => r.category !== 'ชิ้นส่วน SFG')
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

  const showConcrete  = catFilter === 'ทั้งหมด' || catFilter === 'คอนกรีต'
  const showMaterials = catFilter !== 'คอนกรีต'

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Filter bar (สไตล์เดียวกับหน้าสินค้าพร้อมขาย StockReceiptReportTab) ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Row 1: Preset buttons + Action buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {/* Preset Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fas fa-calendar-alt" style={{ color: '#2563EB' }} />
              ช่วงเวลา:
            </span>
            <div style={{ display: 'inline-flex', background: 'var(--bg)', borderRadius: 50, padding: 3, border: '1px solid var(--border)', flexWrap: 'wrap', gap: 2 }}>
              {DATE_PRESETS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPreset(p.id)}
                  style={{
                    padding: '4px 13px',
                    borderRadius: 50,
                    border: 'none',
                    fontSize: 11,
                    fontWeight: preset === p.id ? 700 : 500,
                    cursor: 'pointer',
                    background: preset === p.id ? '#2563EB' : 'transparent',
                    color: preset === p.id ? '#fff' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons: Export Excel & Reload */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <button
              type="button"
              onClick={handleExportExcel}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '7px 16px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                background: '#107C41', // Excel Green
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(16, 124, 65, 0.25)',
                transition: 'all 0.15s ease'
              }}
            >
              <i className="fas fa-file-excel" style={{ fontSize: 14 }} />
              Export Excel (แยกราย PO)
            </button>

            <button
              type="button"
              onClick={refetch}
              disabled={isPending}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 15px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                background: isPending ? '#D1D5DB' : '#2563EB',
                color: '#fff',
                border: 'none',
                cursor: isPending ? 'wait' : 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <i className={isPending ? 'fas fa-spinner fa-spin' : 'fas fa-sync-alt'} />
              {isPending ? 'กำลังโหลด...' : 'โหลดข้อมูล'}
            </button>
          </div>
        </div>

        {/* Row 2: Grid Filters (ตั้งแต่วันที่, ถึงวันที่, หมวดหมู่, สถานะ, สลับมุมมอง, ค้นหา) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--border)',
            alignItems: 'flex-end'
          }}
        >
          {/* Start Date Input */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              ตั้งแต่วันที่ (เลือกย้อนหลังได้):
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => handleDateFromChange(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-primary)',
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* End Date Input */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              ถึงวันที่:
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={e => handleDateToChange(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-primary)',
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Category Dropdown */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              หมวดหมู่วัตถุดิบ:
            </label>
            <select
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-primary)',
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            >
              {['ทั้งหมด', 'ลวด', 'เหล็กเส้น', 'เมช', 'คอนกรีต'].map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              สถานะแผนผลิต:
            </label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'ทั้งหมด' | 'กำลังผลิต' | 'ผลิตสำเร็จ')}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-primary)',
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            >
              <option value="ทั้งหมด">ทุกสถานะ (ทั้งหมด)</option>
              <option value="กำลังผลิต">กำลังผลิต (รอดำเนินการ/จ่ายบางส่วน)</option>
              <option value="ผลิตสำเร็จ">ผลิตสำเร็จ (ผ่าน QC / เข้าคลัง)</option>
            </select>
          </div>

          {/* Sort By Filter */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              เรียงลำดับตาม:
            </label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'name' | 'required' | 'dispensed')}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-primary)',
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            >
              <option value="name">ชื่อวัตถุดิบ (ก-ฮ)</option>
              <option value="required">ปริมาณความต้องการ (มาก-น้อย)</option>
              <option value="dispensed">ปริมาณจ่ายจริง (มาก-น้อย)</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              รูปแบบมุมมอง:
            </label>
            <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 7, padding: 3, border: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => setViewMode('by-material')}
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  borderRadius: 5,
                  border: 'none',
                  fontSize: 11,
                  fontWeight: viewMode === 'by-material' ? 700 : 500,
                  cursor: 'pointer',
                  background: viewMode === 'by-material' ? '#2563EB' : 'transparent',
                  color: viewMode === 'by-material' ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                <i className="fas fa-boxes-stacked" style={{ marginRight: 5 }} />
                ตามวัตถุดิบ
              </button>
              <button
                type="button"
                onClick={() => setViewMode('by-po')}
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  borderRadius: 5,
                  border: 'none',
                  fontSize: 11,
                  fontWeight: viewMode === 'by-po' ? 700 : 500,
                  cursor: 'pointer',
                  background: viewMode === 'by-po' ? '#7C3AED' : 'transparent',
                  color: viewMode === 'by-po' ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                <i className="fas fa-file-invoice" style={{ marginRight: 5 }} />
                แยกราย PO
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              ค้นหาข้อมูล:
            </label>
            <div style={{ position: 'relative' }}>
              <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 11 }} />
              <input
                type="text"
                placeholder="เลข PO, รหัส/ชื่อวัตถุดิบ, สินค้า..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: 28,
                  paddingRight: 10,
                  paddingTop: 7,
                  paddingBottom: 7,
                  borderRadius: 7,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
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

      {/* ── Raw Material Tables: View แยกตามหมวดหมู่ (by-material) ── */}
      {viewMode === 'by-material' && showMaterials && Object.entries(groupedByCategory)
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

      {/* ── Raw Material Tables: View แยกตามใบสั่งผลิต (by-po) ── */}
      {viewMode === 'by-po' && showMaterials && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Controls Bar for PO View */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              <i className="fas fa-file-invoice" style={{ color: '#7C3AED', fontSize: 16 }} />
              <span>สรุปแยกรายใบสั่งผลิต (PO):</span>
              <span style={{ background: '#F5F3FF', color: '#7C3AED', padding: '3px 10px', borderRadius: 20, fontSize: 12, border: '1px solid #C4B5FD', fontWeight: 800 }}>
                {filteredPoGroups.length} ใบสั่งผลิต
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setDefaultExpanded(true)
                  setExpandedPo({})
                }}
                style={{
                  padding: '6px 14px',
                  fontSize: 11,
                  fontWeight: 600,
                  background: defaultExpanded && Object.keys(expandedPo).length === 0 ? '#EDE9FE' : 'var(--bg)',
                  color: defaultExpanded && Object.keys(expandedPo).length === 0 ? '#6D28D9' : 'var(--text-secondary)',
                  border: `1px solid ${defaultExpanded && Object.keys(expandedPo).length === 0 ? '#C4B5FD' : 'var(--border)'}`,
                  borderRadius: 7,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease'
                }}
                className="hover:bg-slate-100 active:scale-95"
              >
                <i className="fas fa-angles-down" />ขยายทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => {
                  setDefaultExpanded(false)
                  setExpandedPo({})
                }}
                style={{
                  padding: '6px 14px',
                  fontSize: 11,
                  fontWeight: 600,
                  background: !defaultExpanded && Object.keys(expandedPo).length === 0 ? '#EDE9FE' : 'var(--bg)',
                  color: !defaultExpanded && Object.keys(expandedPo).length === 0 ? '#6D28D9' : 'var(--text-secondary)',
                  border: `1px solid ${!defaultExpanded && Object.keys(expandedPo).length === 0 ? '#C4B5FD' : 'var(--border)'}`,
                  borderRadius: 7,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease'
                }}
                className="hover:bg-slate-100 active:scale-95"
              >
                <i className="fas fa-angles-up" />ย่อทั้งหมด
              </button>
            </div>
          </div>

          {filteredPoGroups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 0', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-muted)' }}>
              <i className="fas fa-file-invoice" style={{ fontSize: 38, opacity: 0.25, display: 'block', marginBottom: 10 }} />
              <p style={{ fontSize: 13, fontWeight: 600 }}>ไม่พบใบสั่งผลิตในช่วงเงื่อนไขที่เลือก</p>
              <p style={{ fontSize: 11, marginTop: 4 }}>ลองปรับช่วงเวลาหรือล้างคำค้นหา</p>
            </div>
          ) : (
            filteredPoGroups.map(po => {
              const isExp = expandedPo[po.key] !== undefined ? expandedPo[po.key] : defaultExpanded
              const visibleMaterials = catFilter === 'ทั้งหมด' || catFilter === 'คอนกรีต'
                ? po.materials
                : po.materials.filter(m => m.category === catFilter)

              const planDateStr = po.planDate ? new Date(po.planDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

              return (
                <div key={po.key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  {/* PO Card Header */}
                  <div
                    onClick={() => setExpandedPo(prev => ({ ...prev, [po.key]: !isExp }))}
                    style={{
                      padding: '12px 18px',
                      background: '#F8FAFC',
                      borderBottom: isExp ? '1px solid var(--border)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 10,
                      cursor: 'pointer',
                      transition: 'background 0.15s'
                    }}
                    className="hover:bg-slate-100"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <i className={`fas ${isExp ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ color: 'var(--text-muted)', fontSize: 11, width: 12 }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: '#1E293B', background: '#EDE9FE', border: '1px solid #DDD6FE', padding: '3px 9px', borderRadius: 6 }}>
                          <i className="fas fa-file-invoice" style={{ color: '#7C3AED', marginRight: 6 }} />
                          {po.poNumber}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          <i className="fas fa-calendar-day" style={{ marginRight: 5, color: '#3B82F6' }} />
                          แผนผลิต: {planDateStr}
                        </span>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: po.statusInfo.color, background: po.statusInfo.bg, border: `1px solid ${po.statusInfo.border}`, padding: '2px 9px', borderRadius: 50 }}>
                        {po.statusInfo.text}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {po.products.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                          <span style={{ fontWeight: 600 }}>สินค้า:</span>
                          <span style={{ background: 'var(--bg)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 11, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {po.products.map(p => `${p.name} (${p.qtyTarget} ${p.unit})`).join(', ')}
                          </span>
                        </div>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                        {visibleMaterials.length} รายการวัตถุดิบ
                      </span>
                    </div>
                  </div>

                  {/* PO Card Body (RAW MATERIAL SUMMARY REPORT Style) */}
                  {isExp && (
                    <div style={{ padding: '16px 20px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 18 }}>
                      
                      {/* Report Title Banner */}
                      <div style={{ textAlign: 'center', padding: '4px 0 2px' }}>
                        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1E293B', letterSpacing: '0.02em', margin: 0 }}>
                          ใบสรุปรายการวัตถุดิบ (RAW MATERIAL SUMMARY REPORT)
                        </h3>
                        <p style={{ fontSize: 11, color: '#64748B', margin: '3px 0 0' }}>
                          สรุปการใช้วัตถุดิบสุทธิในการผลิตจริงสำหรับสินค้าสำเร็จรูป (งานดี) · ใบสั่งผลิต: <strong style={{ color: '#7C3AED' }}>{po.poNumber}</strong>
                        </p>
                      </div>

                      {/* ── 4 Dashboard Cards สรุปวัตถุดิบภาพรวมของ PO ── */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        {/* 1. คอนกรีต */}
                        <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: '12px 14px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#0369A1', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="fas fa-fill-drip" style={{ fontSize: 11 }}></i> คอนกรีตรวม
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#0284C7', lineHeight: 1.1 }}>
                            {po.dashboard.concreteVol.toFixed(3)} <span style={{ fontSize: 11, fontWeight: 600 }}>ม.³</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#0369A1', marginTop: 4 }}>
                            ≈ {po.dashboard.concreteWeightTon.toFixed(2)} ตัน
                          </div>
                        </div>

                        {/* 2. ลวดเหล็ก */}
                        <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, padding: '12px 14px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#B45309', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="fas fa-ring" style={{ fontSize: 11 }}></i> ลวดเหล็กรวม
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#D97706', lineHeight: 1.1 }}>
                            {fmtNum(po.dashboard.wireWeightKg, 1)} <span style={{ fontSize: 11, fontWeight: 600 }}>กก.</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#B45309', marginTop: 4 }}>
                            ≈ {fmtNum(po.dashboard.wireLengthM, 1)} เมตร
                          </div>
                        </div>

                        {/* 3. เหล็กเส้น */}
                        <div style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 8, padding: '12px 14px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="fas fa-bars-staggered" style={{ fontSize: 11 }}></i> เหล็กเส้นรวม
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#475569', lineHeight: 1.1 }}>
                            {fmtNum(po.dashboard.rebarLengthM, 1)} <span style={{ fontSize: 11, fontWeight: 600 }}>เมตร</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>
                            ≈ {fmtNum(po.dashboard.rebarWeightKg, 2)} กก.
                          </div>
                        </div>

                        {/* 4. ตะแกรง Mesh */}
                        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '12px 14px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#16A34A', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="fas fa-table-cells" style={{ fontSize: 11 }}></i> ตะแกรง Mesh รวม
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#16A34A', lineHeight: 1.1 }}>
                            {fmtNum(po.dashboard.meshAreaSqm, 1)} <span style={{ fontSize: 11, fontWeight: 600 }}>ตร.ม.</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#16A34A', marginTop: 4 }}>
                            ≈ {fmtNum(po.dashboard.meshWeightKg, 2)} กก.
                          </div>
                        </div>
                      </div>

                      {/* ── ตาราง สินค้าสำเร็จรูป / วัตถุดิบประกอบ (BOM) ── */}
                      {po.products.length > 0 && (
                        <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                          <div style={{ padding: '8px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <i className="fas fa-boxes-stacked" style={{ color: '#6366F1', fontSize: 12 }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>
                              สูตรโครงสร้างวัตถุดิบแยกตามรายการสินค้า (Bill of Materials - BOM)
                            </span>
                          </div>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                              <thead>
                                <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E5E7EB' }}>
                                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', fontWeight: 700, width: '48%' }}>สินค้าสำเร็จรูป / วัตถุดิบประกอบ (BOM)</th>
                                  <th style={{ padding: '8px 12px', textAlign: 'center', color: '#475569', fontWeight: 700, width: '16%' }}>จำนวนผลิตตามแผน</th>
                                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 700, width: '18%' }}>จำนวนรวม</th>
                                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 700, width: '18%' }}>น้ำหนักรวม</th>
                                </tr>
                              </thead>
                              <tbody>
                                {po.products.map((prod, pIdx) => {
                                  const concVol = prod.qtyTarget * (prod.concretePerUnit || 0)
                                  const wireWt = prod.qtyTarget * (prod.wirePerUnit || 0)
                                  const rebarLen = prod.qtyTarget * (prod.rebarPerUnit || 0)
                                  const meshArea = prod.qtyTarget * (prod.meshPerUnit || 0)

                                  return (
                                    <Fragment key={prod.planItemId ? `${prod.planItemId}_${pIdx}` : `${prod.id}_${pIdx}`}>
                                      {/* แถวสินค้าหลัก */}
                                      <tr style={{ background: '#F1F5F9', borderTop: pIdx > 0 ? '1.5px solid #CBD5E1' : 'none' }}>
                                        <td colSpan={2} style={{ padding: '7px 12px', fontWeight: 800, color: '#1E293B', fontSize: 11.5 }}>
                                          {pIdx + 1}. {prod.name} {prod.size && prod.size !== '-' ? ` (${prod.size})` : ''}
                                          <span style={{ fontSize: 9.5, color: '#64748B', fontFamily: 'monospace', marginLeft: 8 }}>[{prod.code}]</span>
                                        </td>
                                        <td style={{ padding: '7px 12px', fontWeight: 800, color: '#1E293B', textAlign: 'center' }}>
                                          {prod.qtyTarget.toLocaleString()} {prod.unit}
                                        </td>
                                        <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 10, color: '#64748B', fontWeight: 600 }}>
                                          {prod.bed ? (prod.bed.startsWith('โรงผลิต') ? prod.bed : `โรงผลิต ${prod.bed}`) : `แผนผลิต #${po.poNumber}`}
                                        </td>
                                      </tr>

                                      {/* วัตถุดิบประกอบ: คอนกรีตผสมเสร็จ */}
                                      {concVol > 0 && (
                                        <tr style={{ background: '#fff', borderBottom: '1px solid #F1F5F9' }}>
                                          <td style={{ padding: '6px 12px 6px 24px', color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#3B82F6' }}></span>
                                            คอนกรีตผสมเสร็จ (Ready-mixed Concrete)
                                          </td>
                                          <td style={{ padding: '6px 12px', textAlign: 'center', color: '#64748B' }}>-</td>
                                          <td style={{ padding: '6px 12px', textAlign: 'right', color: '#475569', fontWeight: 500 }}>
                                            {fmtNum(concVol, 2)} คิว
                                          </td>
                                          <td style={{ padding: '6px 12px', textAlign: 'right', color: '#0F172A', fontWeight: 700 }}>
                                            {fmtNum(concVol * 2.4, 2)} ตัน
                                          </td>
                                        </tr>
                                      )}

                                      {/* วัตถุดิบประกอบ: ลวดเหล็ก */}
                                      {wireWt > 0 && (
                                        <tr style={{ background: '#fff', borderBottom: '1px solid #F1F5F9' }}>
                                          <td style={{ padding: '6px 12px 6px 24px', color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }}></span>
                                            ลวดเหล็กแรงดึงสูง (PC Wire/Strand)
                                          </td>
                                          <td style={{ padding: '6px 12px', textAlign: 'center', color: '#64748B' }}>-</td>
                                          <td style={{ padding: '6px 12px', textAlign: 'right', color: '#475569', fontWeight: 500 }}>
                                            {fmtNum(wireWt / 0.154, 1)} เมตร
                                          </td>
                                          <td style={{ padding: '6px 12px', textAlign: 'right', color: '#0F172A', fontWeight: 700 }}>
                                            {fmtNum(wireWt, 2)} กก.
                                          </td>
                                        </tr>
                                      )}

                                      {/* วัตถุดิบประกอบ: เหล็กเส้น */}
                                      {rebarLen > 0 && (
                                        <tr style={{ background: '#fff', borderBottom: '1px solid #F1F5F9' }}>
                                          <td style={{ padding: '6px 12px 6px 24px', color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#64748B' }}></span>
                                            เหล็กเส้นกลม (RB/DB)
                                          </td>
                                          <td style={{ padding: '6px 12px', textAlign: 'center', color: '#64748B' }}>-</td>
                                          <td style={{ padding: '6px 12px', textAlign: 'right', color: '#475569', fontWeight: 500 }}>
                                            {fmtNum(rebarLen, 1)} เมตร
                                          </td>
                                          <td style={{ padding: '6px 12px', textAlign: 'right', color: '#0F172A', fontWeight: 700 }}>
                                            {fmtNum(rebarLen * 0.888, 2)} กก.
                                          </td>
                                        </tr>
                                      )}

                                      {/* วัตถุดิบประกอบ: ตะแกรง Mesh */}
                                      {meshArea > 0 && (
                                        <tr style={{ background: '#fff', borderBottom: '1px solid #F1F5F9' }}>
                                          <td style={{ padding: '6px 12px 6px 24px', color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#10B981' }}></span>
                                            ตะแกรงเหล็กสำเร็จรูป (Mesh)
                                          </td>
                                          <td style={{ padding: '6px 12px', textAlign: 'center', color: '#64748B' }}>-</td>
                                          <td style={{ padding: '6px 12px', textAlign: 'right', color: '#475569', fontWeight: 500 }}>
                                            {fmtNum(meshArea, 1)} ตร.ม.
                                          </td>
                                          <td style={{ padding: '6px 12px', textAlign: 'right', color: '#0F172A', fontWeight: 700 }}>
                                            {fmtNum(meshArea * 1.32, 2)} กก.
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* ── ตาราง รายละเอียดการเบิกจ่ายวัตถุดิบจริง (Actual Material Dispensed) ── */}
                      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ padding: '8px 14px', background: '#F8FAFC', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <i className="fas fa-clipboard-check" style={{ color: '#059669', fontSize: 12 }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>
                              รายการวัตถุดิบและสถานะการเบิกจ่ายจริงในใบสั่งผลิต {po.poNumber}
                            </span>
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            แสดง {visibleMaterials.length} รายการ
                          </span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600 }}>รหัส</th>
                                <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600 }}>ชื่อวัตถุดิบ</th>
                                <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600 }}>หมวดหมู่</th>
                                <th style={{ padding: '8px 14px', textAlign: 'right', fontSize: 10, fontWeight: 600 }}>ความต้องการ</th>
                                <th style={{ padding: '8px 14px', textAlign: 'right', fontSize: 10, fontWeight: 600 }}>จ่ายจริง</th>
                                <th style={{ padding: '8px 14px', textAlign: 'center', fontSize: 10, fontWeight: 600, width: 130 }}>% การจ่าย</th>
                                <th style={{ padding: '8px 14px', textAlign: 'center', fontSize: 10, fontWeight: 600 }}>สถานะ</th>
                                <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600 }}>วันเวลาที่จ่าย</th>
                                <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600 }}>ผู้บันทึกจ่าย</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleMaterials.length === 0 ? (
                                <tr>
                                  <td colSpan={9} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                                    ไม่มีรายการวัตถุดิบตรงกับหมวดที่เลือกในใบสั่งผลิตนี้
                                  </td>
                                </tr>
                              ) : (
                                visibleMaterials.map(m => {
                                  const isPartialMat = m.status === 'partial'
                                  const isDoneMat = m.status === 'dispensed'

                                  return (
                                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-slate-50 transition-colors">
                                      <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                                        {m.materialCode || '—'}
                                      </td>
                                      <td style={{ padding: '9px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {m.name}
                                      </td>
                                      <td style={{ padding: '9px 14px', color: 'var(--text-secondary)', fontSize: 11 }}>
                                        {m.category}
                                      </td>
                                      <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                                        {fmtNum(m.qtyRequired, 2)} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.unit}</span>
                                      </td>
                                      <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: isDoneMat ? '#16A34A' : isPartialMat ? '#2563EB' : '#D97706' }}>
                                        {fmtNum(m.qtyDispensedDisplay, 2)} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.unit}</span>
                                      </td>
                                      <td style={{ padding: '9px 14px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                                          <span style={{ fontSize: 10, fontWeight: 700, color: m.percent >= 100 ? '#16A34A' : m.percent > 0 ? '#2563EB' : 'var(--text-muted)' }}>
                                            {m.percent}%
                                          </span>
                                          <div style={{ width: 80, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ width: `${Math.min(100, m.percent)}%`, height: '100%', background: m.percent >= 100 ? '#16A34A' : '#3B82F6', borderRadius: 2 }} />
                                          </div>
                                        </div>
                                      </td>
                                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                                        {isDoneMat ? <BadgeDone label="เบิกจ่ายแล้ว" /> : isPartialMat ? <BadgePartial /> : <BadgePending label="รอจ่าย" />}
                                      </td>
                                      <td style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-muted)' }}>
                                        {m.dispensedAt ? new Date(m.dispensedAt).toLocaleString('th-TH') : '—'}
                                      </td>
                                      <td style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-secondary)' }}>
                                        {m.dispensedBy || '—'}
                                      </td>
                                    </tr>
                                  )
                                })
                              )}
                            </tbody>
                            {visibleMaterials.length > 0 && (
                              <tfoot>
                                <tr style={{ background: '#F8FAFC', borderTop: '2px solid var(--border)' }}>
                                  <td colSpan={3} style={{ padding: '8px 14px', fontWeight: 700, fontSize: 11, color: 'var(--text-secondary)' }}>
                                    สรุปวัตถุดิบในใบสั่งผลิต {po.poNumber} :
                                  </td>
                                  <td colSpan={6} style={{ padding: '8px 14px' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                                      {Object.entries(po.totalsByCategory)
                                        .filter(([cat]) => catFilter === 'ทั้งหมด' || catFilter === 'คอนกรีต' || cat === catFilter)
                                        .map(([cat, val]) => (
                                          <span key={cat} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                                            <strong style={{ color: 'var(--accent)' }}>{cat}:</strong> ต้องการ {fmtNum(val.req, 1)} / จ่าย {fmtNum(val.disp, 1)} {val.unit}
                                          </span>
                                        ))}
                                    </div>
                                  </td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      </div>

                      {/* ── หมายเหตุการคำนวณ (Calculation Notes) ── */}
                      <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', background: '#FAFAFA', fontSize: 10, color: '#64748B', lineHeight: 1.6 }}>
                        <strong style={{ color: '#475569' }}>หมายเหตุการคำนวณ:</strong>
                        <ul style={{ margin: '3px 0 0 16px', padding: 0 }}>
                          <li><strong>คอนกรีต:</strong> แปลงปริมาตร (ลบ.ม.) เป็นน้ำหนักโดยใช้อัตราความหนาแน่นเหล็กเสริมเสมือน 2.4 ตัน/ลบ.ม. (2,400 กก./ลบ.ม.)</li>
                          <li><strong>ลวด (PC Wire/Strand):</strong> คำนวณจากน้ำหนักสูตรผลิต และแปลงกลับเป็นความยาวตามน้ำหนักจำเพาะต่อเมตรของลวดแต่ละขนาด (เฉลี่ย 0.154 กก./เมตร)</li>
                          <li><strong>เหล็กเส้น (RB/DB):</strong> คำนวณความยาวรวมจากสูตร และแปลงเป็นน้ำหนักตามสัมประสิทธิ์ขนาดหน้าตัดเหล็กมาตรฐาน มอก. (เฉลี่ย 0.888 กก./เมตร)</li>
                          <li><strong>ตะแกรง Mesh:</strong> คำนวณพื้นที่รวม (ตร.ม.) และแปลงเป็นน้ำหนักตามมาตรฐานตะแกรง (1.32 กก./ตร.ม.)</li>
                          <li><strong>ยอดรวมสุทธิ:</strong> คำนวณสรุปเฉพาะวัตถุดิบที่ใช้ในสินค้าที่ระบุตามใบสั่งผลิตนี้</li>
                        </ul>
                      </div>

                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Empty state for material filter */}
      {showMaterials && Object.keys(groupedByCategory).length === 0 && catFilter !== 'คอนกรีต' && (
        <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
          <i className="fas fa-folder-open" style={{ fontSize: 38, opacity: 0.25, display: 'block', marginBottom: 10 }} />
          <p style={{ fontSize: 13, fontWeight: 600 }}>ไม่พบรายการที่ตรงกับเงื่อนไข</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>ลองปรับช่วงเวลาหรือกรองใหม่</p>
        </div>
      )}

      {/* ── Concrete Section: สรุปภาพรวมคอนกรีต (รองรับทั้งแยกตาม PO และแยกตามหมวดหมู่สินค้า) ─────────── */}
      {showConcrete && (concreteByPo.length > 0 || Object.keys(concreteByCat).length > 0) && (
        <div style={{ background: 'var(--surface)', border: '2px solid #6EE7B7', borderRadius: 'var(--radius)', overflow: 'hidden' }}>

          {/* Concrete header */}
          <div style={{ padding: '12px 18px', background: 'linear-gradient(135deg,#ECFDF5,#F0FDF4)', borderBottom: '2px solid #6EE7B7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="fas fa-fill-drip" style={{ color: '#059669', fontSize: 16 }} />
              <span style={{ fontSize: 14, fontWeight: 800, color: '#065F46' }}>สรุปภาพรวมคอนกรีต (Concrete Summary)</span>
              <span style={{ fontSize: 11, color: '#059669', opacity: 0.85, fontWeight: 600 }}>
                ({concreteByPo.length} ใบสั่งผลิต · {concreteItems.length} คำสั่ง)
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              {/* Toggle มุมมองคอนกรีต: แยกราย PO vs แยกหมวดสินค้า */}
              <div style={{ display: 'flex', alignItems: 'center', background: '#D1FAE5', padding: '3px 4px', borderRadius: 8, border: '1px solid #A7F3D0' }}>
                <button
                  type="button"
                  onClick={() => setConcreteViewMode('by-po')}
                  style={{
                    padding: '4px 11px',
                    fontSize: 11,
                    fontWeight: concreteViewMode === 'by-po' ? 700 : 500,
                    background: concreteViewMode === 'by-po' ? '#059669' : 'transparent',
                    color: concreteViewMode === 'by-po' ? '#fff' : '#065F46',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.15s'
                  }}
                >
                  <i className="fas fa-file-invoice" /> อ้างอิงตามใบสั่งผลิต (PO)
                </button>
                <button
                  type="button"
                  onClick={() => setConcreteViewMode('by-cat')}
                  style={{
                    padding: '4px 11px',
                    fontSize: 11,
                    fontWeight: concreteViewMode === 'by-cat' ? 700 : 500,
                    background: concreteViewMode === 'by-cat' ? '#059669' : 'transparent',
                    color: concreteViewMode === 'by-cat' ? '#fff' : '#065F46',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.15s'
                  }}
                >
                  <i className="fas fa-layer-group" /> แยกตามหมวดสินค้า
                </button>
              </div>

              {/* สรุปยอดสั่งผลิตและจ่ายจริง */}
              <div style={{ display: 'flex', gap: 14 }}>
                <span style={{ fontSize: 11, color: '#065F46', fontWeight: 600 }}>
                  สั่งรวม: <strong>{fmtNum(totalConcrete, 2)} ลบ.ม.</strong>
                  <span style={{ fontSize: 10, opacity: 0.8, marginLeft: 4 }}>
                    (≈ {(totalConcrete * 2.4).toFixed(2)} ตัน)
                  </span>
                </span>
                <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>
                  จ่ายแล้วจริง: <strong>{fmtNum(concreteByPo.reduce((s, r) => s + r.suppliedQty, 0), 2)} ลบ.ม.</strong>
                </span>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              มุมมองที่ 1: สรุปคอนกรีตอ้างอิงตามใบสั่งผลิต (PO)
             ══════════════════════════════════════════════════════════════════ */}
          {concreteViewMode === 'by-po' && (
            <>
              <div style={{ padding: '8px 18px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: '#334155' }}>
                  <i className="fas fa-file-invoice" style={{ color: '#059669' }} />
                  <span>ตารางสรุปการใช้คอนกรีตแยกตามใบสั่งผลิต (PO)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      const next: Record<string, boolean> = {}
                      concreteByPo.forEach(r => { next[`po-${r.key}`] = true })
                      setExpandedConcrete(next)
                    }}
                    style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, background: '#fff', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', color: 'var(--text-secondary)' }}
                    className="hover:bg-slate-100"
                  >
                    <i className="fas fa-angles-down" style={{ marginRight: 4 }} />ขยายทั้งหมด
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedConcrete({})}
                    style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, background: '#fff', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', color: 'var(--text-secondary)' }}
                    className="hover:bg-slate-100"
                  >
                    <i className="fas fa-angles-up" style={{ marginRight: 4 }} />ย่อทั้งหมด
                  </button>
                  <span style={{ fontSize: 10, color: '#64748B', marginLeft: 4 }}>
                    *คำนวณน้ำหนักคอนกรีตโดยใช้อัตราแปลงความหนาแน่น 2.4 ตัน/ลบ.ม. (2,400 กก./ลบ.ม.)
                  </span>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F1F5F9', borderBottom: '1px solid var(--border)' }}>
                      {[
                        { label: 'เลขที่ใบสั่งผลิต (PO) / แผนผลิต', align: 'left', width: '22%' },
                        { label: 'สินค้าที่ผลิต', align: 'left', width: '24%' },
                        { label: 'โรงผลิต (Bed)', align: 'center', width: '10%' },
                        { label: 'สั่งผลิต (ม.³)', align: 'right', width: '10%' },
                        { label: 'จ่ายจริง (ม.³)', align: 'right', width: '10%' },
                        { label: 'รอจ่าย (ม.³)', align: 'right', width: '9%' },
                        { label: 'น้ำหนัก (ตัน)', align: 'right', width: '10%' },
                        { label: 'สถานะ', align: 'center', width: '11%' },
                      ].map(h => (
                        <th
                          key={h.label}
                          style={{
                            padding: '9px 12px',
                            textAlign: h.align as 'left' | 'right' | 'center',
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#475569',
                            letterSpacing: '0.02em',
                            width: h.width,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {h.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {concreteByPo.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                          ไม่พบข้อมูลคอนกรีตในใบสั่งผลิตช่วงเวลานี้
                        </td>
                      </tr>
                    ) : (
                      concreteByPo.map(r => {
                        const isExpanded = !!expandedConcrete[`po-${r.key}`]
                        const planDateStr = r.planDate ? new Date(r.planDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
                        const isDone = r.suppliedQty >= r.totalRequested && r.totalRequested > 0
                        const isPartial = r.suppliedQty > 0 && !isDone

                        return (
                          <Fragment key={r.key}>
                            <tr
                              onClick={() => setExpandedConcrete(prev => ({ ...prev, [`po-${r.key}`]: !prev[`po-${r.key}`] }))}
                              style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isExpanded ? '#F8FAFC' : '#fff' }}
                              className="hover:bg-slate-50 transition-colors"
                            >
                              {/* PO Number + Date */}
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <i className={`fas ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ color: 'var(--text-muted)', fontSize: 9, width: 8 }} />
                                  <div>
                                    <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 12, color: '#1E293B' }}>
                                      {r.poNumber}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                                      แผน: {planDateStr}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Product Summary */}
                              <td style={{ padding: '10px 12px', fontSize: 11, color: '#334155', fontWeight: 600 }}>
                                <div style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {r.productSummary}
                                </div>
                              </td>

                              {/* Bed */}
                              <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: '#334155', fontWeight: 600 }}>
                                {r.beds.length > 0 ? r.beds.map(b => b.startsWith('โรงผลิต') ? b : `โรงผลิต ${b}`).join(', ') : '—'}
                              </td>

                              {/* สั่งผลิต (ม.³) */}
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>
                                {fmtNum(r.totalRequested, 2)}
                              </td>

                              {/* จ่ายจริง (ม.³) */}
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#16A34A' }}>
                                {fmtNum(r.suppliedQty, 2)}
                              </td>

                              {/* รอจ่าย (ม.³) */}
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: r.requestedQty > 0 ? '#D97706' : '#94A3B8' }}>
                                {fmtNum(r.requestedQty, 2)}
                              </td>

                              {/* น้ำหนักรวม (ตัน) */}
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, fontSize: 12, color: '#0369A1' }}>
                                {fmtNum(r.weightTon, 2)}
                              </td>

                              {/* สถานะ */}
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                                  {isDone ? (
                                    <BadgeDone label="จ่ายครบแล้ว" />
                                  ) : isPartial ? (
                                    <BadgePartial />
                                  ) : (
                                    <BadgePending label="รอจ่ายคอนกรีต" />
                                  )}
                                  <span style={{ fontSize: 9, fontWeight: 700, color: r.computedStatus === 'completed' ? '#16A34A' : '#D97706', background: r.computedStatus === 'completed' ? '#F0FDF4' : '#FFFBEB', border: `1px solid ${r.computedStatus === 'completed' ? '#86EFAC' : '#FDE68A'}`, padding: '1px 5px', borderRadius: 4 }}>
                                    แผน: {r.computedStatus === 'completed' ? 'ผลิตสำเร็จ' : 'กำลังดำเนินการ'}
                                  </span>
                                </div>
                              </td>
                            </tr>

                            {/* แถวขยายดูคำสั่งซื้อคอนกรีตย่อยของ PO นี้ */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={8} style={{ padding: '12px 18px', background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <i className="fas fa-list-check" style={{ color: '#059669' }} />
                                      <span>รายการคำสั่งซื้อคอนกรีตย่อยในใบสั่งผลิต {r.poNumber} ({r.orders.length} คำสั่ง):</span>
                                    </div>

                                    {r.orders.length === 0 ? (
                                      <div style={{ padding: '10px 14px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                                        คำนวณปริมาณคอนกรีตจากสูตร BOM ของสินค้าสำเร็จรูปในใบสั่งผลิตนี้
                                      </div>
                                    ) : (
                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
                                        {r.orders.map((ord, oIdx) => {
                                          const ordDone = ord.status === 'supplied' || ord.status === 'received'
                                          const reqTimeStr = ord.requestedAt ? new Date(ord.requestedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '—'

                                          return (
                                            <div
                                              key={ord.id || oIdx}
                                              style={{
                                                padding: '9px 12px',
                                                background: '#fff',
                                                border: `1px solid ${ordDone ? '#BBF7D0' : '#FDE68A'}`,
                                                borderRadius: 6,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 4
                                              }}
                                            >
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: '#1E293B' }}>
                                                  เฟสเทปูน: <strong>{ord.phase}</strong>
                                                </span>
                                                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: ordDone ? '#DCFCE7' : '#FEF3C7', color: ordDone ? '#166534' : '#92400E' }}>
                                                  {ordDone ? 'ส่งคอนกรีตแล้ว' : 'รอส่งคอนกรีต'}
                                                </span>
                                              </div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748B', flexWrap: 'wrap', gap: 6 }}>
                                                <span>สูตร: <strong style={{ color: '#334155' }}>{ord.mixRatio || 'มาตรฐาน'}</strong></span>
                                                <span>โรงผลิต: <strong style={{ color: '#334155' }}>{ord.bed ? (ord.bed.startsWith('โรงผลิต') ? ord.bed : `โรงผลิต ${ord.bed}`) : '—'}</strong></span>
                                                <span>ผู้สั่ง: <strong style={{ color: '#047857' }}>{ord.requestedBy || '—'}</strong></span>
                                                <span>เวลา: {reqTimeStr}</span>
                                              </div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, borderTop: '1px dashed #E2E8F0', paddingTop: 4, marginTop: 2 }}>
                                                <span style={{ color: '#475569' }}>ปริมาณ:</span>
                                                <span style={{ fontWeight: 800, color: ordDone ? '#16A34A' : '#D97706', fontFamily: 'monospace' }}>
                                                  {fmtNum(ord.qtyRequested, 2)} ม.³ (≈ {(ord.qtyRequested * 2.4).toFixed(2)} ตัน)
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
                      })
                    )}
                  </tbody>
                  {concreteByPo.length > 0 && (
                    <tfoot>
                      <tr style={{ background: '#ECFDF5', borderTop: '2px solid #6EE7B7' }}>
                        <td colSpan={3} style={{ padding: '10px 12px', fontWeight: 800, fontSize: 11, color: '#065F46' }}>
                          ยอดรวมคอนกรีตทั้งหมด ({concreteByPo.length} ใบสั่งผลิต):
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#065F46', fontFamily: 'monospace' }}>
                          {fmtNum(concreteByPo.reduce((s, r) => s + r.totalRequested, 0), 2)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#16A34A', fontFamily: 'monospace' }}>
                          {fmtNum(concreteByPo.reduce((s, r) => s + r.suppliedQty, 0), 2)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#D97706', fontFamily: 'monospace' }}>
                          {fmtNum(concreteByPo.reduce((s, r) => s + r.requestedQty, 0), 2)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#0369A1', fontFamily: 'monospace' }}>
                          {fmtNum(concreteByPo.reduce((s, r) => s + r.weightTon, 0), 2)}
                        </td>
                        <td style={{ padding: '10px 12px' }} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              มุมมองที่ 2: สรุปคอนกรีตแยกตามหมวดหมู่สินค้า (By Product Category)
             ══════════════════════════════════════════════════════════════════ */}
          {concreteViewMode === 'by-cat' && (
            <>
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
            </>
          )}

          {concreteItems.length === 0 && concreteByPo.length === 0 && (
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
