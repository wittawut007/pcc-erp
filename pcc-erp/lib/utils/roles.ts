/**
 * lib/utils/roles.ts – Shared Role Utilities
 * รวมข้อมูล Role และการแสดงผลสี Badge ของสิทธิ์การใช้งาน
 */

export interface RoleStyle {
  bg: string
  color: string
  label: string
}

export const ROLE_STYLE_MAP: Record<string, RoleStyle> = {
  super_admin: { bg: '#FEE2E2', color: '#991B1B', label: 'Super Admin' },
  admin: { bg: 'var(--accent-light)', color: 'var(--accent)', label: 'Admin' },
  planner: { bg: 'var(--indigo-light)', color: 'var(--indigo)', label: 'Planner' },
  warehouse: { bg: 'var(--amber-light)', color: 'var(--amber)', label: 'Warehouse' },
  qc: { bg: 'var(--green-light)', color: 'var(--green)', label: 'QC' },
  worker: { bg: '#FFF7ED', color: '#EA580C', label: 'Worker' },
  material: { bg: '#E0F2FE', color: '#0369A1', label: 'Material' },
  concrete: { bg: '#F1F5F9', color: '#475569', label: 'Concrete' },
}

export function getRoleStyle(role: string): RoleStyle {
  return ROLE_STYLE_MAP[role] ?? { bg: '#F3F4F6', color: '#6B7280', label: role }
}
