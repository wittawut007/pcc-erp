'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { saveErpReference } from '@/app/actions/fg'

interface ProductionOrder {
  id: string
  order_number: string
  status: string
  erp_reference: string | null
  created_at: string
  plan: { plan_date: string } | null
  job_orders: any[]
}

export default function FgInventoryClient({ productionOrders: initialOrders }: { productionOrders: ProductionOrder[] }) {
  const [orders, setOrders] = useState<ProductionOrder[]>(initialOrders)
  const [search, setSearch] = useState('')
  const [manageModal, setManageModal] = useState<ProductionOrder | null>(null)
  const [erpRef, setErpRef] = useState('')
  const [saving, setSaving] = useState(false)

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
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['วันที่', 'ใบสั่งผลิต', 'จำนวนรายการ (ชิ้น)', 'สถานะ', 'หมายเลขอ้างอิง', 'จัดการ'].map((h, i) => (
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
                    {order.plan?.plan_date ? new Date(order.plan.plan_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
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
    </div>
  )
}
