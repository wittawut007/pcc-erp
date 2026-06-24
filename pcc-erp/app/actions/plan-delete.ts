'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface SearchPlanResult {
  success: boolean
  error?: string
  data?: {
    planId: string
    planDate: string
    planStatus: string
    orderNumber: string
    confirmedBy: string | null
    planItems: Array<{
      id: string
      productCode: string
      productName: string
      productUnit: string
      bed: string
      qtyTarget: number
      status: string
    }>
    jobOrdersCount: number
    concreteOrdersCount: number
    qcInspectionsCount: number
    photosCount: number
    inventoryReductions: Array<{
      productId: string
      productCode: string
      productName: string
      qtyToReduce: number
    }>
    photoUrls: string[]
  }
}

export interface DeletePlanResult {
  success: boolean
  error?: string
  summary?: {
    planId: string
    poCode: string
    deletedJobOrders: number
    deletedConcreteOrders: number
    deletedQcInspections: number
    deletedDemoldingRecords: number
    deletedPhotos: number
    inventoryAdjusted: Array<{
      productName: string
      reducedQty: number
    }>
  }
}

// ─── Helper: Get Authenticated Admin Profile ───────────────────────────────────

async function getAdminClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('ไม่ได้เข้าสู่ระบบ')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('ไม่มีสิทธิ์ Admin')

  return { supabase, userProfile: profile }
}

// Extract storage path from job_photos URL
function getStoragePathFromUrl(url: string | null): string | null {
  if (!url) return null
  const marker = '/job_photos/'
  const index = url.indexOf(marker)
  if (index === -1) return null
  return url.substring(index + marker.length)
}

// ─── Action: Search Plan by PO Code ──────────────────────────────────────────

export async function searchPlanByPoCode(poCode: string): Promise<SearchPlanResult> {
  try {
    const { supabase } = await getAdminClient()

    if (!poCode || poCode.trim() === '') {
      return { success: false, error: 'กรุณากรอกรหัส PO Code' }
    }

    // 1. ค้นหาใบสั่งผลิต (production_orders) ด้วย order_number
    const { data: po, error: poErr } = await supabase
      .from('production_orders')
      .select('id, plan_id, order_number, confirmed_by, profiles(full_name)')
      .eq('order_number', poCode.trim())
      .maybeSingle()

    if (poErr) throw new Error(poErr.message)
    if (!po) {
      return { success: false, error: `ไม่พบรหัสใบสั่งผลิต (PO Code) "${poCode}" ในระบบ` }
    }

    const planId = po.plan_id
    if (!planId) {
      return { success: false, error: 'ใบสั่งผลิตไม่มีความเชื่อมโยงกับแผนการผลิตใดๆ' }
    }

    // 2. ดึงข้อมูลแผนการผลิต (production_plans)
    const { data: plan, error: planErr } = await supabase
      .from('production_plans')
      .select('id, plan_date, status')
      .eq('id', planId)
      .single()

    if (planErr) throw new Error(planErr.message)

    // 3. ดึงรายการสินค้าในแผนการผลิต (production_plan_items)
    const { data: planItems, error: itemsErr } = await supabase
      .from('production_plan_items')
      .select('id, product_id, bed, qty_target, status, products(code, name, unit)')
      .eq('plan_id', planId)

    if (itemsErr) throw new Error(itemsErr.message)

    const formattedItems = (planItems ?? []).map((item: any) => {
      const prod = Array.isArray(item.products) ? item.products[0] : item.products
      return {
        id: item.id,
        productCode: prod?.code ?? '',
        productName: prod?.name ?? '',
        productUnit: prod?.unit ?? 'ชิ้น',
        bed: item.bed,
        qtyTarget: item.qty_target,
        status: item.status
      }
    })

    // 4. ดึงข้อมูลงานหล่อ (job_orders) ที่เชื่อมโยงกับใบสั่งผลิต
    const { data: jobOrders, error: jobsErr } = await supabase
      .from('job_orders')
      .select(`
        id, 
        status, 
        photo_cast_url, 
        photo_ready_url,
        plan_item:production_plan_items(
          product_id, 
          products(code, name)
        )
      `)
      .eq('order_id', po.id)

    if (jobsErr) throw new Error(jobsErr.message)

    const jobIds = (jobOrders ?? []).map((j: any) => j.id)

    // 5. ดึง concrete_orders
    let concreteOrdersCount = 0
    if (jobIds.length > 0) {
      const { count, error: concErr } = await supabase
        .from('concrete_orders')
        .select('*', { count: 'exact', head: true })
        .in('job_order_id', jobIds)
      if (concErr) throw new Error(concErr.message)
      concreteOrdersCount = count ?? 0
    }

    // 6. ดึง qc_inspections & demolding_records ของงาน
    let qcInspections: any[] = []
    let demoldingRecords: any[] = []

    if (jobIds.length > 0) {
      const [qcRes, demoldRes] = await Promise.all([
        supabase.from('qc_inspections').select('id, job_order_id, demold_qty_good, photo_url').in('job_order_id', jobIds),
        supabase.from('demolding_records').select('id, job_order_id, qty_good, photo_url').in('job_order_id', jobIds)
      ])

      if (qcRes.error) throw new Error(qcRes.error.message)
      if (demoldRes.error) throw new Error(demoldRes.error.message)

      qcInspections = qcRes.data ?? []
      demoldingRecords = demoldRes.data ?? []
    }

    // 7. รวบรวมรูปภาพทั้งหมดที่ต้องลบ
    const photoUrlsSet = new Set<string>()
    jobOrders?.forEach((job: any) => {
      if (job.photo_cast_url) photoUrlsSet.add(job.photo_cast_url)
      if (job.photo_ready_url) photoUrlsSet.add(job.photo_ready_url)
    })
    qcInspections.forEach((qc: any) => {
      if (qc.photo_url) photoUrlsSet.add(qc.photo_url)
    })
    demoldingRecords.forEach((dr: any) => {
      if (dr.photo_url) photoUrlsSet.add(dr.photo_url)
    })

    const photoUrls = Array.from(photoUrlsSet)

    // 8. คำนวณจำนวนที่ต้องหักออกจาก fg_inventory
    // หักตาม demold qty ของ job_orders ในแผนนั้นที่มีสถานะถอดแบบ/qc (ใช้ demold_qty_good ใน qc_inspections หรือ qty_good ใน demolding_records)
    const reductionMap: Record<string, { code: string; name: string; qty: number }> = {}

    jobOrders?.forEach((job: any) => {
      // ค้นหา record QC หรือ Demolding ของ Job Order นี้
      const qcRecord = qcInspections.find((q: any) => q.job_order_id === job.id)
      const demoldRecord = demoldingRecords.find((d: any) => d.job_order_id === job.id)

      const goodQty = qcRecord?.demold_qty_good ?? demoldRecord?.qty_good ?? 0

      if (goodQty > 0) {
        const planItemData = Array.isArray(job.plan_item) ? job.plan_item[0] : job.plan_item
        const productData = planItemData?.products ? (Array.isArray(planItemData.products) ? planItemData.products[0] : planItemData.products) : null
        const productId = planItemData?.product_id

        if (productId) {
          if (!reductionMap[productId]) {
            reductionMap[productId] = {
              code: productData?.code ?? 'N/A',
              name: productData?.name ?? 'ไม่ระบุชื่อ',
              qty: 0
            }
          }
          reductionMap[productId].qty += goodQty
        }
      }
    })

    const inventoryReductions = Object.entries(reductionMap).map(([productId, val]) => ({
      productId,
      productCode: val.code,
      productName: val.name,
      qtyToReduce: val.qty
    })).filter(item => item.qtyToReduce > 0)

    const profilesData = po.profiles as any
    const confirmedProfileName = profilesData ? (Array.isArray(profilesData) ? profilesData[0]?.full_name : profilesData?.full_name) : null

    return {
      success: true,
      data: {
        planId: plan.id,
        planDate: plan.plan_date,
        planStatus: plan.status,
        orderNumber: po.order_number,
        confirmedBy: confirmedProfileName ?? null,
        planItems: formattedItems,
        jobOrdersCount: jobOrders?.length ?? 0,
        concreteOrdersCount,
        qcInspectionsCount: qcInspections.length,
        photosCount: photoUrls.length,
        inventoryReductions,
        photoUrls
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการค้นหาข้อมูล'
    return { success: false, error: message }
  }
}

// ─── Action: Delete Full Plan by Plan ID ─────────────────────────────────────

export async function deleteFullPlanByPlanId(planId: string, poCode: string): Promise<DeletePlanResult> {
  try {
    const { supabase, userProfile } = await getAdminClient()

    if (!planId) return { success: false, error: 'ระบุไอดีแผนการผลิตไม่ถูกต้อง' }
    if (!poCode) return { success: false, error: 'ระบุรหัส PO ไม่ถูกต้อง' }

    // ค้นหาและรวบรวมข้อมูลเพื่อยืนยันอีกครั้งและเตรียมการลบ
    const searchData = await searchPlanByPoCode(poCode)
    if (!searchData.success || !searchData.data) {
      return { success: false, error: searchData.error ?? 'ไม่สามารถตรวจสอบข้อมูลแผนที่ต้องการลบได้' }
    }

    const { data: details } = searchData
    if (details.planId !== planId) {
      return { success: false, error: 'ข้อมูลไอดีแผนไม่ตรงกับ PO Code' }
    }

    const adminSupabase = createAdminClient()

    // 1. ดึง ID ของ production_orders
    const { data: po, error: poErr } = await supabase
      .from('production_orders')
      .select('id')
      .eq('plan_id', planId)
      .maybeSingle()

    if (poErr) throw new Error(poErr.message)
    if (!po) {
      return { success: false, error: 'ไม่พบใบสั่งผลิตที่เชื่อมโยงกับแผนนี้' }
    }

    const poId = po.id

    // 2. ดึง Job Order IDs ทั้งหมดของ PO
    const { data: jobs, error: jobsErr } = await supabase
      .from('job_orders')
      .select('id')
      .eq('order_id', poId)

    if (jobsErr) throw new Error(jobsErr.message)
    const jobIds = (jobs ?? []).map(j => j.id)

    // 3. เริ่มกระบวนการ UPDATE: หัก qty ออกจาก fg_inventory
    const inventoryAdjustedSummary: Array<{ productName: string; reducedQty: number }> = []

    for (const reduction of details.inventoryReductions) {
      // ค้นหายอดปัจจุบันในคลังสินค้า
      const { data: existingFg, error: fgFetchErr } = await adminSupabase
        .from('fg_inventory')
        .select('id, qty')
        .eq('product_id', reduction.productId)
        .maybeSingle()

      if (fgFetchErr) throw new Error(`ล้มเหลวในการค้นหาคลังสินค้า: ${fgFetchErr.message}`)

      if (existingFg) {
        // คำนวณยอดใหม่
        const newQty = Math.max(0, existingFg.qty - reduction.qtyToReduce)
        const { error: updateErr } = await adminSupabase
          .from('fg_inventory')
          .update({
            qty: newQty,
            updated_at: new Date().toISOString(),
            last_updated_by: userProfile.id
          })
          .eq('id', existingFg.id)

        if (updateErr) throw new Error(`ล้มเหลวในการหักสต็อก FG: ${updateErr.message}`)
        
        inventoryAdjustedSummary.push({
          productName: reduction.productName,
          reducedQty: reduction.qtyToReduce
        })
      }
    }

    // 4. ลบไฟล์รูปภาพใน Storage (job_photos bucket)
    let deletedPhotosCount = 0
    if (details.photoUrls.length > 0) {
      const filePaths = details.photoUrls
        .map(url => getStoragePathFromUrl(url))
        .filter((path): path is string => path !== null && path.trim() !== '')

      if (filePaths.length > 0) {
        const { error: removeError } = await adminSupabase.storage.from('job_photos').remove(filePaths)
        if (removeError) {
          console.error('Error removing files from storage bucket:', removeError)
          // หากลบใน storage ผิดพลาด จะยังคงให้ทำงานต่อเพื่อไม่ให้เกิด DB inconsistent
        } else {
          deletedPhotosCount = filePaths.length;
        }
      }
    }

    // 5. ลบประวัติข้อมูลการผลิตใน Database ตามลำดับ FK
    if (jobIds.length > 0) {
      // 5.1 ลบ concrete_rounds
      // ดึง ID ของ concrete_orders ก่อน
      const { data: concreteOrders, error: coFetchErr } = await adminSupabase
        .from('concrete_orders')
        .select('id')
        .in('job_order_id', jobIds)
      
      if (coFetchErr) throw new Error(`ล้มเหลวในการดึงข้อมูลใบสั่งคอนกรีต: ${coFetchErr.message}`)
      
      const concreteOrderIds = (concreteOrders ?? []).map(co => co.id)
      
      if (concreteOrderIds.length > 0) {
        const { error: crDelErr } = await adminSupabase.from('concrete_rounds').delete().in('concrete_order_id', concreteOrderIds)
        if (crDelErr) throw new Error(`ล้มเหลวในการลบ concrete_rounds: ${crDelErr.message}`)

        // 5.2 ลบ concrete_orders
        const { error: coDelErr } = await adminSupabase.from('concrete_orders').delete().in('id', concreteOrderIds)
        if (coDelErr) throw new Error(`ล้มเหลวในการลบ concrete_orders: ${coDelErr.message}`)
      }

      // 5.3 ลบ job_order_defects
      const { error: defectDelErr } = await adminSupabase.from('job_order_defects').delete().in('job_order_id', jobIds)
      if (defectDelErr) throw new Error(`ล้มเหลวในการลบ job_order_defects: ${defectDelErr.message}`)

      // 5.4 ลบ demolding_records
      const { error: demoldDelErr } = await adminSupabase.from('demolding_records').delete().in('job_order_id', jobIds)
      if (demoldDelErr) throw new Error(`ล้มเหลวในการลบ demolding_records: ${demoldDelErr.message}`)

      // 5.5 ลบ qc_inspections
      const { error: qcDelErr } = await adminSupabase.from('qc_inspections').delete().in('job_order_id', jobIds)
      if (qcDelErr) throw new Error(`ล้มเหลวในการลบ qc_inspections: ${qcDelErr.message}`)

      // 5.6 ลบ fg_receipts (ถ้ามี)
      const { error: receiptDelErr } = await adminSupabase.from('fg_receipts').delete().in('job_order_id', jobIds)
      if (receiptDelErr) throw new Error(`ล้มเหลวในการลบ fg_receipts: ${receiptDelErr.message}`)
      
      // 5.7 ลบ job_orders
      const { error: jobDelErr } = await adminSupabase.from('job_orders').delete().in('id', jobIds)
      if (jobDelErr) throw new Error(`ล้มเหลวในการลบ job_orders: ${jobDelErr.message}`)
    }

    // 6. ลบแผนวัตถุดิบ (plan_materials)
    const { error: matDelErr } = await adminSupabase.from('plan_materials').delete().eq('plan_id', planId)
    if (matDelErr) throw new Error(`ล้มเหลวในการลบ plan_materials: ${matDelErr.message}`)

    // 7. ลบรายการแผนผลิต (production_plan_items)
    const { error: itemDelErr } = await adminSupabase.from('production_plan_items').delete().eq('plan_id', planId)
    if (itemDelErr) throw new Error(`ล้มเหลวในการลบ production_plan_items: ${itemDelErr.message}`)

    // 8. ลบใบสั่งผลิต (production_orders)
    const { error: poDelErr } = await adminSupabase.from('production_orders').delete().eq('id', poId)
    if (poDelErr) throw new Error(`ล้มเหลวในการลบ production_orders: ${poDelErr.message}`)

    // 9. ลบแผนผลิตหลัก (production_plans)
    const { error: planDelErr } = await adminSupabase.from('production_plans').delete().eq('id', planId)
    if (planDelErr) throw new Error(`ล้มเหลวในการลบ production_plans: ${planDelErr.message}`)

    // 10. บันทึกประวัติ Activity Log
    const { error: logErr } = await adminSupabase.from('activity_logs').insert({
      user_id: userProfile.id,
      action_type: 'DELETE_PLAN_BY_PO',
      entity_type: 'production_plans',
      entity_id: null,
      detail: `[Admin: ${userProfile.full_name}] ลบแผนการผลิต PO: ${poCode} (ลบ ${jobIds.length} Job Orders, รูป ${deletedPhotosCount} ไฟล์, ปรับลดคลัง ${inventoryAdjustedSummary.length} รายการ)`
    })
    if (logErr) console.error('Error logging deletion activity:', logErr)

    // เคลียร์ Cache ของหน้าต่างๆ ที่ได้รับผลกระทบ
    revalidatePath('/settings')
    revalidatePath('/planner')
    revalidatePath('/production-order')
    revalidatePath('/job-orders')
    revalidatePath('/inventory/fg')
    revalidatePath('/qc')

    return {
      success: true,
      summary: {
        planId,
        poCode,
        deletedJobOrders: jobIds.length,
        deletedConcreteOrders: details.concreteOrdersCount,
        deletedQcInspections: details.qcInspectionsCount,
        deletedDemoldingRecords: details.qcInspectionsCount, // qc_inspections และ demolding_records มักจะคู่กัน
        deletedPhotos: deletedPhotosCount,
        inventoryAdjusted: inventoryAdjustedSummary
      }
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลบแผนผลิต'
    return { success: false, error: message }
  }
}
