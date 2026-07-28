'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'

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
  counterfort_material_id: string | null
  counterfort_qty_per_unit: number
}

interface Props {
  materials: CounterfortMaterial[]
  activityLogs: ActivityLog[]
  a42Products: A42Product[]
}

export default function ComponentInventoryClient({ materials, activityLogs, a42Products }: Props) {
  const [activeTab, setActiveTab] = useState<'stock' | 'history' | 'bom'>('stock')

  const totalStock = materials.reduce((s, m) => s + m.qty_on_hand, 0)
  const lowStockCount = materials.filter(m => m.qty_on_hand < m.min_stock).length

  // กรองสินค้าเฉพาะ L-Wall (กำแพงกันดิน) สำหรับ BOM Reference
  const lwallProducts = a42Products.filter(p =>
    !p.code.startsWith('CF-') &&
    !p.name.toLowerCase().includes('counterfort h') &&
    p.counterfort_qty_per_unit > 0
  )

  const formatDate = (dt: string) =>
    new Date(dt).toLocaleString('th-TH', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  const getStockStatus = (m: CounterfortMaterial) => {
    if (m.qty_on_hand === 0) return { label: 'หมด', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' }
    if (m.qty_on_hand < m.min_stock) return { label: 'ต่ำกว่ากำหนด', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' }
    return { label: 'พร้อมใช้', color: '#059669', bg: '#F0FDF4', border: '#A7F3D0' }
  }

  const getActionIcon = (actionType: string) => {
    if (actionType.includes('รับ')) return '📥'
    if (actionType.includes('เบิก')) return '📤'
    if (actionType.includes('QC')) return '✅'
    return '📋'
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
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Stock รวมทั้งหมด</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#2563EB' }}>{totalStock.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>ชิ้น (พร้อมใช้งาน)</div>
        </div>
        <div style={{
          background: lowStockCount > 0 ? '#FFFBEB' : '#F0FDF4',
          border: `1px solid ${lowStockCount > 0 ? '#FDE68A' : '#A7F3D0'}`,
          borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Stock ต่ำกว่าเกณฑ์</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: lowStockCount > 0 ? '#D97706' : '#059669' }}>{lowStockCount}</div>
          <div style={{ fontSize: 12, color: lowStockCount > 0 ? '#92400E' : '#065F46', marginTop: 4 }}>
            {lowStockCount > 0 ? '⚠️ ต้องผลิตเพิ่ม' : '✅ Stock เพียงพอ'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>

        <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', background: '#FAFAFA' }}>
          {[
            { key: 'stock' as const, label: 'Stock Counterfort', count: materials.length },
            { key: 'bom' as const, label: 'BOM Reference', count: lwallProducts.length },
            { key: 'history' as const, label: 'ประวัติการเคลื่อนไหว', count: activityLogs.length },
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
                  const parentProducts = a42Products.filter(p => p.counterfort_material_id === m.id)
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
                      <div style={{ textAlign: 'right', minWidth: 80 }}>
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>Min Stock</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{m.min_stock} {m.unit}</div>
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

        {/* Tab: History */}
        {activeTab === 'history' && (
          <div style={{ padding: 24 }}>
            {activityLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                <div style={{ fontWeight: 600 }}>ยังไม่มีประวัติการเคลื่อนไหว</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activityLogs.map(log => (
                  <div key={log.id} style={{
                    display: 'flex', gap: 16, padding: '14px 16px', borderRadius: 10,
                    border: '1px solid #E5E7EB', background: '#fff', alignItems: 'flex-start'
                  }}>
                    <div style={{ fontSize: 24, lineHeight: 1 }}>{getActionIcon(log.action_type)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: 2 }}>{log.action_type}</div>
                      <div style={{ fontSize: 12, color: '#6B7280' }}>{log.detail}</div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 120 }}>
                      <div style={{ fontSize: 11, color: '#9CA3AF' }}>{formatDate(log.created_at)}</div>
                      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{(log.user as any)?.full_name ?? '-'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
    </div>
  )
}
