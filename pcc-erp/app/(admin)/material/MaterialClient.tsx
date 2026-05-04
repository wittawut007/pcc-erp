'use client'

import { useState, useTransition } from 'react'
import { dispenseMaterial } from '@/app/actions/material'
import toast from 'react-hot-toast'

interface RawMaterial {
  id: string
  name: string
  unit: string
  qty_on_hand: number
}

interface PlanInfo {
  id: string
  plan_date: string
  status: string
}

interface Requisition {
  id: string
  plan_id: string
  raw_material_id: string
  qty_required: number
  qty_dispensed: number
  status: string
  notes: string | null
  dispensed_at: string | null
  raw_material: RawMaterial | null
  plan: PlanInfo | null
  dispensed_by_profile: { full_name: string } | null
}

interface Props {
  initialData: Requisition[]
}

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: 'รอจ่าย',   bg: '#FFF7ED', color: '#EA580C' },
  partial:   { label: 'จ่ายบางส่วน', bg: '#EFF6FF', color: '#2563EB' },
  dispensed: { label: 'จ่ายแล้ว', bg: '#F0FDF4', color: '#16A34A' },
}

export default function MaterialClient({ initialData }: Props) {
  const [items, setItems] = useState<Requisition[]>(initialData)
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()
  const [activeId, setActiveId] = useState<string | null>(null)

  const handleDispense = (item: Requisition) => {
    const qty = parseFloat(qtyMap[item.id] ?? '0')
    if (!qty || qty <= 0) {
      toast.error('กรุณาระบุจำนวนที่ต้องการจ่าย')
      return
    }

    setActiveId(item.id)
    startTransition(async () => {
      try {
        await dispenseMaterial(item.id, qty)
        toast.success(`จ่าย ${qty} ${item.raw_material?.unit ?? ''} เรียบร้อย`)
        setQtyMap(prev => ({ ...prev, [item.id]: '' }))
        // Optimistically update
        setItems(prev =>
          prev.map(r => r.id === item.id
            ? {
                ...r,
                qty_dispensed: r.qty_dispensed + qty,
                status: (r.qty_dispensed + qty) >= r.qty_required ? 'dispensed' : 'partial',
              }
            : r
          ).filter(r => r.status !== 'dispensed')
        )
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setActiveId(null)
      }
    })
  }

  if (items.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '80px 0', gap: 12,
      }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="fas fa-check-circle" style={{ fontSize: 28, color: '#16A34A' }} />
        </div>
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>ไม่มีรายการรอจ่ายวัตถุดิบ</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>วัตถุดิบทั้งหมดในแผนการผลิตได้รับการจ่ายครบแล้ว</p>
        <button onClick={() => window.location.href = '/'} style={{ marginTop: 16, padding: '10px 24px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 6px -1px rgba(37,99,235,0.2)' }}>
          <i className="fas fa-arrow-left" /> กลับหน้าหลัก
        </button>
      </div>
    )
  }

  // Group by plan
  const grouped = items.reduce<Record<string, { plan: PlanInfo | null; items: Requisition[] }>>((acc, item) => {
    const key = item.plan_id
    if (!acc[key]) acc[key] = { plan: item.plan, items: [] }
    acc[key].items.push(item)
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          { label: 'รายการทั้งหมด',     value: items.length,                                  icon: 'fa-list', color: '#2563EB', bg: '#EFF4FF' },
          { label: 'รอจ่าย',            value: items.filter(i => i.status === 'pending').length,  icon: 'fa-clock', color: '#EA580C', bg: '#FFF7ED' },
          { label: 'จ่ายบางส่วน',       value: items.filter(i => i.status === 'partial').length,  icon: 'fa-exclamation-circle', color: '#D97706', bg: '#FFFBEB' },
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

      {/* Requisition List grouped by Plan */}
      {Object.entries(grouped).map(([planId, group]) => {
        const planDate = group.plan?.plan_date
          ? new Date(group.plan.plan_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
          : planId.slice(0, 8)

        return (
          <div key={planId} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {/* Plan Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: '#FAFAFA', display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="fas fa-calendar-alt" style={{ color: 'var(--accent)', fontSize: 14 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                แผนการผลิต: {planDate}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {group.items.length} รายการ
              </span>
            </div>

            {/* Material Items */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
              <thead>
                <tr>
                  {['วัตถุดิบ', 'ต้องใช้', 'จ่ายแล้ว', 'สต็อกคงเหลือ', 'สถานะ', 'จ่ายเพิ่ม', ''].map((th, i) => (
                    <th key={th + i} style={{
                      fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
                      letterSpacing: '0.05em', padding: '10px 16px', textAlign: 'left',
                      borderBottom: '1px solid var(--border)',
                    }}>{th}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.items.map(item => {
                  const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.pending
                  const remaining = item.qty_required - item.qty_dispensed
                  const stockOk = (item.raw_material?.qty_on_hand ?? 0) >= remaining
                  const isLoading = activeId === item.id && isPending

                  return (
                    <tr key={item.id}>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{item.raw_material?.name ?? '—'}</div>
                        {item.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{item.notes}</div>}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', fontFamily: 'monospace' }}>
                        {item.qty_required} {item.raw_material?.unit}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', fontFamily: 'monospace', color: item.qty_dispensed > 0 ? '#16A34A' : 'var(--text-muted)' }}>
                        {item.qty_dispensed} {item.raw_material?.unit}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', fontFamily: 'monospace', color: stockOk ? 'var(--text-primary)' : '#EF4444' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {!stockOk && <i className="fas fa-exclamation-triangle" style={{ fontSize: 11 }} />}
                          {item.raw_material?.qty_on_hand ?? '—'} {item.raw_material?.unit}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                        <input
                          type="number"
                          placeholder={`จำนวน (${item.raw_material?.unit})`}
                          value={qtyMap[item.id] ?? ''}
                          onChange={e => setQtyMap(prev => ({ ...prev, [item.id]: e.target.value }))}
                          style={{
                            width: 130, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
                            fontSize: 13, fontFamily: 'monospace', outline: 'none',
                          }}
                          min={0}
                          max={remaining}
                        />
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                        <button
                          onClick={() => handleDispense(item)}
                          disabled={isLoading || item.status === 'dispensed'}
                          style={{
                            padding: '7px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                            background: item.status === 'dispensed' ? '#F3F4F6' : '#2563EB',
                            color: item.status === 'dispensed' ? '#9CA3AF' : '#fff',
                            border: 'none', cursor: item.status === 'dispensed' ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          {isLoading ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />}
                          {item.status === 'dispensed' ? 'จ่ายแล้ว' : 'ยืนยันจ่าย'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
