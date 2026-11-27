/**
 * Utility functions for parsing product dimensions and calculating area (sqm)
 */

export interface ProductDimensions {
  width: number
  length: number
}

/**
 * สกัดความกว้างและความยาว (หน่วยเมตร) จาก size หรือ length
 * รองรับรูปแบบ:
 * - '0.35x1.45 m.' -> width = 0.35, length = 1.45
 * - '0.26x2.92 ม.' -> width = 0.26, length = 2.92
 * - '0.15x0.15x3.00' -> width = 0.15, length = 3.00
 * - '1.60 x 3.99 m.' -> width = 1.60, length = 3.99
 * - 'H = 1.50 m' -> width = 0, length = 1.50
 */
export function extractProductDimensions(sizeStr?: string | null, lengthVal?: number | null): ProductDimensions {
  const fallbackLength = typeof lengthVal === 'number' && !isNaN(lengthVal) ? lengthVal : 0

  if (!sizeStr) {
    return { width: 0, length: fallbackLength }
  }

  // กำจัดหน่วยและช่องว่างส่วนเกิน
  const clean = sizeStr.replace(/m\.|m|ม\.|ม/gi, '').trim()

  // แยกด้วยเครื่องหมาย x หรือ X หรือ *
  const parts = clean
    .split(/[xX*]/)
    .map(p => parseFloat(p.trim()))
    .filter(p => !isNaN(p))

  if (parts.length >= 2) {
    const width = parts[0]
    // หากมี 3 ส่วน เช่น 0.15 x 0.15 x 3.00 ความยาวคือส่วนสุดท้าย
    const length = fallbackLength > 0 ? fallbackLength : (parts.length >= 3 ? parts[parts.length - 1] : parts[1])
    return { width, length }
  }

  if (parts.length === 1) {
    return { width: 0, length: fallbackLength > 0 ? fallbackLength : parts[0] }
  }

  return { width: 0, length: fallbackLength }
}

/**
 * คำนวณพื้นที่เป็นตารางเมตร (ตร.ม.)
 * @param width ความกว้าง (ม.)
 * @param length ความยาว (ม.)
 * @param qty จำนวนชิ้นงาน
 */
export function calculateSqm(width: number, length: number, qty: number): number {
  if (width <= 0 || length <= 0 || qty <= 0) return 0
  const total = width * length * qty
  return Math.round((total + Number.EPSILON) * 100) / 100
}

/**
 * ฟอร์แมตวันที่เป็นรูปแบบ พ.ศ. ของไทย เช่น 05/10/2569
 */
export function formatThaiDate(dateStr?: string | null): string {
  if (!dateStr) return '-'
  try {
    const cleanDate = dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`
    const d = new Date(cleanDate)
    if (isNaN(d.getTime())) return dateStr

    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear() + 543
    return `${day}/${month}/${year}`
  } catch {
    return dateStr
  }
}
