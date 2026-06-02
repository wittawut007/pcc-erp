'use client'

import { useState, useMemo, useEffect } from 'react'
import toast from 'react-hot-toast'
import { saveErpReference, createManualFgOrder } from '@/app/actions/fg'

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
}

const CATEGORIES = [
  'A13 แผ่นพื้น',
  'A30 ผนังรั้วสำเร็จรูป',
  'A35 รั้วสำเร็จรูป',
  'A36 เสา คาน บันได',
  'A41 เสาเข็ม',
  'A42 กำแพงกันดิน',
  'A82 เสารั้ว',
]

export default function FgInventoryClient({ 
  productionOrders: initialOrders,
  products
}: { 
  productionOrders: ProductionOrder[]
  products: Product[]
}) {
  const [orders, setOrders] = useState<ProductionOrder[]>(initialOrders)
  const [search, setSearch] = useState('')
  const [manageModal, setManageModal] = useState<ProductionOrder | null>(null)
  const [erpRef, setErpRef] = useState('')
  const [saving, setSaving] = useState(false)

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

      const newOrder = await createManualFgOrder(payloadItems, notes)
      if (!newOrder) {
        throw new Error('ไม่สามารถดึงข้อมูลใบสั่งผลิตที่สร้างขึ้นใหม่ได้')
      }
      toast.success(`เพิ่มสินค้าสำเร็จ! เลขที่ใบสั่งสินค้า: ${newOrder.order_number}`)
      
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
      setShowAddModal(false)
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setAddingOrder(false)
    }
  }

  // Filter orders (only showing ones that have at least some jobs, perhaps demolded)
  // For now, we show all, but we might filter out empty ones
  const filtered = orders.filter(o => {
    const matchSearch = !search || o.order_number.toLowerCase().includes(search.toLowerCase())
    return matchSearch && o.job_orders && o.job_orders.length > 0
  })

  const totalCompletedOrders = orders.filter(o => o.status === 'erp_synced').length
  const totalPendingOrders = orders.filter(o => o.status !== 'erp_synced' && o.job_orders.length > 0).length

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
          { label: 'ใบสั่งผลิตทั้งหมด', value: filtered.length, icon: 'fa-file-invoice', color: 'var(--accent)' },
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

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}></i>
          <input type="text" placeholder="ค้นหาเลขที่ใบสั่งผลิต..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', outline: 'none' }} />
        </div>
        <button onClick={() => setShowAddModal(true)}
          style={{ padding: '9px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fas fa-plus"></i> ปรับขนาดสินค้าเสีย / เพิ่มสินค้าสำเร็จรูปเอง
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['วันที่', 'ใบสั่งผลิต', 'จำนวนรายการ (ชิ้น)', 'สถานะ', 'หมายเลขอ้างอิง', 'เอกสาร', 'จัดการ'].map((h, i) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: i >= 5 ? 'center' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(order => {
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

              return (
                <tr key={order.id} className="hover:bg-[var(--bg)] transition-colors">
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    {order.plan?.[0]?.plan_date ? new Date(order.plan[0].plan_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text)' }}>
                    {order.order_number}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    {totalTarget} ชิ้น ({order.job_orders.length} รายการ)
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
                    <a href={`/inventory/fg/print/${order.id}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}
                      className="hover:bg-slate-100 transition-colors">
                      <i className="fas fa-print" style={{ color: 'var(--accent)' }}></i> พิมพ์เอกสาร
                    </a>
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                    {statusText === 'QC ตรวจสอบแล้ว' ? (
                      <button onClick={() => handleManage(order)}
                        style={{ padding: '6px 12px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                        <i className="fas fa-tasks" style={{ marginRight: 6 }}></i> จัดการ
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 500 }}>-</span>
                    )}
                  </td>
                </tr>
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
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
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
    </div>
  )
}
