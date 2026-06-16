import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  try {
    // 1. ตรวจสอบสิทธิ์ผู้ดูแลระบบ
    const clientSupabase = await createClient()
    const { data: { user } } = await clientSupabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'ไม่พบสิทธิ์การเข้าสู่ระบบ' }, { status: 401 })
    }

    const { data: profile } = await clientSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้' }, { status: 403 })
    }

    // 2. ดึงค่า startDate และ endDate
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'กรุณาระบุวันที่เริ่มต้นและสิ้นสุด' }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // 3. ดึงรายการแผนผลิตทั้งหมดในช่วงเวลา เพื่อหา plan_ids
    const { data: plansData, error: plansError } = await adminSupabase
      .from('production_plans')
      .select('id, plan_date, status, total_concrete, total_qty, created_at')
      .gte('plan_date', startDate)
      .lte('plan_date', endDate)
      .order('plan_date', { ascending: true })

    if (plansError) {
      throw plansError
    }

    const plans = plansData || []
    if (plans.length === 0) {
      return NextResponse.json({
        success: true,
        plans: [],
        planItems: [],
        productionOrders: [],
        jobOrders: [],
        demoldingRecords: [],
        qcInspections: [],
        concreteOrders: [],
        concreteRounds: [],
        fgReceipts: []
      })
    }

    const planIds = plans.map(p => p.id)

    // 4. ดึงข้อมูลตารางที่ฟิลเตอร์ด้วย planIds และข้อมูลที่เกี่ยวข้อง
    const [planItemsRes, productionOrdersRes, jobOrdersRes] = await Promise.all([
      adminSupabase
        .from('production_plan_items')
        .select('*, product:products(code, name, unit)')
        .in('plan_id', planIds),
      adminSupabase
        .from('production_orders')
        .select('*, confirmed_by_profile:profiles!production_orders_confirmed_by_fkey(full_name)')
        .in('plan_id', planIds),
      adminSupabase
        .from('job_orders')
        .select('*, plan_item:production_plan_items!inner(plan_id, product:products(code, name, unit)), worker:profiles(full_name)')
        .in('plan_item.plan_id', planIds)
    ])

    if (planItemsRes.error) throw planItemsRes.error
    if (productionOrdersRes.error) throw productionOrdersRes.error
    if (jobOrdersRes.error) throw jobOrdersRes.error

    const planItems = planItemsRes.data || []
    const productionOrders = productionOrdersRes.data || []
    const jobOrders = jobOrdersRes.data || []

    if (jobOrders.length === 0) {
      return NextResponse.json({
        success: true,
        plans,
        planItems,
        productionOrders,
        jobOrders: [],
        demoldingRecords: [],
        qcInspections: [],
        concreteOrders: [],
        concreteRounds: [],
        fgReceipts: []
      })
    }

    const jobOrderIds = jobOrders.map(j => j.id)

    // 5. ดึงข้อมูลตารางลูกอื่นๆ ที่เชื่อมต่อกับ jobOrderIds
    const [demoldingRes, qcRes, concreteOrdersRes, fgReceiptsRes] = await Promise.all([
      adminSupabase
        .from('demolding_records')
        .select('*, worker:profiles(full_name)')
        .in('job_order_id', jobOrderIds),
      adminSupabase
        .from('qc_inspections')
        .select('*, qc_profile:profiles!qc_inspections_qc_id_fkey(full_name)')
        .in('job_order_id', jobOrderIds),
      adminSupabase
        .from('concrete_orders')
        .select('*, requested_by_profile:profiles!concrete_orders_requested_by_fkey(full_name), supplied_by_profile:profiles!concrete_orders_supplied_by_fkey(full_name)')
        .in('job_order_id', jobOrderIds),
      adminSupabase
        .from('fg_receipts')
        .select('*, product:products(code, name), warehouse_profile:profiles!fg_receipts_warehouse_id_fkey(full_name)')
        .in('job_order_id', jobOrderIds)
    ])

    if (demoldingRes.error) throw demoldingRes.error
    if (qcRes.error) throw qcRes.error
    if (concreteOrdersRes.error) throw concreteOrdersRes.error
    if (fgReceiptsRes.error) throw fgReceiptsRes.error

    const demoldingRecords = demoldingRes.data || []
    const qcInspections = qcRes.data || []
    const concreteOrders = concreteOrdersRes.data || []
    const fgReceipts = fgReceiptsRes.data || []

    // 6. ดึงข้อมูล concrete_rounds
    let concreteRounds: any[] = []
    if (concreteOrders.length > 0) {
      const concreteOrderIds = concreteOrders.map(co => co.id)
      const { data: roundsData, error: roundsError } = await adminSupabase
        .from('concrete_rounds')
        .select('*')
        .in('concrete_order_id', concreteOrderIds)
      
      if (roundsError) throw roundsError
      concreteRounds = roundsData || []
    }

    return NextResponse.json({
      success: true,
      plans,
      planItems,
      productionOrders,
      jobOrders: jobOrders.map((j: any) => ({
        ...j,
        plan_id: j.plan_item?.plan_id,
        product_code: j.plan_item?.product?.code,
        product_name: j.plan_item?.product?.name,
        product_unit: j.plan_item?.product?.unit
      })),
      demoldingRecords,
      qcInspections,
      concreteOrders,
      concreteRounds,
      fgReceipts
    })

  } catch (err: any) {
    console.error('Export backup data error:', err)
    return NextResponse.json({ error: err.message || 'เกิดข้อผิดพลาดภายในระบบ' }, { status: 500 })
  }
}
