'use client'

import { useState, useTransition } from 'react'
import { dispenseMaterial, removePlanMaterial } from '@/app/actions/material'
import toast from 'react-hot-toast'

interface RawMaterial {
  id: string
  material_code: string | null
  name: string
  unit: string
  qty_on_hand: number
  weight_per_meter: number | null
  category: string
}

interface PlanInfo {
  id: string
  plan_date: string
  status: string
  total_concrete?: number
  production_orders?: { order_number: string }[]
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
  role?: string
}

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: 'รอจ่าย',   bg: '#FFF7ED', color: '#EA580C' },
  partial:   { label: 'จ่ายบางส่วน', bg: '#EFF6FF', color: '#2563EB' },
  dispensed: { label: 'จ่ายแล้วครบถ้วน', bg: '#F0FDF4', color: '#16A34A' },
}

import MaterialDocumentModal from '@/components/shared/MaterialDocumentModal'

export default function MaterialClient({ initialData, role }: Props) {
  const [items, setItems] = useState<Requisition[]>(initialData)
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()
  const [activeId, setActiveId] = useState<string | null>(null)
  
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'partial' | 'dispensed'>('all')
  const [activeTab, setActiveTab] = useState<'today' | 'history'>('today')
  const [printModalPlanId, setPrintModalPlanId] = useState<string | null>(null)


  const handleDispense = (item: Requisition) => {
    const qty = parseFloat(qtyMap[item.id] ?? '0')
    if (!qty || qty <= 0) {
      toast.error('กรุณาระบุจำนวนที่ต้องการจ่าย')
      return
    }

    // ใช้ weight_per_meter จากฐานข้อมูลโดยตรง แทนการ parse regex
    const isWire = item.raw_material?.category === 'ลวด' || item.raw_material?.category === 'Wire'
    const wireFactor = item.raw_material?.weight_per_meter ?? 0.0989
    const requiredTarget = isWire ? item.qty_required * wireFactor : item.qty_required

    setActiveId(item.id)
    startTransition(async () => {
      try {
        await dispenseMaterial(item.id, qty)
        toast.success(`จ่าย ${qty} ${item.raw_material?.unit ?? ''} เรียบร้อย`)
        setQtyMap(prev => ({ ...prev, [item.id]: '' }))
        // Optimistically update
        setItems(prev =>
          prev.map(r => {
            if (r.id === item.id) {
              const newQtyDispensed = r.qty_dispensed + qty;
              return {
                ...r,
                qty_dispensed: newQtyDispensed,
                status: newQtyDispensed >= (requiredTarget - 0.01) ? 'dispensed' : 'partial',
              }
            }
            return r;
          })
        )
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setActiveId(null)
      }
    })
  }

  const handleDelete = (item: Requisition) => {
    if (!window.confirm(`ยืนยันการลบรายการเบิกจ่าย ${item.raw_material?.name} หรือไม่?`)) return

    setActiveId(item.id)
    startTransition(async () => {
      try {
        await removePlanMaterial(item.id)
        toast.success('ลบรายการเรียบร้อยแล้ว')
        setItems(prev => prev.filter(r => r.id !== item.id))
      } catch (e) {
        toast.error('ไม่สามารถลบได้: ' + (e as Error).message)
      } finally {
        setActiveId(null)
      }
    })
  }

  const filteredItems = items.filter(i => activeFilter === 'all' || i.status === activeFilter)

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
  const grouped = filteredItems.reduce<Record<string, { plan: PlanInfo | null; items: Requisition[] }>>((acc, item) => {
    const key = item.plan_id
    if (!acc[key]) acc[key] = { plan: item.plan, items: [] }
    acc[key].items.push(item)
    return acc
  }, {})

  // Precompute plan completion status (a plan is complete if ALL its items are dispensed)
  const planCompletionStatus: Record<string, boolean> = {}
  items.forEach(i => {
    if (planCompletionStatus[i.plan_id] === undefined) planCompletionStatus[i.plan_id] = true
    if (i.status !== 'dispensed') planCompletionStatus[i.plan_id] = false
  })

  // Sort groups by plan_date descending, and filter by activeTab
  const sortedGroups = Object.entries(grouped)
    .filter(([planId]) => {
      const isCompleted = planCompletionStatus[planId]
      return activeTab === 'today' ? !isCompleted : isCompleted
    })
    .sort((a, b) => {
      const dateA = a[1].plan?.plan_date || ''
      const dateB = b[1].plan?.plan_date || ''
      return dateB.localeCompare(dateA)
    })

  // Prepare data for the print modal if open
  const activePlanGroup = printModalPlanId ? grouped[printModalPlanId] : null
  const activePlanItems = activePlanGroup ? items.filter(i => i.plan_id === printModalPlanId) : [] // always use all items for the document
  let totalMesh = 0;
  let totalRebar = 0;
  const wireGroups: Record<string, number> = {};
  
  if (activePlanItems.length > 0) {
    activePlanItems.forEach(i => {
      const isWire = i.raw_material?.category === 'ลวด' || i.raw_material?.category === 'Wire'
      const isMesh = i.raw_material?.category === 'เมช' || i.raw_material?.category === 'Mesh'
      const isRebar = i.raw_material?.category === 'เหล็กเส้น'
      
      const wireFactor = i.raw_material?.weight_per_meter ?? 0.0989
      const requiredWeight = isWire ? i.qty_required * wireFactor : i.qty_required
      
      if (isMesh) totalMesh += i.qty_required; // use required, not weight if it's sqm
      if (isRebar) totalRebar += i.qty_required;
      if (isWire) {
        const name = i.raw_material?.name || 'ลวดอัดแรง (PC Wire)'
        wireGroups[name] = (wireGroups[name] || 0) + i.qty_required // using length
      }
    });
  }
  const wireEntries = Object.entries(wireGroups);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid #E5E7EB', paddingBottom: 16 }}>
        <button
          onClick={() => setActiveTab('today')}
          style={{
            padding: '10px 24px', borderRadius: 50, fontSize: 14, fontWeight: 700,
            cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8,
            background: activeTab === 'today' ? '#2563EB' : '#fff',
            color: activeTab === 'today' ? '#fff' : '#6B7280',
            border: activeTab === 'today' ? 'none' : '1px solid #E5E7EB',
            boxShadow: activeTab === 'today' ? '0 4px 12px rgba(37,99,235,0.2)' : 'none',
          }}
        >
          <i className="fas fa-clipboard-list"></i> รายการเบิกจ่าย
        </button>
        <button
          onClick={() => setActiveTab('history')}
          style={{
            padding: '10px 24px', borderRadius: 50, fontSize: 14, fontWeight: 700,
            cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8,
            background: activeTab === 'history' ? '#475569' : '#fff',
            color: activeTab === 'history' ? '#fff' : '#6B7280',
            border: activeTab === 'history' ? 'none' : '1px solid #E5E7EB',
            boxShadow: activeTab === 'history' ? '0 4px 12px rgba(71,85,105,0.2)' : 'none',
          }}
        >
          <i className="fas fa-history"></i> ประวัติย้อนหลัง
        </button>
      </div>

      {/* Summary Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[
          { id: 'all',       label: 'รายการทั้งหมด',     value: items.length,                                  icon: 'fa-list', color: '#2563EB', bg: '#EFF4FF' },
          { id: 'pending',   label: 'รอจ่าย',            value: items.filter(i => i.status === 'pending').length,  icon: 'fa-clock', color: '#EA580C', bg: '#FFF7ED' },
          { id: 'partial',   label: 'จ่ายบางส่วน',       value: items.filter(i => i.status === 'partial').length,  icon: 'fa-exclamation-circle', color: '#D97706', bg: '#FFFBEB' },
          { id: 'dispensed', label: 'จ่ายครบแล้ว',       value: items.filter(i => i.status === 'dispensed').length, icon: 'fa-check-circle', color: '#16A34A', bg: '#F0FDF4' },
        ].map(kpi => (
          <div 
            key={kpi.label} 
            onClick={() => setActiveFilter(kpi.id as any)}
            style={{ 
              background: activeFilter === kpi.id ? kpi.bg : 'var(--surface)', 
              border: activeFilter === kpi.id ? `1px solid ${kpi.color}` : '1px solid var(--border)', 
              borderRadius: 'var(--radius)', 
              padding: '16px 20px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: 14,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: activeFilter === kpi.id ? `0 4px 12px ${kpi.color}15` : 'none',
              transform: activeFilter === kpi.id ? 'translateY(-2px)' : 'none'
            }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: activeFilter === kpi.id ? kpi.color : kpi.bg, color: activeFilter === kpi.id ? '#fff' : kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, transition: 'all 0.2s' }}>
              <i className={`fas ${kpi.icon}`} />
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: activeFilter === kpi.id ? kpi.color : 'var(--text-primary)' }}>{kpi.value}</div>
              <div style={{ fontSize: 12, color: activeFilter === kpi.id ? kpi.color : 'var(--text-muted)', marginTop: 3, fontWeight: activeFilter === kpi.id ? 600 : 400 }}>{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {sortedGroups.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <i className="fas fa-folder-open" style={{ fontSize: 40, opacity: 0.3, marginBottom: 12 }} />
          <p>ไม่มีรายการที่ตรงกับเงื่อนไขในแท็บนี้</p>
        </div>
      )}

      {/* Requisition List grouped by Plan */}
      {sortedGroups.map(([planId, group]) => {
        const planDate = group.plan?.plan_date
          ? new Date(group.plan.plan_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
          : planId.slice(0, 8)
          
        const orderNumbers = group.plan?.production_orders?.map(o => o.order_number).filter(Boolean) || []
        const displayOrderNumber = orderNumbers.length > 0 ? orderNumbers.join(', ') : `#${planId.slice(0, 8).toUpperCase()}`
          
        // Check if all items in this plan are fully dispensed
        const allItemsInPlan = items.filter(i => i.plan_id === planId)
        const isPlanFullyDispensed = allItemsInPlan.every(i => i.status === 'dispensed')

        return (
          <div key={planId} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {/* Plan Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: '#FAFAFA', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <i className="fas fa-calendar-alt" style={{ color: 'var(--accent)', fontSize: 14 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                แผนการผลิต: {planDate}
              </span>
              
              <div style={{ padding: '2px 8px', background: '#DBEAFE', color: '#1D4ED8', borderRadius: 4, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="fas fa-hashtag" /> {displayOrderNumber}
              </div>

              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                ({group.items.length} รายการ)
              </span>
              
              <button 
                onClick={() => setPrintModalPlanId(planId)}
                style={{
                  marginLeft: 'auto',
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 6,
                  fontSize: 12, fontWeight: 600,
                  background: isPlanFullyDispensed ? 'rgba(37,99,235,0.1)' : '#111827',
                  color: isPlanFullyDispensed ? '#2563EB' : '#fff',
                  border: isPlanFullyDispensed ? '1px solid rgba(37,99,235,0.2)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}>
                <i className={isPlanFullyDispensed ? "fas fa-file-invoice" : "fas fa-print"} />
                {isPlanFullyDispensed ? 'เรียกดูเอกสารย้อนหลัง' : 'ออกเอกสารเบิกจ่าย'}
              </button>
            </div>

            {/* Material Items */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
              <thead>
                <tr>
                  {['วัตถุดิบ', 'ความยาว (ถ้ามี)', 'ต้องใช้ (น้ำหนัก)', 'จ่ายแล้ว', 'สต็อกคงเหลือ', 'สถานะ', 'จ่ายเพิ่ม', 'ยืนยัน'].map((th, i) => (
                    <th key={th + i} style={{
                      fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
                      letterSpacing: '0.05em', padding: '10px 16px', textAlign: 'left',
                      borderBottom: '1px solid var(--border)',
                    }}>{th}</th>
                  ))}
                  {role === 'admin' && (
                    <th style={{
                      fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
                      letterSpacing: '0.05em', padding: '10px 16px', textAlign: 'center',
                      borderBottom: '1px solid var(--border)',
                    }}>ลบ</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {group.items.map(item => {
                  const isWire = item.raw_material?.category === 'ลวด' || item.raw_material?.category === 'Wire'
                  const stockUnit = item.raw_material?.unit ?? ''
                  const wireFactor = item.raw_material?.weight_per_meter ?? 0.0989
                  const requiredWeight = isWire ? item.qty_required * wireFactor : item.qty_required
                  const remainingWeight = requiredWeight - item.qty_dispensed
                  const stockOk = (item.raw_material?.qty_on_hand ?? 0) >= remainingWeight

                  const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.pending
                  const isLoading = activeId === item.id && isPending

                  return (
                    <tr key={item.id}>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {item.raw_material?.material_code && (
                            <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--accent)', background: 'var(--bg)', padding: '1px 5px', borderRadius: 3, marginRight: 6 }}>
                              {item.raw_material.material_code}
                            </span>
                          )}
                          {item.raw_material?.name ?? '—'}
                        </div>
                        {item.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{item.notes}</div>}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', fontFamily: 'monospace' }}>
                        {isWire ? `${item.qty_required.toLocaleString(undefined, { maximumFractionDigits: 2 })} เมตร` : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', fontFamily: 'monospace' }}>
                        {requiredWeight.toLocaleString(undefined, { maximumFractionDigits: 2 })} {stockUnit}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', fontFamily: 'monospace', color: item.qty_dispensed > 0 ? '#16A34A' : 'var(--text-muted)' }}>
                        {item.qty_dispensed.toLocaleString(undefined, { maximumFractionDigits: 2 })} {stockUnit}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', fontFamily: 'monospace', color: stockOk ? 'var(--text-primary)' : '#EF4444' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {!stockOk && <i className="fas fa-exclamation-triangle" style={{ fontSize: 11 }} title="สต็อกอาจไม่เพียงพอ (อิงจากอัตราส่วนน้ำหนักสำหรับลวด)" />}
                          {(item.raw_material?.qty_on_hand ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {stockUnit}
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
                          placeholder={`จำนวน (${stockUnit})`}
                          value={qtyMap[item.id] ?? ''}
                          onChange={e => setQtyMap(prev => ({ ...prev, [item.id]: e.target.value }))}
                          style={{
                            width: 130, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
                            fontSize: 13, fontFamily: 'monospace', outline: 'none',
                          }}
                          min={0}
                          max={remainingWeight}
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
                          {item.status === 'dispensed' ? 'จ่ายแล้วครบถ้วน' : 'ยืนยันจ่าย'}
                        </button>
                      </td>
                      {role === 'admin' && (
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDelete(item)}
                            disabled={isLoading}
                            style={{
                              padding: '6px', borderRadius: 6, fontSize: 13,
                              background: 'transparent',
                              color: '#EF4444', border: '1px solid #EF4444',
                              cursor: isLoading ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              opacity: isLoading ? 0.5 : 1
                            }}
                            title="ลบรายการ (Admin)"
                          >
                            <i className="fas fa-trash-alt" />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>
        )
      })}
      
      {activePlanGroup && activePlanGroup.plan && (() => {
        const orderNumbers = activePlanGroup.plan.production_orders?.map(o => o.order_number).filter(Boolean) || []
        const modalOrderNumber = orderNumbers.length > 0 ? orderNumbers.join(', ') : activePlanGroup.plan.id.slice(0, 8).toUpperCase()
        
        return (
          <MaterialDocumentModal
            isOpen={printModalPlanId !== null}
            onClose={() => setPrintModalPlanId(null)}
            orderNumber={modalOrderNumber}
            date={new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
            time={new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
            userFullName="เจ้าหน้าที่เบิกจ่าย"
            totalConcrete={activePlanGroup.plan.total_concrete ?? 0}
            planItems={activePlanItems}
          />
        )
      })()}
    </div>
  )
}
