'use client'

import { useState, useTransition } from 'react'
import { supplyConcreteOrder } from '@/app/actions/concrete'
import toast from 'react-hot-toast'

interface Profile { full_name: string; employee_code?: string | null }
interface ProductInfo { name: string; code: string }
interface PlanItem { product: ProductInfo | null }
interface JobOrderInfo { id: string; bed: string; qty_target: number; plan_item: PlanItem | null }

interface ConcreteOrder {
  id: string
  job_order_id: string
  qty_requested: number
  mix_ratio: string | null
  status: string
  notes: string | null
  requested_at: string
  supplied_at: string | null
  requested_by_profile: Profile | null
  supplied_by_profile: Profile | null
  job_order: JobOrderInfo | null
}

interface Props {
  pending: ConcreteOrder[]
  history: ConcreteOrder[]
}

export default function ConcreteClient({ pending: initialPending, history }: Props) {
  const [pendingItems, setPendingItems] = useState(initialPending)
  const [isPending, startTransition] = useTransition()
  const [activeId, setActiveId] = useState<string | null>(null)

  const handleSupply = (orderId: string) => {
    setActiveId(orderId)
    startTransition(async () => {
      try {
        await supplyConcreteOrder(orderId)
        toast.success('ยืนยันจ่ายคอนกรีตเรียบร้อย')
        setPendingItems(prev => prev.filter(o => o.id !== orderId))
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setActiveId(null)
      }
    })
  }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          { label: 'รอจ่าย',       value: pendingItems.length,                          icon: 'fa-hourglass-half', color: '#EA580C', bg: '#FFF7ED' },
          { label: 'จ่ายแล้ววันนี้', value: history.filter(h => h.status === 'supplied').length, icon: 'fa-check-circle',   color: '#16A34A', bg: '#F0FDF4' },
          { label: 'รวม m³ วันนี้',  value: history.reduce((s, h) => s + (h.qty_requested ?? 0), 0).toFixed(2), icon: 'fa-tint', color: '#2563EB', bg: '#EFF4FF' },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: kpi.bg, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
              <i className={`fas ${kpi.icon}`} />
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{kpi.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Pending Queue */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="fas fa-fill-drip" style={{ color: '#EA580C', fontSize: 15 }} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>คิวรอจ่ายคอนกรีต</span>
          {pendingItems.length > 0 && (
            <span style={{ marginLeft: 'auto', background: '#FFF7ED', color: '#EA580C', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
              {pendingItems.length} รายการ
            </span>
          )}
        </div>

        {pendingItems.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <i className="fas fa-check-circle" style={{ fontSize: 36, color: '#16A34A', marginBottom: 12, display: 'block' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>ไม่มีคิวรอดำเนินการ</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {pendingItems.map((order, idx) => {
              const isLoading = activeId === order.id && isPending
              const product = order.job_order?.plan_item?.product
              const bed = order.job_order?.bed

              return (
                <div key={order.id} style={{
                  display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px',
                  borderBottom: idx < pendingItems.length - 1 ? '1px solid var(--border)' : 'none',
                  background: idx % 2 === 0 ? '#fff' : '#FAFAFA',
                }}>
                  {/* Bed Badge */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 10, background: '#EFF4FF', color: '#2563EB',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontWeight: 800,
                  }}>
                    <span style={{ fontSize: 8, letterSpacing: '0.05em', marginBottom: -2 }}>โรงผลิต</span>
                    <span style={{ fontSize: 20 }}>{bed ?? '?'}</span>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                      {product?.name ?? '—'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                      <span><i className="fas fa-user" style={{ marginRight: 4 }} />{order.requested_by_profile?.full_name ?? '—'}</span>
                      <span><i className="fas fa-clock" style={{ marginRight: 4 }} />{formatTime(order.requested_at)}</span>
                      {order.mix_ratio && <span><i className="fas fa-blender" style={{ marginRight: 4 }} />{order.mix_ratio}</span>}
                    </div>
                    {order.notes && <div style={{ fontSize: 11, color: '#D97706', marginTop: 4 }}><i className="fas fa-comment" style={{ marginRight: 4 }} />{order.notes}</div>}
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', lineHeight: 1 }}>
                      {order.qty_requested} <span style={{ fontSize: 13, fontWeight: 400 }}>m³</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSupply(order.id)}
                    disabled={isLoading}
                    style={{
                      padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                      background: '#2563EB', color: '#fff', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
                      opacity: isLoading ? 0.7 : 1,
                    }}
                  >
                    {isLoading ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />}
                    ยืนยันจ่าย
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>ประวัติการจ่ายวันนี้</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['เวลา', 'โรงผลิต', 'สินค้า', 'ปริมาณ (m³)', 'ผู้สั่ง', 'ผู้จ่าย', 'สถานะ'].map(th => (
                  <th key={th} style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{th}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id}>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{formatTime(h.requested_at)}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, borderBottom: '1px solid var(--border)' }}>โรงผลิต {h.job_order?.bed}</td>
                  <td style={{ padding: '10px 16px', fontSize: 12, borderBottom: '1px solid var(--border)' }}>{h.job_order?.plan_item?.product?.name ?? '—'}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, fontFamily: 'monospace', borderBottom: '1px solid var(--border)' }}>{h.qty_requested}</td>
                  <td style={{ padding: '10px 16px', fontSize: 12, borderBottom: '1px solid var(--border)' }}>{h.requested_by_profile?.full_name ?? '—'}</td>
                  <td style={{ padding: '10px 16px', fontSize: 12, borderBottom: '1px solid var(--border)' }}>{h.supplied_by_profile?.full_name ?? '—'}</td>
                  <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ padding: '2px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: h.status === 'supplied' ? '#F0FDF4' : '#FFF7ED', color: h.status === 'supplied' ? '#16A34A' : '#EA580C' }}>
                      {h.status === 'supplied' ? 'จ่ายแล้ว' : 'รอจ่าย'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
