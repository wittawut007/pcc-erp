import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * สร้างเลขที่ใบสั่งผลิตถัดไปโดยใช้ MAX แทน COUNT
 *
 * ทำไมต้องใช้ MAX แทน COUNT?
 * - COUNT(*)+1 จะเกิดปัญหาเมื่อมีการลบ PO ทำให้เกิด "gap" ในลำดับ
 *   เช่น มี 001,002,003,004,006,007,008 → COUNT=7 → seq=8 → ซ้ำกับ 008!
 * - MAX(seq)+1 จะได้ผลลัพธ์ที่ถูกต้องเสมอ
 *   เช่น มี 001,002,003,004,006,007,008 → MAX=8 → seq=9 → ถูกต้อง ✅
 *
 * @param supabase - Supabase client (server หรือ client ก็ได้)
 * @param prefix   - คำนำหน้า เช่น 'PO' หรือ 'ADJ'
 * @param datePart - วันที่ในรูปแบบ YYYYMMDD เช่น '20260804'
 * @returns        - เลขที่ใบสั่งผลิตถัดไป เช่น 'PO-20260804-009'
 */
export async function getNextOrderNumber(
  supabase: SupabaseClient,
  prefix: 'PO' | 'ADJ',
  datePart: string
): Promise<string> {
  const pattern = `${prefix}-${datePart}-%`

  const { data } = await supabase
    .from('production_orders')
    .select('order_number')
    .like('order_number', pattern)
    .order('order_number', { ascending: false })
    .limit(1)

  // ดึงตัวเลข sequence จากเลขสุดท้าย เช่น 'PO-20260804-008' → 8
  const lastSeq =
    data?.[0]?.order_number
      ? parseInt(data[0].order_number.split('-')[2], 10)
      : 0

  // ใช้ MAX+1 เพื่อให้ได้ลำดับถัดไปเสมอ ไม่ว่าจะมี gap หรือไม่
  const nextSeq = String(lastSeq + 1).padStart(3, '0')
  return `${prefix}-${datePart}-${nextSeq}`
}
