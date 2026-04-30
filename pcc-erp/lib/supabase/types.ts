// ─── User Roles ───────────────────────────────────────────────
export type UserRole =
  | 'admin'
  | 'planner'
  | 'material'    // พนักงานคลังวัตถุดิบ
  | 'warehouse'   // พนักงานคลังสินค้า (FG)
  | 'worker'      // พนักงานหน้างาน (QR Login)
  | 'qc'          // พนักงานตรวจสอบคุณภาพ (Mobile Login)
  | 'concrete'    // พนักงานผสมคอนกรีต

export type ProductCategory =
  | 'A13 แผ่นพื้นตัน'
  | 'A30 ผนังรั้วสำเร็จรูป'
  | 'A35 รั้วสำเร็จรูป'
  | 'A36 เสา คาน บันได'
  | 'A41 เสาเข็ม'
  | 'A42 กำแพงกันดิน'

export type Bed = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export type PlanStatus = 'draft' | 'confirmed' | 'completed'

export type JobStatus =
  | 'pending'           // รอเริ่มงาน
  | 'rebar_prep'        // กำลังวางเหล็กโครงสร้าง
  | 'concrete_ordered'  // สั่งคอนกรีตแล้ว รอปูนมา
  | 'casting'           // กำลังเท/หล่อคอนกรีต
  | 'curing'            // บ่มคอนกรีต
  | 'ready_demold'      // พร้อมถอดแบบ
  | 'demolded'          // ถอดแบบแล้ว รอ QC ตรวจ
  | 'qc_passed'         // QC ผ่านแล้ว รอคลังรับ
  | 'completed'         // รับเข้าคลัง FG แล้ว
  | 'cancelled'

export type DefectReason = 'crack' | 'chip' | 'honeycomb' | 'other'

export type PlanMaterialStatus = 'pending' | 'partial' | 'dispensed'
export type ConcreteOrderStatus = 'requested' | 'supplied' | 'cancelled'

// ─── Database Row Types ───────────────────────────────────────

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  employee_code: string | null
  avatar_url: string | null
  is_active: boolean
  worker_token: string | null   // UUID สำหรับ QR Code access (เฉพาะ role = worker)
  created_at: string
}

export interface Product {
  id: string
  code: string
  name: string
  category: ProductCategory
  size: string
  unit: string
  concrete_per_unit: number
  bom_code: string | null
  wip_code: string | null
  is_active: boolean
  created_at: string
}

export interface ProductionPlan {
  id: string
  plan_date: string
  created_by: string
  status: PlanStatus
  total_qty: number
  total_concrete: number
  created_at: string
  // relations
  profile?: Profile
  items?: ProductionPlanItem[]
  materials?: PlanMaterial[]
}

export interface ProductionPlanItem {
  id: string
  plan_id: string
  product_id: string
  bed: Bed
  qty_target: number
  status: JobStatus
  created_at: string
  // relations
  product?: Product
}

export interface ProductionOrder {
  id: string
  order_number: string
  plan_id: string
  confirmed_by: string
  status: 'active' | 'completed' | 'cancelled'
  created_at: string
  // relations
  plan?: ProductionPlan
  profile?: Profile
}

export interface JobOrder {
  id: string
  order_id: string
  plan_item_id: string
  worker_id: string | null
  bed: Bed
  qty_target: number
  qty_cast: number
  status: JobStatus
  started_at: string | null
  rebar_prepared_at: string | null       // Worker ยืนยันวางเหล็กเสร็จ
  concrete_requested_at: string | null   // Worker สั่งคอนกรีต
  cast_at: string | null
  expected_demold_at: string | null
  demolded_at: string | null
  photo_cast_url: string | null
  photo_ready_url: string | null
  created_at: string
  // relations
  plan_item?: ProductionPlanItem
  worker?: Profile
  concrete_orders?: ConcreteOrder[]
  qc_inspection?: QCInspection
}

// ─── New Workflow Tables ──────────────────────────────────────

export interface PlanMaterial {
  id: string
  plan_id: string
  raw_material_id: string
  qty_required: number
  qty_dispensed: number
  status: PlanMaterialStatus
  notes: string | null
  dispensed_by: string | null
  dispensed_at: string | null
  created_at: string
  // relations
  raw_material?: RawMaterial
  dispensed_by_profile?: Profile
}

export interface ConcreteOrder {
  id: string
  job_order_id: string
  requested_by: string
  qty_requested: number    // หน่วย: m³
  mix_ratio: string | null
  status: ConcreteOrderStatus
  notes: string | null
  supplied_by: string | null
  supplied_at: string | null
  requested_at: string
  created_at: string
  // relations
  job_order?: JobOrder
  requested_by_profile?: Profile
  supplied_by_profile?: Profile
}

export interface QCInspection {
  id: string
  job_order_id: string
  qc_id: string
  // Pour inspection
  pour_ok: boolean | null
  pour_notes: string | null
  pour_inspected_at: string | null
  // Demold inspection
  demold_qty_good: number
  demold_qty_defect: number
  defect_reason: DefectReason | null
  defect_detail: string | null
  photo_url: string | null
  demold_inspected_at: string | null
  created_at: string
  // relations
  job_order?: JobOrder
  qc?: Profile
}

export interface FGReceipt {
  id: string
  job_order_id: string
  product_id: string
  warehouse_id: string
  qty_good: number
  qty_defect: number
  notes: string | null
  confirmed_at: string
  created_at: string
  // relations
  job_order?: JobOrder
  product?: Product
  warehouse?: Profile
}

// ─── Existing Tables (unchanged) ─────────────────────────────

export interface DemoldingRecord {
  id: string
  job_order_id: string
  worker_id: string
  qty_good: number
  qty_defect: number
  defect_reason: DefectReason | null
  defect_detail: string | null
  photo_url: string | null
  created_at: string
  // relations
  job_order?: JobOrder
  worker?: Profile
}

export interface FgInventory {
  id: string
  product_id: string
  qty: number
  last_updated_by: string | null
  updated_at: string
  // relations
  product?: Product
}

export interface RawMaterial {
  id: string
  name: string
  category: string
  unit: string
  qty_on_hand: number
  min_stock: number
  cost_per_unit: number | null
  supplier: string | null
  updated_at: string
}

export interface WipInventory {
  id: string
  product_id: string
  wip_code: string
  qty: number
  updated_at: string
  // relations
  product?: Product
}

export interface ActivityLog {
  id: string
  user_id: string
  action_type: string
  entity_type: string
  entity_id: string | null
  detail: string | null
  created_at: string
  // relations
  profile?: Profile
}

// ─── Dashboard KPI ────────────────────────────────────────────
export interface DashboardKPI {
  target_today: number
  qty_cast: number
  qty_curing: number
  qty_demolded: number
  defect_rate: number
}

// ─── Role Labels (for UI display) ────────────────────────────
export const ROLE_LABEL_MAP: Record<UserRole, string> = {
  admin:     'ผู้ดูแลระบบ',
  planner:   'ผู้วางแผนการผลิต',
  material:  'พนักงานคลังวัตถุดิบ',
  warehouse: 'พนักงานคลังสินค้า',
  worker:    'พนักงานหน้างาน',
  qc:        'พนักงาน QC',
  concrete:  'พนักงานผสมคอนกรีต',
}
