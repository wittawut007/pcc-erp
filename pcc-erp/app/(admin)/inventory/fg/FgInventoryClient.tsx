'use client'

import React, { useState, useMemo, useEffect } from 'react'
import toast from 'react-hot-toast'
import { saveErpReference, createManualFgOrder, getManualFgFormData } from '@/app/actions/fg'
import FgDocumentModal from '@/components/shared/FgDocumentModal'
import FilterBar, { isDateInRange } from '@/components/shared/FilterBar'

interface ProductionOrder {
  id: string
  order_number: string
  status: string
  erp_reference: string | null
  created_at: string
  plan: { plan_date: string }[] | null
  job_orders: any[]
}

interface Product {
  id: string
  code: string
  name: string
  category: string
  size: string
  unit: string
  wire_per_unit?: number
  mesh_per_unit?: number
  rebar_per_unit?: number
  concrete_per_unit?: number
  length?: number
  bom_code?: string
}

interface RawMaterial {
  id: string
  name: string
  category: string
  unit: string
  qty_on_hand: number
  weight_per_meter: number | null
  material_code: string | null
}

interface ProductBomItem {
  product_id: string
  raw_material_id: string
  qty_per_unit: number
}

interface MaterialDeductionItem {
  rawMaterialId: string
  name: string
  code: string
  unit: string
  currentStock: number
  calculatedQty: number
  deductQty: number
}

const CATEGORIES = [
  'A13 แผ่นพื้น',
  'A30 ผนังรั้วสำเร็จรูป',
  'A31 ผนังสำเร็จรูป/ผนังกันตก/FIN',
  'A35 รั้วสำเร็จรูป',
  'A36 เสา คาน บันได',
  'A41 เสาเข็ม',
  'A42 กำแพงกันดิน',
  'A82 เสารั้ว',
]

function getOrderDisplayDate(order: ProductionOrder): string {
  const planObj: any = order.plan
  let dateStr = ''

  if (Array.isArray(planObj) && planObj.length > 0) {
    dateStr = planObj[0]?.plan_date
  } else if (planObj?.plan_date) {
    dateStr = planObj.plan_date
  }

  if (!dateStr && order.job_orders && order.job_orders.length > 0) {
    const firstJobPlan = order.job_orders[0]?.plan_item?.plan?.plan_date
    if (firstJobPlan) dateStr = firstJobPlan
  }

  if (!dateStr) dateStr = order.created_at

  if (!dateStr) return '-'

  const cleanDate = dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`
  const d = new Date(cleanDate)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function FgInventoryClient({ 
  productionOrders: initialOrders,
  products
}: { 
  productionOrders: ProductionOrder[]
  products: Product[]
}) {
  const [orders, setOrders] = useState<ProductionOrder[]>(initialOrders)

  // Sync state when initialOrders prop updates from server revalidation
  useEffect(() => {
    setOrders(initialOrders)
  }, [initialOrders])
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' })
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set())

  const toggleExpand = (orderId: string) => {
    setExpandedOrderIds(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) {
        next.delete(orderId)
      } else {
        next.add(orderId)
      }
      return next
    })
  }
  const [manageModal, setManageModal] = useState<ProductionOrder | null>(null)
  const [erpRef, setErpRef] = useState('')
  const [saving, setSaving] = useState(false)
  const [printModalOrderId, setPrintModalOrderId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue')

  // New state variables for manual addition modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [selCat, setSelCat] = useState('')
  const [selName, setSelName] = useState('')
  const [selSize, setSelSize] = useState('')
  const [selCode, setSelCode] = useState('')
  const [qty, setQty] = useState(1)
  const [selectedBed, setSelectedBed] = useState('1')
  const [notes, setNotes] = useState('')
  const [addingOrder, setAddingOrder] = useState(false)
  const [addedItems, setAddedItems] = useState<{
    productId: string
    productCode: string
    productName: string
    productSize: string
    bed: string
    qty: number
  }[]>([])

  // Raw materials and BOM state
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [bomItems, setBomItems] = useState<ProductBomItem[]>([])
  const [materialDeductions, setMaterialDeductions] = useState<MaterialDeductionItem[]>([])

  // Fetch Raw materials & BOM items on load
  useEffect(() => {
    getManualFgFormData().then(data => {
      setRawMaterials(data.rawMaterials)
      setBomItems(data.bomItems)
    }).catch(err => {
      console.error('Failed to load raw materials / BOM for manual FG', err)
    })
  }, [])

  // Calculate raw material deductions automatically whenever addedItems changes
  useEffect(() => {
    if (addedItems.length === 0) {
      setMaterialDeductions([])
      return
    }

    const materialReqs: Record<string, number> = {}

    const fallbackWire = rawMaterials.find(r => r.category === 'ลวด' || r.name.toLowerCase().includes('ลวด') || r.name.toLowerCase().includes('pc wire'))
    const fallbackMesh = rawMaterials.find(r => r.category === 'เมช' || r.name.includes('เมช') || r.category === 'Mesh')
    const fallbackRebar = rawMaterials.find(r => r.category === 'เหล็กเส้น' || r.name.includes('เหล็กเส้น'))

    addedItems.forEach(item => {
      const product = products.find(p => p.id === item.productId)
      if (!product) return

      const boms = bomItems.filter(b => b.product_id === item.productId)
      if (boms.length > 0) {
        boms.forEach(bom => {
          const rmId = bom.raw_material_id
          const needed = (Number(bom.qty_per_unit) || 0) * item.qty
          if (needed > 0 && rmId) {
            materialReqs[rmId] = (materialReqs[rmId] || 0) + needed
          }
        })
      } else {
        const wireNeeded = (product.wire_per_unit || product.length || 0) * item.qty
        if (wireNeeded > 0) {
          const specificWire = rawMaterials.find(r => r.name === product.bom_code)
          const wireId = specificWire?.id || fallbackWire?.id
          if (wireId) materialReqs[wireId] = (materialReqs[wireId] || 0) + wireNeeded
        }

        const meshNeeded = (product.mesh_per_unit || 0) * item.qty
        if (meshNeeded > 0) {
          const specificMesh = rawMaterials.find(r => r.name === product.bom_code)
          const meshId = specificMesh?.id || fallbackMesh?.id
          if (meshId) materialReqs[meshId] = (materialReqs[meshId] || 0) + meshNeeded
        }

        const rebarNeeded = (product.rebar_per_unit || 0) * item.qty
        if (rebarNeeded > 0) {
          const specificRebar = rawMaterials.find(r => r.name === product.bom_code)
          const rebarId = specificRebar?.id || fallbackRebar?.id
          if (rebarId) materialReqs[rebarId] = (materialReqs[rebarId] || 0) + rebarNeeded
        }
      }
    })

    setMaterialDeductions(prev => {
      const prevMap = new Map(prev.map(p => [p.rawMaterialId, p.deductQty]))
      
      return Object.entries(materialReqs).map(([rmId, calculatedQty]) => {
        const rm = rawMaterials.find(r => r.id === rmId)
        const userOverriddenDeduct = prevMap.get(rmId)
        const calcVal = Number(calculatedQty.toFixed(2))
        return {
          rawMaterialId: rmId,
          name: rm?.name || 'ไม่ระบุชื่อวัตถุดิบ',
          code: rm?.material_code || '-',
          unit: rm?.unit || 'หน่วย',
          currentStock: rm?.qty_on_hand ?? 0,
          calculatedQty: calcVal,
          deductQty: userOverriddenDeduct !== undefined ? userOverriddenDeduct : calcVal
        }
      })
    })
  }, [addedItems, bomItems, rawMaterials, products])

  // Cascades
  const cats = CATEGORIES
  
  const names = useMemo(() => {
    const prefix = selCat ? selCat.split(' ')[0] : '';
    return Array.from(new Set(products.filter(p => !prefix || p.category.startsWith(prefix)).map(p => p.name)))
  }, [products, selCat])
  
  const sizes = useMemo(() => {
    const prefix = selCat ? selCat.split(' ')[0] : '';
    const sizeList = Array.from(new Set(products.filter(p => (!prefix || p.category.startsWith(prefix)) && (!selName || p.name === selName)).map(p => p.size || '-')))
    return sizeList.sort()
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
      if (!selName && names.length === 1) {
        setSelName(names[0]);
      }
      if (selName && !selSize && sizes.length === 1) {
        setSelSize(sizes[0]);
      }
      if (selSize && !selCode && codes.length === 1) {
        setSelCode(codes[0].code);
      }
    }
  }, [selCat, selName, selSize, names, sizes, codes, selCode])

  const selectedProduct = products.find(p => p.code === selCode)

  const actOnCat = (val: string) => { setSelCat(val); setSelName(''); setSelSize(''); setSelCode(''); }
  const actOnName = (val: string) => { setSelName(val); setSelSize(''); setSelCode(''); }
  const actOnSize = (val: string) => { setSelSize(val); setSelCode(''); }

  const handleAddItem = () => {
    if (!selectedProduct) {
      toast.error('กรุณาเลือกสินค้าก่อนเพิ่ม')
      return
    }
    if (qty <= 0) {
      toast.error('กรุณาระบุจำนวนมากกว่า 0')
      return
    }
    // Check if the same product on the same bed already exists in the list, if so combine quantities
    const existingIdx = addedItems.findIndex(
      item => item.productId === selectedProduct.id && item.bed === selectedBed
    )
    if (existingIdx > -1) {
      setAddedItems(prev => prev.map((item, idx) => idx === existingIdx ? { ...item, qty: item.qty + qty } : item))
    } else {
      setAddedItems(prev => [
        ...prev,
        {
          productId: selectedProduct.id,
          productCode: selectedProduct.code,
          productName: selectedProduct.name,
          productSize: selectedProduct.size || '-',
          bed: selectedBed,
          qty: qty
        }
      ])
    }
    toast.success(`เพิ่ม ${selectedProduct.name} ลงในรายการสำเร็จ`)
    setQty(1)
  }

  const handleRemoveItem = (index: number) => {
    setAddedItems(prev => prev.filter((_, i) => i !== index))
  }

  const handleSaveManualFg = async () => {
    if (addedItems.length === 0) {
      toast.error('กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ')
      return
    }

    setAddingOrder(true)
    try {
      const payloadItems = addedItems.map(item => ({
        productId: item.productId,
        qty: item.qty,
        bed: item.bed
      }))

      const deductionsPayload = materialDeductions.map(m => ({
        rawMaterialId: m.rawMaterialId,
        qtyToDeduct: m.deductQty
      }))

      const newOrder = await createManualFgOrder(payloadItems, notes, deductionsPayload)
      if (!newOrder) {
        throw new Error('ไม่สามารถดึงข้อมูลใบสั่งผลิตที่สร้างขึ้นใหม่ได้')
      }
      toast.success(`เพิ่มสินค้าและหักสต็อกสำเร็จ! เลขที่ใบสั่งสินค้า: ${newOrder.order_number}`)
      
      // Update local state
      setOrders(prev => [newOrder as ProductionOrder, ...prev])
      
      // Reset form & close modal
      setSelCat('')
      setSelName('')
      setSelSize('')
      setSelCode('')
      setQty(1)
      setNotes('')
      setAddedItems([])
      setMaterialDeductions([])
      setShowAddModal(false)
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setAddingOrder(false)
    }
  }

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary)',
    border: 'none',
    transition: 'all 0.15s',
  })

  // Filter orders (only showing ones that have at least some jobs)
  const isOrderMatching = (o: ProductionOrder) => {
    const q = search.trim().toLowerCase()
    const matchSearch = !q ||
      o.order_number.toLowerCase().includes(q) ||
      (o.erp_reference || '').toLowerCase().includes(q) ||
      (o.job_orders || []).some(j =>
        (j.plan_item?.product?.name || '').toLowerCase().includes(q) ||
        (j.plan_item?.product?.code || '').toLowerCase().includes(q)
      )
    const planObj: any = o.plan
    const dateStr = (Array.isArray(planObj) ? planObj[0]?.plan_date : planObj?.plan_date) || o.created_at || ''
    const matchDate = isDateInRange(dateStr, dateRange)
    return matchSearch && matchDate
  }

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const matchTab = activeTab === 'queue' ? o.status !== 'erp_synced' : o.status === 'erp_synced'
      return isOrderMatching(o) && o.job_orders && o.job_orders.length > 0 && matchTab
    })
  }, [orders, search, activeTab, dateRange])

  // Search-filtered KPI counts
  const totalAllOrders = useMemo(() => {
    return orders.filter(o => 
      o.job_orders && 
      o.job_orders.length > 0 &&
      isOrderMatching(o)
    ).length
  }, [orders, search, dateRange])

  const totalPendingOrders = useMemo(() => {
    return orders.filter(o => 
      o.status !== 'erp_synced' && 
      o.job_orders && 
      o.job_orders.length > 0 &&
      isOrderMatching(o)
    ).length
  }, [orders, search, dateRange])

  const totalCompletedOrders = useMemo(() => {
    return orders.filter(o => 
      o.status === 'erp_synced' && 
      o.job_orders && 
      o.job_orders.length > 0 &&
      isOrderMatching(o)
    ).length
  }, [orders, search, dateRange])

  // Global counts for tab badges
  const globalPendingCount = useMemo(() => {
    return orders.filter(o => o.status !== 'erp_synced' && o.job_orders && o.job_orders.length > 0).length
  }, [orders])

  const globalCompletedCount = useMemo(() => {
    return orders.filter(o => o.status === 'erp_synced' && o.job_orders && o.job_orders.length > 0).length
  }, [orders])

  const handleManage = (order: ProductionOrder) => {
    setManageModal(order)
    setErpRef(order.erp_reference || '')
  }

  const handleSaveErp = async () => {
    if (!manageModal) return
    if (!erpRef.trim()) {
      toast.error('กรุณาระบุหมายเลขอ้างอิงระบบกลาง')
      return
    }

    setSaving(true)
    try {
      await saveErpReference(manageModal.id, erpRef)
      toast.success('บันทึกหมายเลขอ้างอิงและยืนยันการผลิตสำเร็จ')
      
      // Update local state
      setOrders(prev => prev.map(o => o.id === manageModal.id ? {
        ...o,
        erp_reference: erpRef,
        status: 'erp_synced'
      } : o))
      
      setManageModal(null)
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'ใบสั่งผลิตทั้งหมด', value: totalAllOrders, icon: 'fa-file-invoice', color: 'var(--accent)' },
          { label: 'รอการยืนยัน', value: totalPendingOrders, icon: 'fa-clock', color: 'var(--amber)' },
          { label: 'บันทึกเข้าระบบแล้ว', value: totalCompletedOrders, icon: 'fa-check-circle', color: 'var(--green)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: `${s.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className={`fas ${s.icon}`} style={{ color: s.color, fontSize: 20 }}></i>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters (Search & Date & Action) */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาเลขที่ใบสั่งผลิต, รหัสสินค้า, หรืออ้างอิง ERP..."
        countLabel={`${filtered.length} ใบสั่งผลิต`}
        dateLabel="วันที่สั่งผลิต:"
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        style={{ marginBottom: 16 }}
        actionButton={
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '10px 18px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 36,
              whiteSpace: 'nowrap',
            }}
          >
            <i className="fas fa-plus" /> ปรับขนาดสินค้าเสีย / เพิ่มสินค้าสำเร็จรูปเอง
          </button>
        }
      />

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {/* Tabs */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg)' }}>
          <button 
            type="button"
            style={TAB_STYLE(activeTab === 'queue')} 
            onClick={() => setActiveTab('queue')}
          >
            <i className="fas fa-clock" style={{ marginRight: 6 }} />
            คิวงานรออยู่ {globalPendingCount > 0 && (
              <span style={{ background: 'var(--amber)', color: '#fff', borderRadius: 50, padding: '1px 7px', fontSize: 11, marginLeft: 4 }}>
                {globalPendingCount}
              </span>
            )}
          </button>
          <button 
            type="button"
            style={TAB_STYLE(activeTab === 'history')} 
            onClick={() => setActiveTab('history')}
          >
            <i className="fas fa-history" style={{ marginRight: 6 }} />
            ย้อนหลัง {globalCompletedCount > 0 && (
              <span style={{ background: 'var(--green)', color: '#fff', borderRadius: 50, padding: '1px 7px', fontSize: 11, marginLeft: 4 }}>
                {globalCompletedCount}
              </span>
            )}
          </button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['', 'วันที่', 'ใบสั่งผลิต', 'จำนวนรายการ (ชิ้น)', 'สถานะ', 'หมายเลขอ้างอิง', 'เอกสาร', 'จัดการ'].map((h, i) => (
                <th key={i} style={{ padding: '10px 14px', textAlign: i >= 6 ? 'center' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(order => {
              const isExpanded = expandedOrderIds.has(order.id)
              const totalTarget = order.job_orders.reduce((sum, j) => sum + (j.qty_target || 0), 0)
              
              // Count demolded jobs
              const isFullyDemolded = order.job_orders.every(j => j.status === 'demolded' || j.status === 'qc_passed')
              
              let statusText = 'กำลังดำเนินการ'
              let statusColor = 'var(--amber)'
              let statusBg = 'var(--amber-light)'
              
              if (order.status === 'erp_synced') {
                statusText = 'บันทึกเข้าระบบแล้ว'
                statusColor = 'var(--green)'
                statusBg = 'var(--green-light)'
              } else if (isFullyDemolded) {
                statusText = 'QC ตรวจสอบแล้ว'
                statusColor = 'var(--accent)'
                statusBg = 'var(--accent-light)'
              }

              const totalGoodAll = order.job_orders.reduce((sum, j) => {
                const recs = j.demolding_records || []
                if (recs.length > 0) return sum + recs.reduce((s: number, r: any) => s + (r.qty_good || 0), 0)
                if (j.status === 'demolded' || j.status === 'qc_passed' || j.status === 'erp_synced' || order.status === 'erp_synced') {
                  return sum + (j.qty_cast || j.qty_target || 0)
                }
                return sum
              }, 0)

              const totalDefectAll = order.job_orders.reduce((sum, j) => {
                const recs = j.demolding_records || []
                if (recs.length > 0) return sum + recs.reduce((s: number, r: any) => s + (r.qty_defect || 0), 0)
                return sum
              }, 0)

              return (
                <React.Fragment key={order.id}>
                  <tr 
                    onClick={() => toggleExpand(order.id)}
                    className="hover:bg-[var(--bg)] transition-colors"
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ padding: '10px 8px 10px 14px', borderBottom: '1px solid var(--border)', textAlign: 'center', width: 36 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpand(order.id)
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: isExpanded ? 'var(--accent)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: 11,
                          width: 24,
                          height: 24,
                          borderRadius: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title={isExpanded ? 'ย่อรายละเอียด' : 'ขยายดูรายละเอียดสินค้า'}
                      >
                        <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'}`} />
                      </button>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                      {getOrderDisplayDate(order)}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text)' }}>
                      {order.order_number}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      {totalTarget} ชิ้น ({order.job_orders.length} รายการ)
                      {totalGoodAll > 0 && (
                        <span style={{ fontSize: 11, marginLeft: 6, color: '#16A34A', fontWeight: 600 }}>
                          (ดี {totalGoodAll}{totalDefectAll > 0 ? `, เสีย ${totalDefectAll}` : ''})
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, fontWeight: 600, background: statusBg, color: statusColor }}>
                        {statusText}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                      {order.erp_reference ? (
                        <span style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: 4, border: '1px solid #E2E8F0' }}>{order.erp_reference}</span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          setPrintModalOrderId(order.id)
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                        className="hover:bg-slate-100 transition-colors"
                      >
                        <i className="fas fa-print" style={{ color: 'var(--accent)' }}></i> พิมพ์เอกสาร
                      </button>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                      {statusText === 'QC ตรวจสอบแล้ว' ? (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation()
                            handleManage(order)
                          }}
                          style={{ padding: '6px 12px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                        >
                          <i className="fas fa-tasks" style={{ marginRight: 6 }}></i> จัดการ
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 500 }}>-</span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded Sub-row details */}
                  {isExpanded && (
                    <tr key={`${order.id}-details`} style={{ background: '#F8FAFC' }}>
                      <td colSpan={8} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.03)' }}>
                        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
                              <i className="fas fa-boxes" style={{ color: 'var(--accent)' }} />
                              รายละเอียดสินค้าในใบสั่งผลิต {order.order_number}
                            </div>
                            <span style={{ fontSize: 11, color: '#64748B' }}>
                              วันที่: <strong>{getOrderDisplayDate(order)}</strong>
                            </span>
                          </div>

                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1' }}>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11 }}>ลำดับ</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11 }}>ชื่อสินค้า / รหัส</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11 }}>โรงผลิต / แท่น</th>
                                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: 11 }}>จำนวนเป้าหมาย</th>
                                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: 11 }}>ชิ้นดี</th>
                                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: 11 }}>ของเสีย</th>
                                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: 11 }}>สถานะการผลิต</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.job_orders.map((job, idx) => {
                                const product = job.plan_item?.product
                                const productName = product?.name || 'ไม่ระบุชื่อสินค้า'
                                const productCode = product?.code ? `(${product.code})` : ''
                                const unit = product?.unit || 'ชิ้น'
                                const bed = job.bed ? `โรงผลิต ${job.bed}` : '—'
                                const targetQty = job.qty_target || 0

                                const records = job.demolding_records || []
                                const hasRecords = records.length > 0
                                let goodQty = 0
                                let defectQty = 0

                                if (hasRecords) {
                                  goodQty = records.reduce((sum: number, r: any) => sum + (r.qty_good || 0), 0)
                                  defectQty = records.reduce((sum: number, r: any) => sum + (r.qty_defect || 0), 0)
                                } else if (job.status === 'demolded' || job.status === 'qc_passed' || job.status === 'erp_synced' || order.status === 'erp_synced') {
                                  goodQty = job.qty_cast || targetQty
                                  defectQty = 0
                                }

                                let jobStatusLabel = 'รอเทคอนกรีต'
                                let jobStatusBg = '#F3F4F6'
                                let jobStatusColor = '#6B7280'

                                if (job.status === 'erp_synced' || order.status === 'erp_synced') {
                                  jobStatusLabel = 'บันทึกเข้าระบบแล้ว'
                                  jobStatusBg = '#D1FAE5'
                                  jobStatusColor = '#065F46'
                                } else if (job.status === 'qc_passed' || job.status === 'demolded') {
                                  jobStatusLabel = 'ผ่าน QC / ถอดแบบแล้ว'
                                  jobStatusBg = '#DBEAFE'
                                  jobStatusColor = '#1D4ED8'
                                } else if (job.status === 'cast') {
                                  jobStatusLabel = 'เทคอนกรีตแล้ว'
                                  jobStatusBg = '#FEF3C7'
                                  jobStatusColor = '#B45309'
                                } else if (job.status === 'in_progress') {
                                  jobStatusLabel = 'กำลังเทคอนกรีต'
                                  jobStatusBg = '#FFEDD5'
                                  jobStatusColor = '#C2410C'
                                }

                                return (
                                  <tr key={job.id || idx} style={{ borderBottom: '1px solid #E2E8F0', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                                    <td style={{ padding: '8px 12px', color: '#64748B', fontSize: 11 }}>{idx + 1}</td>
                                    <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1E293B' }}>
                                      {productName} <span style={{ color: '#64748B', fontWeight: 400, fontSize: 11 }}>{productCode}</span>
                                      {product?.size && <div style={{ fontSize: 10, color: '#94A3B8' }}>ขนาด: {product.size}</div>}
                                    </td>
                                    <td style={{ padding: '8px 12px', color: '#475569', fontWeight: 600 }}>{bed}</td>
                                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#1E293B' }}>
                                      {targetQty} {unit}
                                    </td>
                                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: '#16A34A' }}>
                                      {goodQty} {unit}
                                    </td>
                                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: defectQty > 0 ? '#DC2626' : '#94A3B8' }}>
                                      {defectQty} {unit}
                                    </td>
                                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                      <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 50, fontWeight: 700, background: jobStatusBg, color: jobStatusColor }}>
                                        {jobStatusLabel}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                            <tfoot>
                              <tr style={{ background: '#F1F5F9', fontWeight: 700 }}>
                                <td colSpan={3} style={{ padding: '10px 12px', textAlign: 'right', color: '#334155' }}>
                                  รวมทั้งหมด ({order.job_orders.length} รายการ):
                                </td>
                                <td style={{ padding: '10px 12px', textAlign: 'center', color: '#1E293B', fontWeight: 800 }}>
                                  {totalTarget} ชิ้น
                                </td>
                                <td style={{ padding: '10px 12px', textAlign: 'center', color: '#16A34A', fontWeight: 800 }}>
                                  {totalGoodAll} ชิ้น
                                </td>
                                <td style={{ padding: '10px 12px', textAlign: 'center', color: '#DC2626', fontWeight: 800 }}>
                                  {totalDefectAll} ชิ้น
                                </td>
                                <td style={{ padding: '10px 12px' }} />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 12 }}>ไม่พบข้อมูลใบสั่งผลิต</div>
        )}
      </div>

      {/* Manage Modal */}
      {manageModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 0, width: '100%', maxWidth: 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text)' }}>จัดการใบสั่งผลิต: {manageModal.order_number}</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>ตรวจสอบยอดผลิตจริง (FG) เพื่อนำไปบันทึกเข้าระบบกลาง</p>
              </div>
              <button onClick={() => setManageModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {/* Content Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>สรุปรายการสินค้าที่ผลิตสำเร็จ</h3>
              
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: 'var(--bg)' }}>
                    <tr>
                      <th style={{ padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>สินค้า</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>เป้าหมาย</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>งานดี (ผ่าน QC)</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>งานเสีย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manageModal.job_orders.map(job => {
                      // Sum from demolding_records if multiple, though usually 1 per job
                      const records = Array.isArray(job.demolding_records) ? job.demolding_records : [job.demolding_records]
                      const totalGood = records.reduce((s: number, r: any) => s + (r?.qty_good || 0), 0)
                      const totalDefect = records.reduce((s: number, r: any) => s + (r?.qty_defect || 0), 0)

                      return (
                        <tr key={job.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 600 }}>{job.plan_item?.product?.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              {job.plan_item?.product?.code} | {job.plan_item?.product?.size}
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600 }}>{job.qty_target}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--green)' }}>{totalGood}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: totalDefect > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{totalDefect}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: 20, borderRadius: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>หมายเลขอ้างอิงระบบกลาง (ERP Reference)</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  นำข้อมูลด้านบนไปบันทึกลงในระบบกลาง จากนั้นนำหมายเลขอ้างอิง (เช่น DOC-2026-001) มากรากที่นี่เพื่อยืนยัน
                </p>
                <input 
                  type="text" 
                  placeholder="กรอกหมายเลขอ้างอิง..." 
                  value={erpRef} 
                  onChange={e => setErpRef(e.target.value)}
                  style={{ width: '100%', padding: '12px 16px', border: '2px solid var(--accent)', borderRadius: 8, fontSize: 14, fontWeight: 600, outline: 'none', boxSizing: 'border-box' }} 
                />
              </div>

            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, justifyContent: 'flex-end', background: 'var(--bg)' }}>
              <button onClick={() => setManageModal(null)} style={{ padding: '10px 20px', border: '1px solid var(--border)', borderRadius: 8, background: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                ยกเลิก
              </button>
              <button onClick={handleSaveErp} disabled={saving} style={{ padding: '10px 24px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>}
                {saving ? 'กำลังบันทึก...' : 'ยืนยันบันทึกเข้าระบบ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Manual FG Product Entry Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 0, width: '100%', maxWidth: 650, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text)' }}>
                  ปรับขนาดสินค้าเสีย / เพิ่มสินค้าสำเร็จรูปเอง
                </h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  เพิ่มสินค้าเข้าคลัง FG โดยตรง (ไม่ผ่านขั้นตอนปกติ เช่น การตัดย่อขนาด หรือเปลี่ยนแบบ)
                </p>
              </div>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {/* Content Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              
              {/* Grid 2 Columns for Category and Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>หมวดหมู่สินค้า</label>
                  <select 
                    value={selCat} 
                    onChange={e => actOnCat(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'white', outline: 'none', boxSizing: 'border-box' }}
                  >
                    <option value="">-- เลือกหมวดหมู่ --</option>
                    {cats.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>ชื่อสินค้า</label>
                  <select 
                    value={selName} 
                    onChange={e => actOnName(e.target.value)}
                    disabled={!selCat}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'white', outline: 'none', boxSizing: 'border-box', opacity: !selCat ? 0.6 : 1 }}
                  >
                    <option value="">-- เลือกชื่อสินค้า --</option>
                    {names.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              {/* Grid 2 Columns for Size and Code */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>ขนาดสินค้า (Dimension)</label>
                  <select 
                    value={selSize} 
                    onChange={e => actOnSize(e.target.value)}
                    disabled={!selName}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'white', outline: 'none', boxSizing: 'border-box', opacity: !selName ? 0.6 : 1 }}
                  >
                    <option value="">-- เลือกขนาด --</option>
                    {sizes.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>รหัสสินค้า (Item Code)</label>
                  <select 
                    value={selCode} 
                    onChange={e => setSelCode(e.target.value)}
                    disabled={!selSize}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'white', outline: 'none', boxSizing: 'border-box', opacity: !selSize ? 0.6 : 1 }}
                  >
                    <option value="">-- เลือกรหัสสินค้า --</option>
                    {codes.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.code} ({c.name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Product Info Display (If selected) */}
              {selectedProduct && (
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '12px 16px', borderRadius: 8, fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#1E40AF', marginBottom: 2 }}>สินค้าที่เลือก: {selectedProduct.name}</div>
                  <div style={{ color: '#1E3A8A' }}>
                    รหัส: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedProduct.code}</span> | ขนาด: {selectedProduct.size || '-'} | หน่วย: {selectedProduct.unit || 'ชิ้น'}
                  </div>
                </div>
              )}

              {/* Grid 2 Columns for Bed and Quantity */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>โรงผลิต</label>
                  <select 
                    value={selectedBed} 
                    onChange={e => setSelectedBed(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'white', outline: 'none', boxSizing: 'border-box' }}
                  >
                    <option value="1">โรงผลิต 1</option>
                    <option value="2">โรงผลิต 2</option>
                    <option value="3">โรงผลิต 3</option>
                    <option value="4">โรงผลิต 4</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>จำนวน (ชิ้น)</label>
                    <input 
                      type="number" 
                      min="1" 
                      value={qty || ''} 
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '') {
                          setQty(0);
                        } else {
                          const parsed = parseInt(val);
                          if (!isNaN(parsed)) {
                            setQty(parsed);
                          }
                        }
                      }}
                      onBlur={() => {
                        if (qty <= 0) {
                          setQty(1);
                        }
                      }}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'white', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    disabled={!selectedProduct}
                    style={{
                      height: 41,
                      padding: '0 16px',
                      background: selectedProduct ? 'var(--green)' : '#E2E8F0',
                      color: selectedProduct ? 'white' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: selectedProduct ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <i className="fas fa-plus"></i> เพิ่มรายการ
                  </button>
                </div>
              </div>

              {/* Added Items Queue Table */}
              <div style={{ marginTop: 8 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                  รายการสินค้าที่จะนำเข้าคลัง ({addedItems.length} รายการ)
                </label>
                {addedItems.length === 0 ? (
                  <div style={{ padding: '16px', border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                    ยังไม่มีรายการสินค้า — กรุณาเลือกรายละเอียดสินค้าด้านบนแล้วกด "เพิ่มรายการ"
                  </div>
                ) : (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxHeight: 180, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead style={{ background: 'var(--bg)' }}>
                        <tr>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>สินค้า</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>โรงผลิต</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>จำนวน</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', width: 50 }}>ลบ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {addedItems.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ fontWeight: 600 }}>{item.productName}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                                {item.productCode} | {item.productSize}
                              </div>
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>โรงผลิต {item.bed}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--accent)' }}>{item.qty} ชิ้น</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <button 
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                style={{ width: 24, height: 24, borderRadius: 6, background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                              >
                                <i className="fas fa-trash-alt" style={{ fontSize: 9 }}></i>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Raw Material Deduction Table */}
              {addedItems.length > 0 && (
                <div style={{ marginTop: 4, padding: '14px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12 }}>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: '#1E293B', margin: 0 }}>
                      <i className="fas fa-cubes-stacked" style={{ color: 'var(--accent)' }}></i>
                      รายการวัตถุดิบที่จะตัดออกจากระบบ ({materialDeductions.length} รายการ)
                    </label>
                    <p style={{ fontSize: 11, color: '#64748B', margin: '2px 0 0' }}>
                      คำนวณตามสูตร BOM โดยอัตโนมัติ คุณสามารถแก้ไขจำนวนที่จะตัดสต็อกจริงได้ที่ช่องป้อนข้อมูลด้านขวา
                    </p>
                  </div>

                  {materialDeductions.length === 0 ? (
                    <div style={{ padding: '12px', background: '#FFFFFF', border: '1px dashed #CBD5E1', borderRadius: 8, textAlign: 'center', fontSize: 12, color: '#64748B' }}>
                      สินค้ารายการนี้ยังไม่มีสูตรวัตถุดิบ (BOM) บันทึกในระบบ
                    </div>
                  ) : (
                    <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', background: '#FFFFFF', maxHeight: 180, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead style={{ background: '#F1F5F9' }}>
                          <tr>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', borderBottom: '1px solid #E2E8F0' }}>วัตถุดิบ</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center', color: '#475569', borderBottom: '1px solid #E2E8F0' }}>สต็อกคงเหลือ</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center', color: '#475569', borderBottom: '1px solid #E2E8F0' }}>คำนวณตามสูตร</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', borderBottom: '1px solid #E2E8F0', width: 140 }}>จำนวนที่จะตัดจริง</th>
                          </tr>
                        </thead>
                        <tbody>
                          {materialDeductions.map((mat, idx) => {
                            const isInsufficient = mat.currentStock < mat.deductQty
                            return (
                              <tr key={mat.rawMaterialId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                <td style={{ padding: '8px 12px' }}>
                                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{mat.name}</div>
                                  <div style={{ fontSize: 10, color: '#64748B' }}>รหัส: {mat.code}</div>
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                  <span style={{ fontWeight: 600, color: isInsufficient ? '#EF4444' : '#10B981' }}>
                                    {mat.currentStock.toLocaleString()} {mat.unit}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>
                                  {mat.calculatedQty} {mat.unit}
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={mat.deductQty}
                                      onChange={e => {
                                        const val = parseFloat(e.target.value) || 0
                                        setMaterialDeductions(prev => prev.map((m, i) => i === idx ? { ...m, deductQty: val } : m))
                                      }}
                                      style={{
                                        width: 85,
                                        padding: '4px 8px',
                                        border: isInsufficient ? '1px solid #FCA5A5' : '1px solid #CBD5E1',
                                        borderRadius: 6,
                                        fontSize: 12,
                                        fontWeight: 700,
                                        textAlign: 'right',
                                        outline: 'none',
                                        background: isInsufficient ? '#FEF2F2' : '#FFFFFF',
                                        color: isInsufficient ? '#DC2626' : '#0F172A'
                                      }}
                                    />
                                    <span style={{ fontSize: 11, color: '#64748B', minWidth: 24 }}>{mat.unit}</span>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Textarea for Notes */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>หมายเหตุ / สาเหตุการปรับปรุง</label>
                <textarea 
                  placeholder="เช่น: ปรับขนาดจากแผ่นพื้นที่ชำรุดของแผน PO-20260512-001 หรือเปลี่ยนสเปก..." 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'white', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>

            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, justifyContent: 'flex-end', background: 'var(--bg)' }}>
              <button 
                onClick={() => {
                  // Reset form & close
                  setSelCat('')
                  setSelName('')
                  setSelSize('')
                  setSelCode('')
                  setQty(1)
                  setNotes('')
                  setAddedItems([])
                  setMaterialDeductions([])
                  setShowAddModal(false)
                }} 
                style={{ padding: '10px 20px', border: '1px solid var(--border)', borderRadius: 8, background: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleSaveManualFg} 
                disabled={addingOrder || addedItems.length === 0} 
                style={{ 
                  padding: '10px 24px', 
                  border: 'none', 
                  borderRadius: 8, 
                  background: 'var(--accent)', 
                  color: 'white', 
                  fontSize: 13, 
                  fontWeight: 700, 
                  cursor: (addedItems.length === 0 || addingOrder) ? 'not-allowed' : 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 8,
                  opacity: (addedItems.length === 0 || addingOrder) ? 0.6 : 1
                }}
              >
                {addingOrder ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>}
                {addingOrder ? 'กำลังบันทึก...' : 'บันทึกเข้าคลัง'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fg Document Print Modal Overlay */}
      <FgDocumentModal 
        isOpen={printModalOrderId !== null} 
        onClose={() => setPrintModalOrderId(null)} 
        orderId={printModalOrderId} 
      />
    </div>
  )
}
