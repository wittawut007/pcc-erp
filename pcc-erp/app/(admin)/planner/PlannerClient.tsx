'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { clearOldPlanData } from '@/app/actions/planner'
import toast from 'react-hot-toast'

interface Product {
  id: string
  code: string
  name: string
  category: string
  size: string
  concrete_per_unit: number
  unit: string
  bom_code: string | null
  wip_code: string | null
  length: number | null
  wire_per_unit: number
  mesh_per_unit: number
  rebar_per_unit: number
}

interface RawMaterial {
  id: string
  material_code: string | null
  name: string
  qty_on_hand: number
  unit: string
  min_stock: number
  weight_per_meter: number | null
  category: string
}

interface WipItem {
  product_id: string
  qty_on_hand: number
}

interface PlanItem {
  id?: string
  productId: string
  productCode: string
  productName: string
  size?: string
  category: string
  bed: string
  qty: number
  unit?: string
  concrete: number
  wire: number
  mesh: number
  rebar: number
}

interface Props {
  products: Product[]
  editingPlan: any          // plan being viewed/edited (null = new plan)
  recentPlans: any[]        // list of recent plans for the sidebar
  rawMaterials: RawMaterial[]
  wipInventory?: WipItem[]
  today: string
  selectedDate: string
  workerToken?: string
}

const beds = ['1', '2', '3', '4']

const CATEGORIES = [
  'A13 แผ่นพื้นตัน',
  'A30 ผนังรั้วสำเร็จรูป',
  'A35 รั้วสำเร็จรูป',
  'A36 เสา คาน บันได',
  'A41 เสาเข็ม',
  'A42 กำแพงกันดิน',
]

export default function PlannerClient({ products, editingPlan, recentPlans, rawMaterials, wipInventory = [], today, selectedDate, workerToken = '' }: Props) {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()
  const supabaseRouter = useRouter()

  // Date picker state — starts from selectedDate from URL
  const [planDate, setPlanDate] = useState(selectedDate)

  // Select Cascades
  const [selCat, setSelCat] = useState('')
  const [selName, setSelName] = useState('')
  const [selSize, setSelSize] = useState('')
  const [selCode, setSelCode] = useState('')

  const [selectedBed, setSelectedBed] = useState('1')
  const [qty, setQty] = useState(1)
  const [planItems, setPlanItems] = useState<PlanItem[]>(
    editingPlan?.items?.map((item: any) => {
      const p = item.product || {};
      const wireVal = p.wire_per_unit || p.length || 0;
      return {
        id: item.id,
        productId: item.product_id,
        productCode: p.code ?? '',
        productName: p.name ?? '',
        size: p.size ?? '',
        category: p.category ?? '',
        unit: p.unit ?? 'ชิ้น',
        bed: item.bed,
        qty: item.qty_target,
        concrete: (p.concrete_per_unit ?? 0) * item.qty_target,
        wire: wireVal * item.qty_target,
        mesh: (p.mesh_per_unit ?? 0) * item.qty_target,
        rebar: (p.rebar_per_unit ?? 0) * item.qty_target,
      }
    }) ?? []
  )

  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Derived cascade options
  const cats = CATEGORIES
  
  const names = useMemo(() => {
    const prefix = selCat ? selCat.split(' ')[0] : '';
    return Array.from(new Set(products.filter(p => !prefix || p.category.startsWith(prefix)).map(p => p.name)))
  }, [products, selCat])
  
  const sizes = useMemo(() => {
    const prefix = selCat ? selCat.split(' ')[0] : '';
    const sizeList = Array.from(new Set(products.filter(p => (!prefix || p.category.startsWith(prefix)) && (!selName || p.name === selName)).map(p => p.size || '-')))
    
    return sizeList.sort((a, b) => {
      if (a === '-' && b !== '-') return 1;
      if (b === '-' && a !== '-') return -1;
      
      const parseValue = (val: string) => {
        const parts = val.toLowerCase().split('x');
        if (parts.length > 1) {
           const numStr = parts[parts.length - 1].replace(/[^0-9.]/g, '');
           const num = parseFloat(numStr);
           return isNaN(num) ? Infinity : num;
        }
        const numStr = val.replace(/[^0-9.]/g, '');
        const num = parseFloat(numStr);
        return isNaN(num) ? Infinity : num;
      };

      const valA = parseValue(a);
      const valB = parseValue(b);

      if (valA !== Infinity || valB !== Infinity) {
         if (valA !== valB) return valA - valB;
      }
      
      return a.localeCompare(b);
    })
  }, [products, selCat, selName])
  
  const codes = useMemo(() => {
    const prefix = selCat ? selCat.split(' ')[0] : '';
    return products.filter(p => 
      (!prefix || p.category.startsWith(prefix)) && 
      (!selName || p.name === selName) && 
      (!selSize || (p.size || '-') === selSize)
    )
  }, [products, selCat, selName, selSize])

  // Auto-select unique options to save time
  useEffect(() => {
    if (selCat) {
      // 1. Auto-select Name if unique
      if (!selName && names.length === 1) {
        setSelName(names[0]);
      }
      
      // 2. Auto-select Size if Name is set (manually or auto) and Size is unique
      if (selName && !selSize && sizes.length === 1) {
        setSelSize(sizes[0]);
      }
      
      // 3. Auto-select Code if Size is set (manually or auto) and Code is unique
      if (selSize && !selCode && codes.length === 1) {
        setSelCode(codes[0].code);
      }
    }
  }, [selCat, selName, selSize, names, sizes, codes, selCode])

  const selectedProduct = products.find(p => p.code === selCode)

  const actOnCat = (val: string) => { setSelCat(val); setSelName(''); setSelSize(''); setSelCode(''); }
  const actOnName = (val: string) => { setSelName(val); setSelSize(''); setSelCode(''); }
  const actOnSize = (val: string) => { setSelSize(val); setSelCode(''); }
  
  const totalConcrete = planItems.reduce((s, i) => s + i.concrete, 0)
  const totalWire = planItems.reduce((s, i) => s + i.wire, 0)
  const totalMesh = planItems.reduce((s, i) => s + i.mesh, 0)
  const totalRebar = planItems.reduce((s, i) => s + i.rebar, 0)
  const totalQty = planItems.reduce((s, i) => s + i.qty, 0)

  const handleAddProduct = () => {
    if (!selectedProduct) return
    const wireVal = selectedProduct.wire_per_unit || selectedProduct.length || 0;
    const existing = planItems.findIndex(i => i.productId === selectedProduct.id && i.bed === selectedBed)
    if (existing >= 0) {
      const updated = [...planItems]
      updated[existing].qty += qty
      updated[existing].concrete = updated[existing].qty * selectedProduct.concrete_per_unit
      updated[existing].wire = updated[existing].qty * wireVal
      updated[existing].mesh = updated[existing].qty * selectedProduct.mesh_per_unit
      updated[existing].rebar = updated[existing].qty * selectedProduct.rebar_per_unit
      setPlanItems(updated)
    } else {
      setPlanItems([...planItems, {
        productId: selectedProduct.id,
        productCode: selectedProduct.code,
        productName: selectedProduct.name,
        size: selectedProduct.size,
        unit: selectedProduct.unit,
        category: selectedProduct.category,
        bed: selectedBed,
        qty,
        concrete: qty * selectedProduct.concrete_per_unit,
        wire: qty * wireVal,
        mesh: qty * selectedProduct.mesh_per_unit,
        rebar: qty * selectedProduct.rebar_per_unit,
      }])
    }
    setQty(1)
    // reset product selector but keep category
    setSelName(''); setSelSize(''); setSelCode('');
  }

  const handleRemove = (idx: number) => {
    setPlanItems(planItems.filter((_, i) => i !== idx))
  }

  const savePlanData = async (status: 'draft' | 'confirmed') => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    let plan: any

    if (editingPlan?.id) {
      // UPDATE existing plan
      const { data: updated, error: planError } = await supabase
        .from('production_plans')
        .update({
          status,
          total_qty: totalQty,
          total_concrete: totalConcrete,
        })
        .eq('id', editingPlan.id)
        .select()
        .single()
      if (planError) throw planError
      plan = updated

      // Clear old items
      await clearOldPlanData(plan.id)
    } else {
      // INSERT new plan (no upsert — allow multiple per day)
      const { data: inserted, error: planError } = await supabase
        .from('production_plans')
        .insert({
          plan_date: planDate,
          created_by: user.id,
          status,
          total_qty: totalQty,
          total_concrete: totalConcrete,
        })
        .select()
        .single()
      if (planError) throw planError
      plan = inserted
    }

    let createdItems: any[] = []
    if (planItems.length > 0) {
      const { data: items, error: itemsError } = await supabase.from('production_plan_items').insert(
        planItems.map(item => ({
          plan_id: plan.id,
          product_id: item.productId,
          bed: item.bed,
          qty_target: item.qty,
          status: 'pending',
        }))
      ).select()
      if (itemsError) throw itemsError
      createdItems = items || []
    }

    const materialReqs: Record<string, number> = {}

    // ค้นหา fallback โดยใช้ category และ name
    const fallbackWire = rawMaterials.find(r => r.category === 'ลวด' || r.name.toLowerCase().includes('ลวด') || r.name.toLowerCase().includes('pc wire'))
    const fallbackMesh = rawMaterials.find(r => r.category === 'เมช' || r.name.includes('เมช') || r.category === 'Mesh')
    const fallbackRebar = rawMaterials.find(r => r.category === 'เหล็กเส้น' || r.name.includes('เหล็กเส้น'))

    planItems.forEach(item => {
      const product = products.find(p => p.id === item.productId)
      if (!product) return

      // Wire
      const wireNeeded = (product.wire_per_unit || product.length || 0) * item.qty
      if (wireNeeded > 0) {
        const specificWire = rawMaterials.find(r => r.name === product.bom_code)
        const wireId = specificWire?.id || fallbackWire?.id
        if (wireId) materialReqs[wireId] = (materialReqs[wireId] || 0) + wireNeeded
      }

      // Mesh
      const meshNeeded = (product.mesh_per_unit || 0) * item.qty
      if (meshNeeded > 0) {
        const specificMesh = rawMaterials.find(r => r.name === product.bom_code)
        const meshId = specificMesh?.id || fallbackMesh?.id
        if (meshId) materialReqs[meshId] = (materialReqs[meshId] || 0) + meshNeeded
      }

      // Rebar
      const rebarNeeded = (product.rebar_per_unit || 0) * item.qty
      if (rebarNeeded > 0) {
        const specificRebar = rawMaterials.find(r => r.name === product.bom_code)
        const rebarId = specificRebar?.id || fallbackRebar?.id
        if (rebarId) materialReqs[rebarId] = (materialReqs[rebarId] || 0) + rebarNeeded
      }
    })

    const pmPayloads = Object.entries(materialReqs).map(([rmId, qty]) => ({
      plan_id: plan.id,
      raw_material_id: rmId,
      qty_required: qty,
      status: 'pending'
    }))

    if (pmPayloads.length > 0) {
      const { error: pmError } = await supabase.from('plan_materials').insert(pmPayloads)
      if (pmError) throw new Error('plan_materials error: ' + pmError.message)
    }

    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action_type: `บันทึกแผนการผลิต (${status})`,
      entity_type: 'production_plan',
      entity_id: plan.id,
      detail: `วันที่ ${today} รวม ${totalQty} ชิ้น คอนกรีต ${totalConcrete.toFixed(2)} ม.³`,
    })

    return { plan, items: createdItems }
  }

  const handleSaveDraft = async () => {
    if (planItems.length === 0) {
      toast.error('กรุณาเพิ่มรายการสินค้าลงแผนก่อน')
      return
    }
    setSaving(true)
    try {
      const { plan } = await savePlanData('draft')
      toast.success('บันทึกแบบร่างสำเร็จ!')
      supabaseRouter.push(`/production-order/${plan.id}`)
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmPlan = async () => {
    if (planItems.length === 0) {
      toast.error('กรุณาเพิ่มรายการสินค้าลงแผนก่อน')
      return
    }
    setConfirming(true)
    try {
      const { plan, items } = await savePlanData('confirmed')

      const { data: { user } } = await supabase.auth.getUser()

      // Check if order already exists for this plan
      let finalOrderId;
      const { data: existing } = await supabase.from('production_orders').select('id').eq('plan_id', plan.id).single();

      if (existing) {
        finalOrderId = existing.id;
      } else {
        // Generate sequential PO number: count ALL POs for this date
        const datePart = planDate.replace(/-/g, '')
        const { count } = await supabase
          .from('production_orders')
          .select('*', { count: 'exact', head: true })
          .like('order_number', `PO-${datePart}-%`)
        const seq = String((count || 0) + 1).padStart(3, '0')
        const orderNumber = `PO-${datePart}-${seq}`

        const { data: prodOrder, error: prodOrderErr } = await supabase.from('production_orders').insert({
          order_number: orderNumber,
          plan_id: plan.id,
          confirmed_by: user?.id,
          status: 'active'
        }).select().single()

        if (prodOrderErr) throw prodOrderErr
        finalOrderId = prodOrder.id;
      }

      if (items && items.length > 0 && finalOrderId) {
        const { error: orderError } = await supabase.from('job_orders').insert(
          items.map(item => ({
            plan_item_id: item.id,
            bed: item.bed,
            qty_target: item.qty_target,
            status: 'pending',
            order_id: finalOrderId
          }))
        )
        if (orderError && !orderError.message.includes('duplicate')) throw orderError
      }

      toast.success('ยืนยันแผนการผลิตและสร้างคิวงานเทปูนแล้ว!')
      supabaseRouter.push(`/production-order/${plan.id}`)
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setConfirming(false)
    }
  }

  // Start a completely new blank plan
  const handleNewPlan = () => {
    supabaseRouter.push(`/planner?date=${planDate}&new=true`)
  }

  const isPlanConfirmed = editingPlan?.status === 'confirmed'

  // Calculate dynamic WIP requirements
  const wipRequirements = planItems.reduce((acc, item) => {
    const product = products.find(p => p.id === item.productId)
    if (product && product.wip_code) {
      if (!acc[product.wip_code]) {
        const wipProduct = products.find(p => p.code === product.wip_code)
        acc[product.wip_code] = {
          wip_code: product.wip_code,
          name: wipProduct ? `${wipProduct.name} ${wipProduct.size !== '-' ? wipProduct.size : ''}` : `โครง ${product.name}`,
          needed: 0,
          onHand: 0,
        }
        if (wipProduct) {
          const inv = wipInventory.find(w => w.product_id === wipProduct.id)
          acc[product.wip_code].onHand = inv ? inv.qty_on_hand : 0
        }
      }
      acc[product.wip_code].needed += item.qty
    }
    return acc
  }, {} as Record<string, { wip_code: string, name: string, needed: number, onHand: number }>)

  const wipList = Object.values(wipRequirements)
  const isWipShortage = wipList.some(w => w.onHand < w.needed)

  // Group recentPlans by date for the sidebar
  const plansByDate = useMemo(() => {
    const map = new Map<string, any[]>()
    recentPlans.forEach(p => {
      if (!map.has(p.plan_date)) map.set(p.plan_date, [])
      map.get(p.plan_date)!.push(p)
    })
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [recentPlans])

  const formatThDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '24px 32px', background: '#F7F8FA', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>

      {/* FAR LEFT — Recent Plans Sidebar */}
      <div style={{ width: 240, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Date Picker + New Plan */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>วันที่แผน</div>
          <input
            type="date"
            value={planDate}
            onChange={e => {
              setPlanDate(e.target.value)
              supabaseRouter.push(`/planner?date=${e.target.value}`)
            }}
            style={{ width: '100%', height: 36, border: '1px solid #E5E7EB', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', color: '#374151', marginBottom: 10, boxSizing: 'border-box' }}
          />
          <button
            onClick={handleNewPlan}
            style={{ width: '100%', height: 38, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <i className="fas fa-plus" />
            สร้างแผนใหม่
          </button>
        </div>

        {/* Recent Plans List */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', maxHeight: 600, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>แผนล่าสุด (30 วัน)</div>
          {plansByDate.length === 0 && <div style={{ fontSize: 12, color: '#D1D5DB', textAlign: 'center', padding: '16px 0' }}>ยังไม่มีแผน</div>}
          {plansByDate.map(([date, plans]) => (
            <div key={date} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginBottom: 6, textTransform: 'uppercase' }}>{formatThDate(date)}</div>
              {plans.map((p: any) => {
                const po = Array.isArray(p.production_orders) ? p.production_orders[0] : null
                const isActive = editingPlan?.id === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => supabaseRouter.push(`/planner?plan_id=${p.id}`)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, marginBottom: 4,
                      background: isActive ? '#EFF6FF' : '#F9FAFB',
                      border: `1.5px solid ${isActive ? '#2563EB' : '#E5E7EB'}`,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? '#2563EB' : '#374151' }}>
                      {po?.order_number ?? `แผนร่าง`}
                    </div>
                    <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
                      {p.total_qty?.toLocaleString() ?? 0} ชิ้น &middot;{' '}
                      <span style={{
                        color: p.status === 'confirmed' ? '#059669' : '#D97706',
                        fontWeight: 600,
                      }}>
                        {p.status === 'confirmed' ? 'ยืนยันแล้ว' : 'ร่าง'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* LEFT — Product Selector & Plan Table */}
      <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        
        {/* ADD PRODUCT FORM */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div className="flex items-center gap-2 font-bold text-[15px] mb-4 text-gray-800">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">
              <i className="fas fa-plus"></i>
            </div>
            เพิ่มรายการผลิตลงแผน
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>หมวดหมู่</label>
              <select value={selCat} onChange={e => actOnCat(e.target.value)} style={{ width: '100%', height: 38, border: '1px solid #E5E7EB', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#fff', outline: 'none', color: '#374151' }}>
                <option value="">-- เลือกหมวดหมู่ --</option>
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>ชื่อสินค้า</label>
              <select value={selName} onChange={e => actOnName(e.target.value)} disabled={!selCat} style={{ width: '100%', height: 38, border: '1px solid #E5E7EB', borderRadius: 8, padding: '0 10px', fontSize: 13, background: !selCat ? '#F9FAFB' : '#fff', outline: 'none', color: '#374151' }}>
                <option value="">-- เลือกชื่อสินค้า --</option>
                {names.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>ขนาดสินค้า</label>
              <select value={selSize} onChange={e => actOnSize(e.target.value)} disabled={!selName} style={{ width: '100%', height: 38, border: '1px solid #E5E7EB', borderRadius: 8, padding: '0 10px', fontSize: 13, background: !selName ? '#F9FAFB' : '#fff', outline: 'none', color: '#374151' }}>
                <option value="">-- เลือกขนาด --</option>
                {sizes.map(s => <option key={s} value={s}>{s === '-' ? 'ไม่มีขนาด' : s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>รหัสสินค้า</label>
              <select value={selCode} onChange={e => setSelCode(e.target.value)} disabled={!selSize} style={{ width: '100%', height: 38, border: '1px solid #E5E7EB', borderRadius: 8, padding: '0 10px', fontSize: 13, background: !selSize ? '#F9FAFB' : '#fff', outline: 'none', color: '#374151' }}>
                <option value="">-- เลือกรหัสสินค้า --</option>
                {codes.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, alignItems: 'flex-end' }}>
             <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>โรงผลิตเป้าหมาย</label>
                <select value={selectedBed} onChange={e => setSelectedBed(e.target.value)} style={{ width: '100%', height: 38, border: '1px solid #E5E7EB', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#fff', outline: 'none', color: '#374151' }}>
                  {beds.map(b => <option key={b} value={b}>โรงผลิตที่ {b}</option>)}
                </select>
             </div>
             <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>จำนวนเป้าหมาย</label>
                <input type="number" min={1} value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} onFocus={e => e.target.select()} style={{ width: '100%', height: 38, border: '1px solid #E5E7EB', borderRadius: 8, padding: '0 8px', fontSize: 15, fontWeight: 700, textAlign: 'center', color: '#2563EB', outline: 'none', background: '#fff', boxSizing: 'border-box' }} />
             </div>
             <div>
                <button onClick={handleAddProduct} disabled={!selectedProduct} style={{ width: '100%', height: 38, background: !selectedProduct ? '#D1D5DB' : '#2563EB', color: '#fff', fontWeight: 700, border: 'none', borderRadius: 8, fontSize: 13, cursor: !selectedProduct ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'background 0.15s' }}>
                  <i className="fas fa-plus"></i> เพิ่มลงแผน
                </button>
             </div>
          </div>
        </div>

        {/* PLAN TABLE */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 300, overflow: 'hidden' }}>
          <div style={{ padding: '20px 20px 16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: '#fff' }}>
             <div>
               <h3 className="font-bold text-gray-900 text-[15px]">
                 {editingPlan ? `แผนวันที่ ${formatThDate(planDate)}` : `แผนใหม่ — ${formatThDate(planDate)}`}
                 {planItems.length > 0 && <span className="font-normal text-gray-500 ml-1">({isPlanConfirmed ? 'Confirmed' : 'Draft'})</span>}
               </h3>
               <p className="text-xs text-gray-500 mt-0.5">รวมทั้งหมด: <span className="font-bold text-blue-600">{planItems.length}</span> รายการ | <span className="font-bold text-blue-600">{totalQty.toLocaleString()}</span> ชิ้น</p>
             </div>
             <div>
               {editingPlan?.status === 'confirmed' ? (
                 <span className="bg-emerald-100 text-emerald-700 text-[11px] px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5 border border-emerald-200">
                    <i className="fas fa-check-circle"></i> ยืนยันแล้ว
                 </span>
               ) : (
                 <span className="bg-amber-100 text-amber-700 text-[11px] px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5 border border-amber-200">
                    <i className="fas fa-pencil-alt"></i> {editingPlan ? 'กำลังแก้ไข' : 'แผนใหม่'}
                 </span>
               )}
             </div>
          </div>
          
          <div className="overflow-x-auto flex-1">
             <table className="w-full text-sm text-left whitespace-nowrap">
                <thead>
                   <tr style={{ background: '#FAFAFA', borderBottom: '2px solid #E5E7EB' }}>
                      <th style={{ ...thStyle, textAlign: 'center' }}>NO.</th>
                      <th style={thStyle}>โรงผลิต</th>
                      <th style={thStyle}>สินค้า</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>จำนวน</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>คอนกรีต (Q)</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>จัดการ</th>
                   </tr>
                </thead>
                <tbody>
                   {planItems.length === 0 ? (
                     <tr>
                        <td colSpan={6} style={{ padding: '80px 24px', textAlign: 'center', color: '#9CA3AF' }}>
                          <i className="fas fa-clipboard-list" style={{ fontSize: 48, color: '#E5E7EB', display: 'block', marginBottom: 16 }}></i>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>ไม่มีรายการลงแผน</div>
                          <div style={{ fontSize: 12, color: '#D1D5DB', marginTop: 4 }}>กรุณาเพิ่มรายการผลิตข้างต้น</div>
                        </td>
                     </tr>
                   ) : (
                     planItems.map((item, idx) => (
                       <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                          <td style={{ padding: '12px 16px', textAlign: 'center', color: '#9CA3AF', fontWeight: 600, fontSize: 13 }}>{idx + 1}</td>
                          <td style={{ padding: '12px 16px' }}>
                             <span style={{
                               display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                               width: 36, height: 36, borderRadius: 8,
                               background: '#EFF6FF', border: '1px solid #BFDBFE',
                               fontWeight: 800, fontSize: 15, color: '#2563EB',
                             }}>
                               {item.bed}
                             </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                             <div style={{ fontWeight: 700, color: '#111827', fontSize: 13, lineHeight: 1.3 }}>
                               {item.productName} {item.size !== '-' ? item.size : ''}
                             </div>
                             <div style={{ fontSize: 10, color: '#9CA3AF', fontFamily: 'monospace', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                               <span style={{ fontWeight: 600, color: '#6B7280' }}>{item.productCode}</span>
                               <span style={{ color: '#E5E7EB' }}>|</span>
                               <span>{item.category.split(' ')[0]}</span>
                             </div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                             <span style={{ fontWeight: 800, color: '#2563EB', fontSize: 15 }}>{item.qty.toLocaleString()}</span>
                             <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 4 }}>{item.unit || 'ชิ้น'}</span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontFamily: 'monospace', color: '#6B7280', fontSize: 13 }}>
                             {item.concrete.toFixed(2)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                             <button onClick={() => handleRemove(idx)} style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', width: 32, height: 32, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s' }}>
                                <i className="fas fa-trash-alt" style={{ fontSize: 12 }}></i>
                             </button>
                          </td>
                       </tr>
                     ))
                   )}
                </tbody>
             </table>
          </div>
        </div>
      </div>

      {/* RIGHT — BOM & Action */}
      <div style={{ width: 320, minWidth: 300, maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 16 }}>
         
         {/* BOM CARD */}
         <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div className="flex justify-between items-center mb-6">
              <div className="font-bold text-[15px] flex items-center gap-2 text-gray-800">
                 <i className="fas fa-file-excel text-emerald-500"></i>
                 คำนวณวัตถุดิบ (BOM)
              </div>
              <button className="text-[11px] text-blue-600 font-bold flex items-center gap-1 hover:underline">
                 <i className="fas fa-sync-alt"></i> อัปเดต
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-6 pb-4 border-b border-gray-100">ตรวจสอบสต๊อกวัตถุดิบป้องกันของขาดหน้างาน</p>

            <div className="flex flex-col gap-6">
               {/* Main Raw Materials */}
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>คอนกรีตรวม</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', lineHeight: 1 }}>{totalConcrete.toFixed(2)} <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF' }}>คิว</span></div>
                  </div>
                  <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>ลวดรวม</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', lineHeight: 1 }}>{totalWire.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})} <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF' }}>เมตร</span></div>
                  </div>
                  <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>เมชรวม</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', lineHeight: 1 }}>{totalMesh.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})} <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF' }}>ตร.ม.</span></div>
                  </div>
                  <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>เหล็กเส้นรวม</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', lineHeight: 1 }}>{totalRebar.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})} <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF' }}>เมตร</span></div>
                  </div>
               </div>

               {/* WIP structure */}
               <div>
                  <div className="flex justify-between font-bold text-sm mb-2 opacity-90">
                     <span className="text-gray-800">โครงเหล็กพร้อมผลิต (WIP)</span>
                     {wipList.length === 0 ? (
                       <span className="text-[10px] text-gray-400">ไม่มีรายการ WIP</span>
                     ) : isWipShortage ? (
                       <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">ของไม่พอ</span>
                     ) : (
                       <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">สต๊อกพอดี</span>
                     )}
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1 mb-3">
                     <div className={wipList.length === 0 ? "bg-gray-300 h-1 rounded-full" : isWipShortage ? "bg-red-500 h-1 rounded-full" : "bg-emerald-500 h-1 rounded-full"} style={{ width: '100%' }}></div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-[11px] text-gray-500">
                     {wipList.length === 0 && <span className="text-gray-400 italic">เลือกสินค้าเพื่อคำนวณโครงเหล็ก</span>}
                     {wipList.map(wip => (
                       <div key={wip.wip_code} className="flex justify-between border-b border-dashed border-gray-200 pb-1">
                          <span className={wip.onHand < wip.needed ? 'text-red-500 font-semibold' : ''}>{wip.name}</span>
                          <span className={wip.onHand < wip.needed ? 'text-red-500 font-semibold' : ''}>ต้องการ {wip.needed.toLocaleString()} / มี {wip.onHand.toLocaleString()} ชุด</span>
                       </div>
                     ))}
                  </div>
               </div>


            </div>
         </div>

         {/* NEXT STEPS (DARK THEME) */}
         <div style={{ background: '#1C1F26', borderRadius: 12, padding: 24, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', color: '#fff', position: 'relative', overflow: 'hidden', flex: 1 }}>
            
            {/* Watermark Background */}
            <div style={{ position: 'absolute', bottom: -10, right: -10, fontSize: 130, fontWeight: 900, color: 'rgba(255,255,255,0.03)', pointerEvents: 'none', lineHeight: 1, userSelect: 'none' }}>
              PCC
            </div>

            <h3 className="font-bold text-lg mb-3 relative z-10">ขั้นตอนต่อไป</h3>
            <p className="text-sm text-gray-400 mb-6 leading-relaxed">
               เมื่อตรวจสอบแผนและวัตถุดิบเรียบร้อยแล้ว กดยืนยันเพื่อนำแผนขึ้นระบบ และออกใบสั่งผลิดให้หน้างาน
            </p>
            <div className="flex flex-col gap-3 mb-8">
               <div className="flex items-start gap-3">
                  <i className="fas fa-check text-emerald-400 mt-1"></i>
                  <span className="text-[13px] text-gray-300">ระบบจะจองสต๊อก (Reserve) ทันที</span>
               </div>
               <div className="flex items-start gap-3">
                  <i className="fas fa-check text-emerald-400 mt-1"></i>
                  <span className="text-[13px] text-gray-300">สร้าง Job Order {planItems.length} รายการ</span>
               </div>
               <div className="flex items-start gap-3">
                  <i className="fas fa-check text-emerald-400 mt-1"></i>
                  <span className="text-[13px] text-gray-300">สร้าง QR Code สำหรับสแกนหน้าโรงผลิต</span>
               </div>
            </div>

            <div className="flex flex-col gap-3 mt-auto">
               <button
                 onClick={handleSaveDraft}
                 disabled={saving || planItems.length === 0}
                 className="w-full bg-transparent hover:bg-white/8 border border-gray-600 text-gray-200 font-semibold rounded-xl text-[14px] disabled:opacity-40 transition-all flex justify-center items-center gap-2.5"
                 style={{ minHeight: 48, padding: '12px 20px' }}
               >
                  {saving
                    ? <i className="fas fa-spinner fa-spin text-sm"></i>
                    : <i className="fas fa-save text-sm"></i>
                  }
                  <span>บันทึกแบบร่าง</span>
               </button>
               <button
                 onClick={handleConfirmPlan}
                 disabled={confirming || planItems.length === 0}
                 className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-[15px] disabled:opacity-40 transition-all flex justify-center items-center gap-2.5 relative"
                 style={{ minHeight: 52, padding: '14px 20px' }}
               >
                  {confirming
                    ? <i className="fas fa-spinner fa-spin text-base"></i>
                    : (
                      <>
                        <i className="fas fa-check-circle text-base"></i>
                        <span>บันทึก/สร้างใบสั่งผลิต</span>
                        <i className="fas fa-arrow-right absolute right-5 text-blue-200"></i>
                      </>
                    )
                  }
               </button>
            </div>
         </div>
      </div>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '11px 20px',
  textAlign: 'left',
  fontWeight: 700,
  color: '#6B7280',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
}
