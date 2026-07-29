'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { updateCounterfortMinStock } from '@/app/actions/component'

interface CounterfortMaterial {
  id: string
  material_code: string | null
  name: string
  qty_on_hand: number
  min_stock: number
  unit: string
  updated_at: string
  is_active?: boolean
}

interface ActivityLog {
  id: string
  action_type: string
  detail: string
  created_at: string
  user: { full_name: string } | null
}

interface A42Product {
  id: string
  code: string
  name: string
  size: string
  category?: string
  counterfort_material_id: string | null
  counterfort_qty_per_unit: number
}

interface Props {
  materials: CounterfortMaterial[]
  activityLogs: ActivityLog[]
  a42Products: A42Product[]
  userRole?: string
}

export default function ComponentInventoryClient({ materials: initialMaterials, activityLogs, a42Products, userRole }: Props) {
  const [materials, setMaterials] = useState<CounterfortMaterial[]>(initialMaterials)
  const [activeTab, setActiveTab] = useState<'stock' | 'bom'>('stock')
  
  // Modal Edit Min Stock States
  const [editingMat, setEditingMat] = useState<CounterfortMaterial | null>(null)
  const [editMinStock, setEditMinStock] = useState<number>(0)
  const [savingMinStock, setSavingMinStock] = useState(false)

  const isAdmin = userRole === 'admin' || userRole === 'super_admin'

  const handleOpenEditMinStock = (mat: CounterfortMaterial) => {
    setEditingMat(mat)
    setEditMinStock(mat.min_stock)
  }

  const handleSaveMinStock = async () => {
    if (!editingMat) return
    setSavingMinStock(true)
    try {
      await updateCounterfortMinStock(editingMat.id, editMinStock)
      toast.success(`ปรับแต่ง Min Stock ของ ${editingMat.name} สำเร็จ!`)
      setMaterials(prev => prev.map(m => m.id === editingMat.id ? { ...m, min_stock: editMinStock } : m))
      setEditingMat(null)
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาดในการบันทึก Min Stock')
    } finally {
      setSavingMinStock(false)
    }
  }

  const totalStock = materials.reduce((s, m) => s + m.qty_on_hand, 0)
  const lowStockCount = materials.filter(m => m.qty_on_hand < m.min_stock).length

  // สินค้า L-Wall ที่ใช้ Counterfort (ตัดสินค้าที่เป็นตัวฐาน Counterfort ออก)
  const lwallProducts = a42Products.filter(p =>
    p.counterfort_material_id !== null &&
    p.counterfort_qty_per_unit > 0 &&
    !p.code.startsWith('CF-')
  )

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const getStockStatus = (m: CounterfortMaterial) => {
    if (m.qty_on_hand === 0) return { label: 'หมด', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' }
    if (m.qty_on_hand < m.min_stock) return { label: 'ต่ำกว่ากำหนด', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' }
    return { label: 'พร้อมใช้', color: '#059669', bg: '#F0FDF4', border: '#A7F3D0' }
  }

  return (
    <div style={{ padding: '24px 32px 40px 32px', background: '#F7F8FA', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>รายการ Counterfort</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#111827' }}>{materials.length}</div>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>รหัสชิ้นส่วน SFG</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>คงเหลือรวมทุกรหัส</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#2563EB' }}>{totalStock.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>ชิ้นพร้อมใช้งาน</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>เตือน Stock ต่ำ</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: lowStockCount > 0 ? '#DC2626' : '#059669' }}>{lowStockCount}</div>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>รายการที่ต่ำกว่า Min Stock</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>

        <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', background: '#FAFAFA' }}>
          {[
            { key: 'stock' as const, label: 'Stock Counterfort', count: materials.length },
            { key: 'bom' as const, label: 'BOM Reference', count: lwallProducts.length },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '14px 24px', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer',
                borderBottom: activeTab === tab.key ? '2px solid #2563EB' : '2px solid transparent',
                background: activeTab === tab.key ? '#fff' : 'transparent',
                color: activeTab === tab.key ? '#2563EB' : '#6B7280',
                marginBottom: activeTab === tab.key ? -1 : 0,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {tab.label}
              <span style={{
                background: activeTab === tab.key ? '#EFF6FF' : '#F3F4F6',
                color: activeTab === tab.key ? '#2563EB' : '#9CA3AF',
                fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 8px'
              }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>


        {/* Tab: Stock */}
        {activeTab === 'stock' && (
          <div style={{ padding: 24 }}>
            {materials.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🏗️</div>
                <div style={{ fontWeight: 600 }}>ยังไม่มีข้อมูล Counterfort SFG</div>
                <div style={{ fontSize: 12, marginTop: 8 }}>กรุณา Apply Migration 017 ก่อน</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {materials.map(m => {
                  const status = getStockStatus(m)
                  const parentProducts = a42Products.filter(p =>
                    p.counterfort_material_id === m.id &&
                    p.counterfort_qty_per_unit > 0 &&
                    !p.code.startsWith('CF-')
                  )
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 16,
                        padding: '12px 18px', borderRadius: 10,
                        border: `1px solid ${status.border}`,
                        background: status.bg,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2, fontFamily: 'monospace' }}>
                          {m.material_code ?? '-'} &middot; อัปเดต: {new Date(m.updated_at).toLocaleDateString('th-TH')}
                        </div>

                        {/* L-Wall Mapping Badge */}
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: '#4B5563', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <i className="fas fa-puzzle-piece" style={{ color: '#2563EB', fontSize: 10 }} />
                            ชิ้นส่วนของ L-Wall:
                          </span>
                          {parentProducts.length > 0 ? (
                            parentProducts.map(p => (
                              <span
                                key={p.id}
                                style={{
                                  fontSize: 11, fontWeight: 700, color: '#1E40AF', background: '#EFF6FF',
                                  border: '1px solid #BFDBFE', padding: '2px 10px', borderRadius: 999,
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                }}
                              >
                                {p.name} ({p.code}) &mdash; ใช้ <strong>{p.counterfort_qty_per_unit}</strong> ชิ้น/แผ่น
                              </span>
                            ))
                          ) : (
                            <span style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>
                              ยังไม่มีสินค้าผูก
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'center', minWidth: 100 }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: status.color }}>
                          {m.qty_on_hand.toLocaleString()}
                        </div>
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>{m.unit}</div>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 110 }}>
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>Min Stock</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                            {m.min_stock} {m.unit}
                          </span>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMat(m)
                                setEditMinStock(m.min_stock)
                              }}
                              title="แก้ไข Min Stock (เฉพาะ Admin / Super Admin)"
                              style={{
                                background: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                color: '#2563EB',
                                borderRadius: 6,
                                padding: '3px 8px',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                transition: 'all 0.15s'
                              }}
                            >
                              <i className="fas fa-pen" style={{ fontSize: 10 }} />
                              แก้ไข
                            </button>
                          )}
                        </div>
                      </div>
                      <span style={{
                        padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                        color: status.color, background: '#fff', border: `1.5px solid ${status.border}`,
                        whiteSpace: 'nowrap'
                      }}>
                        {status.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab: BOM Reference */}
        {activeTab === 'bom' && (
          <div style={{ padding: 24 }}>
            <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
              แสดงความสัมพันธ์ระหว่าง L-Wall (A42) และ Counterfort ที่ต้องใช้ประกอบ
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#FAFAFA', borderBottom: '2px solid #E5E7EB' }}>
                  {['รหัสสินค้า L-Wall', 'ชื่อ', 'ขนาด', 'Counterfort ที่ใช้', 'จำนวน/ชิ้น'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#6B7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lwallProducts.map((p, idx) => {

                  const cf = materials.find(m => m.id === p.counterfort_material_id)
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#374151', fontSize: 12 }}>{p.code}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#111827' }}>{p.name}</td>
                      <td style={{ padding: '12px 16px', color: '#6B7280' }}>{p.size}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {cf ? (
                          <span style={{ background: '#EFF6FF', color: '#2563EB', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                            {cf.name}
                          </span>
                        ) : (
                          <span style={{ color: '#9CA3AF', fontSize: 11 }}>ไม่พบข้อมูล</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{ fontWeight: 800, fontSize: 16, color: '#2563EB' }}>{p.counterfort_qty_per_unit}</span>
                        <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 4 }}>ชิ้น</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}


      </div>

      {/* Info Banner */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '14px 20px', display: 'flex', gap: 12, alignItems: 'center' }}>
        <i className="fas fa-info-circle" style={{ color: '#2563EB', fontSize: 16 }} />
        <div style={{ fontSize: 12, color: '#1E40AF', lineHeight: 1.6 }}>
          <strong>วิธีการทำงาน:</strong> Counterfort ที่ผลิตและผ่าน QC แล้วจะถูกรับเข้าคลังชิ้นส่วนนี้โดยอัตโนมัติ
          เมื่อสร้างแผนผลิต L-Wall ระบบจะตรวจสอบ Stock ที่นี่ก่อน หากไม่เพียงพอจะแจ้งเตือนให้ผลิต Counterfort เพิ่มก่อน
        </div>
      </div>

      {/* Modal: Edit Min Stock */}
      {editingMat && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420,
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            overflow: 'hidden', border: '1px solid #E5E7EB'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFAFA' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111827', margin: 0 }}>
                  ปรับแต่ง Min Stock
                </h3>
                <p style={{ fontSize: 12, color: '#6B7280', margin: '3px 0 0 0' }}>
                  {editingMat.name} ({editingMat.material_code ?? '-'})
                </p>
              </div>
              <button
                onClick={() => setEditingMat(null)}
                style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 16 }}
              >
                <i className="fas fa-times" />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: 14, display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>Stock ปัจจุบัน</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#2563EB', marginTop: 2 }}>
                    {editingMat.qty_on_hand} {editingMat.unit}
                  </div>
                </div>
                <div style={{ borderRight: '1px solid #E5E7EB' }} />
                <div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>Min Stock ปัจจุบัน</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#374151', marginTop: 2 }}>
                    {editingMat.min_stock} {editingMat.unit}
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                  ระบุ Min Stock ใหม่ ({editingMat.unit}):
                </label>
                <input
                  type="number"
                  min={0}
                  value={editMinStock}
                  onChange={e => setEditMinStock(Number(e.target.value))}
                  style={{
                    width: '100%', height: 42, padding: '0 14px',
                    border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14,
                    fontWeight: 700, outline: 'none', color: '#111827', boxSizing: 'border-box'
                  }}
                  placeholder="กรอกจำนวน Min Stock"
                  autoFocus
                />
                <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
                  * เมื่อ Stock คงเหลือลดลงต่ำกว่า Min Stock ระบบจะแจ้งเตือน "ต่ำกว่ากำหนด" เพื่อให้วางแผนผลิตเพิ่ม
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F3F4F6', background: '#FAFAFA', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setEditingMat(null)}
                disabled={savingMinStock}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveMinStock}
                disabled={savingMinStock}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#2563EB', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: savingMinStock ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {savingMinStock ? 'กำลังบันทึก...' : 'บันทึก Min Stock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
