'use server'

import { createClient } from '@/lib/supabase/server'
import { extractProductDimensions, calculateSqm, formatThaiDate } from '@/lib/utils/product-dimension'

export interface StockReceiptFilterParams {
  startDate?: string
  endDate?: string
  category?: string
  criteria?: 'realtime' | 'erp_synced' | 'all'
  plant?: string
}

export interface StockReceiptItemRow {
  no: number
  orderNumber: string
  erpReference: string // หมายเลขอ้างอิงระบบกลาง
  planDate: string
  thaiDate: string
  plant: string
  bed: string
  productId: string
  productCode: string
  productName: string
  fullProductText: string
  category: string
  width: number
  length: number
  shape: string
  qtyGood: number
  qtyDefect: number
  sqmGood: number
  sqmDefect: number
  isErpSynced: boolean
  status: string
  recordedBy: string  // ผู้บันทึกข้อมูล (QC / Demolding worker)
  confirmedBy: string // ผู้ยืนยันข้อมูล (Admin / Warehouse confirmer)
}

export interface StockReceiptGroup {
  category: string
  items: StockReceiptItemRow[]
  subtotal: {
    qtyGood: number
    qtyDefect: number
    sqmGood: number
    sqmDefect: number
  }
}

export interface StockReceiptReportResult {
  groups: StockReceiptGroup[]
  totalSummary: {
    totalItems: number
    qtyGood: number
    qtyDefect: number
    sqmGood: number
    sqmDefect: number
  }
  availableCategories: string[]
  meta: {
    reportNo: string
    title: string
    startDateStr: string
    endDateStr: string
    categoryRangeStr: string
    plantStr: string
  }
}

export async function getStockReceiptReportData(
  filters: StockReceiptFilterParams = {}
): Promise<StockReceiptReportResult> {
  const supabase = await createClient()

  const {
    startDate,
    endDate,
    category,
    criteria = 'realtime',
    plant = '003 โพสสาขาขอนแก่น',
  } = filters

  // 1. Prepare base query for production orders
  let poQuery = supabase
    .from('production_orders')
    .select(`
      id,
      order_number,
      status,
      confirmed_by,
      created_at,
      plan:production_plans(id, plan_date, created_by),
      job_orders(
        id,
        bed,
        status,
        worker_id,
        qty_target,
        qty_cast,
        demolding_records(id, qty_good, qty_defect, worker_id, created_at),
        plan_item:production_plan_items(
          product:products(id, code, name, category, size, length, unit)
        )
      )
    `)
    .order('created_at', { ascending: false })

  // Criteria B: เฉพาะที่ยืนยัน ERP แล้ว
  if (criteria === 'erp_synced') {
    poQuery = poQuery.eq('status', 'erp_synced')
  }

  // 2. Fetch production orders, profiles, fg_receipts, and activity_logs in parallel
  const [
    { data: productionOrders, error: poError },
    { data: profiles },
    { data: fgReceipts },
    { data: erpLogs },
  ] = await Promise.all([
    poQuery,
    supabase.from('profiles').select('id, full_name, email, role'),
    supabase.from('fg_receipts').select('job_order_id, notes, warehouse_id'),
    supabase.from('activity_logs').select('entity_id, detail, user_id').ilike('action_type', '%ERP%'),
  ])

  if (poError) {
    console.error('Error fetching production orders for stock report:', poError)
    throw new Error(`Failed to fetch report data: ${poError.message}`)
  }

  // Build Profile Lookup Map (UUID -> Full Name)
  const profileMap = new Map<string, string>()
  profiles?.forEach(p => {
    profileMap.set(p.id, p.full_name || p.email || p.role)
  })

  // Build Job -> ERP Reference & Warehouse User Lookup Map
  const receiptErpMap = new Map<string, string>()
  const receiptUserMap = new Map<string, string>()
  fgReceipts?.forEach(r => {
    if (r.job_order_id && r.notes) {
      const match = r.notes.match(/\(([^)]+)\)/)
      receiptErpMap.set(r.job_order_id, match ? match[1] : r.notes)
    }
    if (r.job_order_id && r.warehouse_id) {
      receiptUserMap.set(r.job_order_id, r.warehouse_id)
    }
  })

  // Build Order -> ERP Reference & Confirmer Lookup Map from Logs
  const logErpMap = new Map<string, string>()
  const logUserMap = new Map<string, string>()
  erpLogs?.forEach(l => {
    if (l.entity_id && l.detail) {
      const match = l.detail.match(/อัปเดตหมายเลขอ้างอิง ERP \(([^)]+)\)/)
      if (match) logErpMap.set(l.entity_id, match[1])
    }
    if (l.entity_id && l.user_id) {
      logUserMap.set(l.entity_id, l.user_id)
    }
  })

  // 3. Process and flatten rows
  const allRows: StockReceiptItemRow[] = []
  const categorySet = new Set<string>()

  let runningIndex = 1

  for (const po of productionOrders || []) {
    const planObj = po.plan as { id?: string; plan_date?: string; created_by?: string } | null
    const planDate = planObj?.plan_date || po.created_at?.split('T')[0] || ''

    // Date range filter
    if (startDate && planDate < startDate) continue
    if (endDate && planDate > endDate) continue

    const jobs = (po.job_orders || []) as unknown as Array<{
      id: string
      bed: string | null
      status: string
      worker_id: string | null
      qty_target: number
      qty_cast: number
      demolding_records: Array<{
        id: string
        qty_good: number
        qty_defect: number
        worker_id: string | null
        created_at: string
      }> | null
      plan_item:
        | {
            product:
              | {
                  id: string
                  code: string
                  name: string
                  category: string
                  size: string | null
                  length: number | null
                  unit: string
                }
              | Array<{
                  id: string
                  code: string
                  name: string
                  category: string
                  size: string | null
                  length: number | null
                  unit: string
                }>
              | null
          }
        | Array<{
            product:
              | {
                  id: string
                  code: string
                  name: string
                  category: string
                  size: string | null
                  length: number | null
                  unit: string
                }
              | Array<{
                  id: string
                  code: string
                  name: string
                  category: string
                  size: string | null
                  length: number | null
                  unit: string
                }>
              | null
          }>
        | null
    }>

    for (const job of jobs) {
      const planItem = Array.isArray(job.plan_item) ? job.plan_item[0] : job.plan_item
      const productRaw = planItem?.product
      const product = Array.isArray(productRaw) ? productRaw[0] : productRaw
      if (!product) continue

      const catName = product.category || 'ไม่ระบุหมวดหมู่'
      categorySet.add(catName)

      // Category filter
      if (category && category !== 'all' && catName !== category) {
        continue
      }

      const demoldList = job.demolding_records || []
      const firstDemold = demoldList.length > 0 ? demoldList[0] : null
      const qtyGood = firstDemold?.qty_good || 0
      const qtyDefect = firstDemold?.qty_defect || 0

      // Criteria A: ถ้าไม่มีทั้งงานดีและงานเสีย (ยังไม่ได้บันทึกตัดยก) ให้ข้าม
      if (qtyGood === 0 && qtyDefect === 0) continue

      const dim = extractProductDimensions(product.size, product.length)
      const sqmGood = calculateSqm(dim.width, dim.length, qtyGood)
      const sqmDefect = calculateSqm(dim.width, dim.length, qtyDefect)

      // Bed formatting: 2 digits or fallback
      const bedStr = job.bed ? (String(job.bed).length === 1 ? `0${job.bed}` : String(job.bed)) : '00'

      // Resolve ERP Reference (หมายเลขอ้างอิงระบบกลาง)
      const erpRef =
        receiptErpMap.get(job.id) ||
        logErpMap.get(po.id) ||
        (po.status === 'erp_synced' ? po.order_number : '-')

      // Resolve Confirmer (ผู้ยืนยันข้อมูล)
      const confirmerId =
        po.confirmed_by ||
        receiptUserMap.get(job.id) ||
        logUserMap.get(po.id)
      const confirmedByName =
        (confirmerId ? profileMap.get(confirmerId) : '') ||
        (po.status === 'erp_synced' ? 'ระบบกลาง (ERP)' : '-')

      // Resolve Recorder (ผู้บันทึกข้อมูล: QC / ตัดยก / วางแผน)
      const recorderId = firstDemold?.worker_id || job.worker_id || planObj?.created_by
      const recordedByName = (recorderId ? profileMap.get(recorderId) : '') || 'ฝ่ายผลิต / QC'

      allRows.push({
        no: runningIndex++,
        orderNumber: po.order_number,
        erpReference: erpRef,
        planDate,
        thaiDate: formatThaiDate(planDate),
        plant: '003-03',
        bed: bedStr,
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        fullProductText: `${product.code} ${product.name}`,
        category: catName,
        width: dim.width,
        length: dim.length,
        shape: '00 ไม่ระบุเบอร์สินค้า/รูปร่าง',
        qtyGood,
        qtyDefect,
        sqmGood,
        sqmDefect,
        isErpSynced: po.status === 'erp_synced',
        status: po.status,
        recordedBy: recordedByName,
        confirmedBy: confirmedByName,
      })
    }
  }

  // 4. Sort by category, planDate ascending, orderNumber ascending
  allRows.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category, 'th')
    if (a.planDate !== b.planDate) return a.planDate.localeCompare(b.planDate)
    return a.orderNumber.localeCompare(b.orderNumber)
  })

  // Re-assign running index per sorted rows
  allRows.forEach((r, idx) => {
    r.no = idx + 1
  })

  // 5. Group rows by category and calculate subtotals
  const groupMap = new Map<string, StockReceiptItemRow[]>()
  for (const row of allRows) {
    if (!groupMap.has(row.category)) {
      groupMap.set(row.category, [])
    }
    groupMap.get(row.category)!.push(row)
  }

  let totalQtyGood = 0
  let totalQtyDefect = 0
  let totalSqmGood = 0
  let totalSqmDefect = 0

  const groups: StockReceiptGroup[] = []
  groupMap.forEach((items, cat) => {
    let subGood = 0
    let subDefect = 0
    let subSqmGood = 0
    let subSqmDefect = 0

    items.forEach(item => {
      subGood += item.qtyGood
      subDefect += item.qtyDefect
      subSqmGood += item.sqmGood
      subSqmDefect += item.sqmDefect
    })

    subSqmGood = Math.round((subSqmGood + Number.EPSILON) * 100) / 100
    subSqmDefect = Math.round((subSqmDefect + Number.EPSILON) * 100) / 100

    totalQtyGood += subGood
    totalQtyDefect += subDefect
    totalSqmGood += subSqmGood
    totalSqmDefect += subSqmDefect

    groups.push({
      category: cat,
      items,
      subtotal: {
        qtyGood: subGood,
        qtyDefect: subDefect,
        sqmGood: subSqmGood,
        sqmDefect: subSqmDefect,
      },
    })
  })

  totalSqmGood = Math.round((totalSqmGood + Number.EPSILON) * 100) / 100
  totalSqmDefect = Math.round((totalSqmDefect + Number.EPSILON) * 100) / 100

  // 6. Meta info
  const startDateStr = startDate ? formatThaiDate(startDate) : '-'
  const endDateStr = endDate ? formatThaiDate(endDate) : '-'
  const categoryRangeStr = category && category !== 'all' ? category : 'ทุกกลุ่มสินค้า'

  return {
    groups,
    totalSummary: {
      totalItems: allRows.length,
      qtyGood: totalQtyGood,
      qtyDefect: totalQtyDefect,
      sqmGood: totalSqmGood,
      sqmDefect: totalSqmDefect,
    },
    availableCategories: Array.from(categorySet).sort((a, b) => a.localeCompare(b, 'th')),
    meta: {
      reportNo: 'Report No. IV70007',
      title: 'รายงาน รับเข้าสต็อก แยกกลุ่มสินค้า',
      startDateStr,
      endDateStr,
      categoryRangeStr,
      plantStr: plant,
    },
  }
}
