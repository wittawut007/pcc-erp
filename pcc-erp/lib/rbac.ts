import type { UserRole } from './supabase/types'

// ─── Permission Map ───────────────────────────────────────────────────────────
// '*'   = เข้าได้ทุกหน้า (admin เท่านั้น)
// []    = ไม่มีสิทธิ์ใน admin/desktop routes (ใช้ mobile route แทน)
// path prefix: ตรวจสอบว่า pathname เริ่มต้นด้วย prefix นั้นหรือไม่
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin:     ['*'],
  planner:   ['/dashboard', '/planner', '/production-order', '/job-orders', '/products', '/data-catalog'],
  material:  ['/dashboard', '/material'],
  concrete:  ['/dashboard', '/concrete'],
  warehouse: ['/dashboard', '/inventory', '/warehouse'],
  qc:        [],  // QC ใช้ /(mobile)/qc — ไม่มีสิทธิ์ใน admin routes
  worker:    [],  // Worker ใช้ QR Token เข้า /(worker)/worker
}

// Default redirect path หลัง login สำเร็จ
export const DEFAULT_PATH: Record<UserRole, string> = {
  admin:     '/dashboard',
  planner:   '/dashboard',
  material:  '/dashboard',
  concrete:  '/dashboard',
  warehouse: '/dashboard',
  qc:        '/qc-inspect',    // redirect ไป mobile QC layout
  worker:    '/worker',        // redirect ไป mobile Worker layout
}

// Roles ที่ใช้ Desktop/Admin layout (มี Sidebar)
export const DESKTOP_ROLES: UserRole[] = ['admin', 'planner', 'material', 'concrete', 'warehouse']

// Roles ที่ใช้ Mobile layout
export const MOBILE_ROLES: UserRole[] = ['worker', 'qc']

// Label สำหรับแสดงใน UI
export const ROLE_LABEL: Record<UserRole, string> = {
  admin:     'ผู้ดูแลระบบ (Admin)',
  planner:   'ผู้วางแผนการผลิต (Planner)',
  material:  'พนักงานคลังวัตถุดิบ (Material)',
  concrete:  'พนักงานผสมคอนกรีต (Concrete)',
  warehouse: 'พนักงานคลังสินค้า (Warehouse)',
  qc:        'พนักงาน QC',
  worker:    'พนักงานหน้างาน (Worker)',
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * ตรวจสอบว่า role นี้มีสิทธิ์เข้าถึง path นี้หรือไม่
 * admin มีสิทธิ์ทุกหน้า
 * worker/qc ไม่มีสิทธิ์ admin route ใดๆ
 */
export function canAccess(role: UserRole, path: string): boolean {
  const permissions = ROLE_PERMISSIONS[role]

  // admin เข้าได้ทุกหน้า
  if (permissions.includes('*')) return true

  // ไม่มี permission ใดๆ (worker, qc)
  if (permissions.length === 0) return false

  // เช็ค prefix match
  return permissions.some((prefix) => path === prefix || path.startsWith(prefix + '/'))
}

/**
 * คืนค่า default path สำหรับ role นี้หลัง login
 */
export function getDefaultPath(role: UserRole): string {
  return DEFAULT_PATH[role]
}

/**
 * ตรวจสอบว่า role นี้ใช้ Mobile layout หรือไม่
 */
export function isMobileRole(role: UserRole): boolean {
  return MOBILE_ROLES.includes(role)
}
