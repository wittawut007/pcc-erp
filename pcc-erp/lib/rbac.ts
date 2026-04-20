import type { UserRole } from './supabase/types'

// ─── Permission Map ───────────────────────────────────────────────────────────
// '*' หมายความว่าเข้าได้ทุกหน้า (admin เท่านั้น)
// path prefix ที่อนุญาต: ตรวจสอบว่า pathname เริ่มต้นด้วย prefix นั้นหรือไม่
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin:     ['*'],
  planner:   ['/dashboard', '/planner', '/job-orders', '/demolding', '/products', '/production-order'],
  warehouse: ['/dashboard', '/inventory'],
  qc:        ['/dashboard', '/qc'],
  worker:    [],  // worker ไม่มีสิทธิ์เข้า admin route ใดๆ ทั้งนั้น
}

// default redirect path หลัง login สำเร็จ
export const DEFAULT_PATH: Record<UserRole, string> = {
  admin:     '/dashboard',
  planner:   '/dashboard',
  warehouse: '/dashboard',
  qc:        '/dashboard',
  worker:    '/unauthorized',  // worker login ผ่าน /login → ไม่อนุญาต
}

// label สำหรับแสดงใน UI
export const ROLE_LABEL: Record<UserRole, string> = {
  admin:     'ผู้ดูแลระบบ (Admin)',
  planner:   'ผู้วางแผนผลิต (Planner)',
  warehouse: 'เจ้าหน้าที่คลังสินค้า (Warehouse)',
  qc:        'เจ้าหน้าที่ QC',
  worker:    'พนักงานหน้างาน (Worker)',
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * ตรวจสอบว่า role นี้มีสิทธิ์เข้าถึง path นี้หรือไม่
 * admin มีสิทธิ์ทุกหน้า
 * worker ไม่มีสิทธิ์เลย
 */
export function canAccess(role: UserRole, path: string): boolean {
  const permissions = ROLE_PERMISSIONS[role]

  // admin เข้าได้ทุกหน้า
  if (permissions.includes('*')) return true

  // worker ไม่มีสิทธิ์เลย
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
