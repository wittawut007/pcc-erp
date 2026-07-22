/**
 * lib/utils/defects.ts – Centralized Defect Reason Helpers
 * ข้อมูลเหตุผลของเสียและการแปลงชื่อเหตุผลภาษาไทย
 */

export interface DefectReasonOption {
  value: string
  label: string
}

export const DEFECT_REASON_MAP: Record<string, string> = {
  crack: 'แตก / ร้าว',
  chip: 'บิ่น / มุมหัก',
  honeycomb: 'รังผึ้ง (Honeycomb)',
  dimension: 'ขนาดไม่ได้มาตรฐาน',
  surface: 'ผิวหน้าไม่เรียบ',
  other: 'อื่นๆ',
}

export const DEFECT_REASON_OPTIONS: DefectReasonOption[] = [
  { value: 'crack', label: 'แตก / ร้าว' },
  { value: 'chip', label: 'บิ่น / มุมหัก' },
  { value: 'honeycomb', label: 'รังผึ้ง (Honeycomb)' },
  { value: 'dimension', label: 'ขนาดไม่ได้มาตรฐาน' },
  { value: 'surface', label: 'ผิวหน้าไม่เรียบ' },
  { value: 'other', label: 'อื่นๆ' },
]

/**
 * แปลงรหัส defect_reason เป็นข้อความภาษาไทย
 */
export function translateDefectReason(reason: string | null | undefined): string {
  if (!reason) return ''
  return DEFECT_REASON_MAP[reason] || reason
}
