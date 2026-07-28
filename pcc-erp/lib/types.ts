/**
 * ======================================================
 * lib/types.ts – Shared TypeScript Type Definitions
 * ใช้แทน `any` ทั่วทั้งโปรเจกต์
 * ======================================================
 */

// ─── User / Profile ───────────────────────────────────
export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'planner'
  | 'warehouse'
  | 'qc'
  | 'worker'
  | 'material'
  | 'concrete'

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  employee_code: string | null
  avatar_url: string | null
  is_active: boolean
  worker_token: string | null
}

// ─── Production Plan / Items ───────────────────────────
export type PlanStatus = 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
export type PlanItemStatus = 'pending' | 'casting' | 'cast' | 'curing' | 'demolded' | 'completed'
export type OrderStatus = 'active' | 'completed' | 'erp_synced' | 'cancelled'

/** ประเภทแผนผลิต: fg = สินค้าสำเร็จรูป, component = ชิ้นส่วน Counterfort SFG */
export type PlanType = 'fg' | 'component'

/** ประเภท Job Order: fg = งานปกติ, component = ผลิต Counterfort เข้าคลัง */
export type JobType = 'fg' | 'component'

export interface PlanItem {
  id: string
  plan_id: string
  product_id: string
  bed: string
  qty_target: number
  status: PlanItemStatus
  product?: Product
}

export interface ProductionPlan {
  id: string
  plan_date: string
  created_by: string
  status: PlanStatus
  plan_type: PlanType
  total_qty: number
  total_concrete?: number | null
  items?: PlanItem[]
  plan_materials?: PlanMaterial[]
  production_orders?: ProductionOrder[]
}

// ─── Production Order / Job Order ─────────────────────
export interface ProductionOrder {
  id: string
  order_number: string
  plan_id: string
  confirmed_by: string | null
  status: OrderStatus
  erp_reference?: string | null
  created_at: string
}

export interface JobOrder {
  id: string
  order_id: string
  plan_item_id: string
  worker_id: string | null
  bed: string
  qty_target: number
  qty_cast: number
  status: string
  job_type: JobType
  started_at?: string | null
  cast_at?: string | null
  demolded_at?: string | null
  demolding_records?: DemoldingRecord[]
  plan_item?: { product?: Product }
}

// ─── Demolding ─────────────────────────────────────────
export interface DemoldingRecord {
  id?: string
  job_order_id?: string
  worker_id?: string
  qty_good: number
  qty_defect: number
  defect_reason?: string | null
  defect_detail?: string | null
}

// ─── Products & BOM ────────────────────────────────────
export interface Product {
  id: string
  code: string
  name: string
  category: string
  unit: string
  size?: string | null
  concrete_per_unit?: number | null
  wire_per_unit?: number | null
  rebar_per_unit?: number | null
  mesh_per_unit?: number | null
  length?: number | null
  /** FK → raw_materials.id ของ Counterfort SFG ที่ใช้ประกอบ (A42 เท่านั้น) */
  counterfort_material_id?: string | null
  /** จำนวน Counterfort ต่อ 1 ชิ้น L-Wall */
  counterfort_qty_per_unit?: number
  product_bom_items?: BomItem[]
}

// ─── Counterfort Stock Check ──────────────────────────
export interface CounterfortStockCheck {
  productId: string
  productName: string
  cfMaterialId: string
  cfMaterialName: string
  cfMaterialCode: string | null
  qtyRequired: number
  qtyAvailable: number
  sufficient: boolean
}

export interface BomItem {
  id: string
  qty_per_unit: number
  raw_materials?: RawMaterial
}

// ─── Raw Materials ─────────────────────────────────────
export interface RawMaterial {
  id: string
  name: string
  category: string
  unit: string
  material_code?: string | null
  weight_per_meter?: number | null
}

// ─── Plan Materials ────────────────────────────────────
export type MaterialStatus = 'pending' | 'partial' | 'dispensed' | 'returned'

export interface PlanMaterial {
  id: string
  plan_id: string
  raw_material_id: string
  qty_required: number
  qty_dispensed: number
  status: MaterialStatus
  notes?: string | null
  raw_material?: RawMaterial
}

// ─── Raw Material Inventory ────────────────────────────
export interface RawMaterialInventory {
  id: string
  name: string
  category: string
  unit: string
  material_code?: string | null
  current_stock: number
  min_stock?: number | null
  weight_per_meter?: number | null
}

// ─── Inventory Summary ─────────────────────────────────
export interface InventorySummaryItem {
  category: string
  totalStock: number
  itemCount: number
}

export interface ConcreteInventoryItem {
  id: string
  product_id: string
  qty: number
  updated_at?: string
}

// ─── Chart.js Types ────────────────────────────────────
export interface ChartDataset {
  label: string
  data: number[]
  backgroundColor?: string | string[]
  borderColor?: string | string[]
  borderWidth?: number
  fill?: boolean
  tension?: number
  [key: string]: unknown
}

export interface ChartData {
  labels: string[]
  datasets: ChartDataset[]
}

// ─── FG Print Data ─────────────────────────────────────
export interface FgPrintItem {
  id: string
  productCode: string
  productName: string
  size: string
  category: string
  unit: string
  bed: string
  qtyTarget: number
  qtyGood: number
  qtyDefect: number
  defectDetail: string
  concretePerUnit: number
  wirePerUnit: number
  rebarPerUnit: number
  meshPerUnit: number
  length: number
  bomItems: PrintBomItem[]
}

export interface PrintBomItem {
  id: string
  qtyPerUnit: number
  materialName: string
  materialCategory: string
  materialUnit: string
  materialCode?: string | null
  weightPerMeter?: number | null
}

export interface PrintPlanMaterial {
  id: string
  qtyRequired: number
  qtyDispensed: number
  status: MaterialStatus
  notes?: string | null
  rawMaterial: {
    id: string
    name: string
    category: string
    unit: string
    materialCode?: string | null
    weightPerMeter?: number | null
  } | null
}

export interface FgPrintData {
  orderNumber: string
  planDateStr: string
  printDateStr: string
  printTimeStr: string
  confirmedBy: string
  items: FgPrintItem[]
  erpReference?: string | null
  status: OrderStatus
  totalConcrete: number
  planMaterials: PrintPlanMaterial[]
}

// ─── Server Action Results ─────────────────────────────
export interface ActionResult<T = undefined> {
  success: boolean
  error?: string
  data?: T
}

// ─── User Update Payload (Supabase Admin) ──────────────
export interface AuthUpdatePayload {
  user_metadata: {
    full_name: string
    role: UserRole
    employee_code: string
  }
  ban_duration: string
  password?: string
}

export interface ProfileUpdatePayload {
  full_name: string
  role: UserRole
  employee_code: string
  is_active: boolean
  avatar_url?: string | null
}

// ─── QR Modal State ────────────────────────────────────
export interface QrModalState {
  open: boolean
  user: UserProfile | null
  token: string | null
}
