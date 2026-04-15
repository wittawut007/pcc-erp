export type UserRole = 'admin' | 'planner' | 'worker' | 'qc'

export type ProductCategory =
  | 'A13 แผ่นพื้นตัน'
  | 'A30 ผนังรั้วสำเร็จรูป'
  | 'A35 รั้วสำเร็จรูป'
  | 'A36 เสา คาน บันได'
  | 'A41 เสาเข็ม'
  | 'A42 กำแพงกันดิน'

export type Bed = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export type PlanStatus = 'draft' | 'confirmed' | 'completed'

export type JobStatus = 'pending' | 'casting' | 'curing' | 'ready_demold' | 'demolded' | 'cancelled'

export type DefectReason = 'crack' | 'chip' | 'honeycomb' | 'other'

// ─── Database Row Types ───

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  employee_code: string
  avatar_url: string | null
  is_active: boolean
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
  cast_at: string | null
  expected_demold_at: string | null
  demolded_at: string | null
  photo_cast_url: string | null
  photo_ready_url: string | null
  created_at: string
  // relations
  plan_item?: ProductionPlanItem
  worker?: Profile
}

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

// ─── Dashboard KPI ───
export interface DashboardKPI {
  target_today: number
  qty_cast: number
  qty_curing: number
  qty_demolded: number
  defect_rate: number
}
