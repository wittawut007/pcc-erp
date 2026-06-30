'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supplyConcreteRound, deleteConcreteOrder } from '@/app/actions/concrete'
import toast from 'react-hot-toast'

interface RoundItem {
  id: string
  round_number: number
  qty_per_round: number
  status: string
  supplied_at: string | null
  supplier?: { full_name: string } | null
}

interface ConcreteOrder {
  id: string
  bed: string | null
  qty_requested: number
  round_count: number
  status: string
  requested_at: string
  supplied_at: string | null
  notes?: string | null
  concrete_group?: string | null
  phase?: string | null
  requested_by_profile?: { full_name: string; employee_code?: string | null } | null
  supplied_by_profile?: { full_name: string } | null
  job_order?: {
    id: string
    bed: string
    qty_target: number
    production_order?: { order_number: string; status: string } | null
    plan_item?: { product?: { name: string; code: string; concrete_per_unit?: number; concrete_group?: string | null } | null } | null
  } | null
  rounds?: RoundItem[]
  bed_jobs?: any[]
}

interface Props {
  pending: ConcreteOrder[]
  history: ConcreteOrder[]
  selectedDate: string
  today: string
  userRole?: string
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontWeight: 700,
  color: '#6B7280',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDateInput(iso: string) {
  return iso.split('T')[0]
}

// ── Round Card inside each order ──────────────────────────────────────────────
function RoundRow({
  round, onSupply, loading, isLocked, isNext, concreteGroup,
}: {
  round: RoundItem
  onSupply: (id: string) => void
  loading: boolean
  isLocked: boolean
  isNext: boolean
  concreteGroup?: string | null
}) {
  const supplied = round.status === 'supplied' || round.status === 'received'
  const isReceived = round.status === 'received'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px',
      borderBottom: '1px solid #F3F4F6',
      background: supplied ? '#F0FDF4' : isNext ? '#FAFEFF' : '#FAFAFA',
      opacity: isLocked ? 0.45 : 1,
    }}>
      {/* Round badge */}
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: supplied ? '#D1FAE5' : isNext ? '#EFF6FF' : '#F3F4F6',
        color: supplied ? '#059669' : isNext ? '#2563EB' : '#9CA3AF',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 13,
      }}>
        {supplied
          ? <i className="fas fa-check" />
          : isLocked
          ? <i className="fas fa-lock" style={{ fontSize: 11 }} />
          : round.round_number}
      </div>

      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: isLocked ? '#9CA3AF' : '#374151' }}>
          รอบที่ {round.round_number}
          {concreteGroup && (
            <span style={{ fontWeight: 600, color: isReceived ? '#059669' : isLocked ? '#9CA3AF' : '#4B5563', marginLeft: 4 }}>
              ({concreteGroup})
            </span>
          )}
        </span>
        <span style={{ fontSize: 16, fontWeight: 800, color: isLocked ? '#9CA3AF' : '#2563EB', marginLeft: 10 }}>
          ({round.qty_per_round.toFixed(2)} คิว)
        </span>
        {isNext && !supplied && <div style={{ fontSize: 11, color: '#3B82F6', fontWeight: 600, marginTop: 2 }}>รอบถัดไป</div>}
        {isLocked && <div style={{ fontSize: 11, color: '#D1D5DB', fontWeight: 600, marginTop: 2 }}>รอรอบก่อนหน้า</div>}
      </div>

      {supplied ? (
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: isReceived ? '#059669' : '#D97706', fontSize: 12, fontWeight: 600 }}>
            <i className={isReceived ? "fas fa-check-double" : "fas fa-truck"} style={{ fontSize: 13 }} />
            {isReceived ? 'พนักงานรับแล้ว' : 'ส่งแล้ว (รอรับ)'}
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8' }}>{fmtTime(round.supplied_at)}</div>
          {round.supplier?.full_name && <div style={{ fontSize: 11, color: '#94A3B8' }}>โดย {round.supplier.full_name}</div>}
        </div>
      ) : isLocked ? (
        <div style={{ fontSize: 12, color: '#D1D5DB', fontWeight: 600 }}>ล็อค</div>
      ) : (
        <button
          onClick={() => onSupply(round.id)}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 18px', borderRadius: 8,
            background: loading ? '#93C5FD' : '#2563EB', color: '#fff',
            border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
          }}
        >
          {loading ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />}
          ยืนยันจ่าย
        </button>
      )}
    </div>
  )
}

// ── Order Card (expandable) ───────────────────────────────────────────────────
function OrderCard({ order, onSupply, loadingRoundId, onDelete, isDeleting }: {
  order: ConcreteOrder
  onSupply: (roundId: string) => void
  loadingRoundId: string | null
  onDelete?: (orderId: string, bed: string | null, jobOrderId: string | null) => void
  isDeleting?: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const rounds = order.rounds ?? []
  const suppliedCount = rounds.filter(r => r.status === 'supplied' || r.status === 'received').length
  const receivedCount = rounds.filter(r => r.status === 'received').length
  const totalRounds = order.round_count
  const pct = totalRounds > 0 ? Math.round((suppliedCount / totalRounds) * 100) : 0
  const product = order.job_order?.plan_item?.product
  const nextPending = rounds.find(r => r.status === 'pending')
  // ดึง PO number จาก job_order หรือ bed_jobs ตัวแรก
  const orderNumber =
    order.job_order?.production_order?.order_number ||
    order.bed_jobs?.[0]?.production_order?.order_number ||
    null

  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
          background: '#F9FAFB', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
          borderBottom: expanded ? '1px solid #E5E7EB' : 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <i className={`fas fa-chevron-${expanded ? 'down' : 'right'}`} style={{ fontSize: 11, color: '#9CA3AF', width: 12, flexShrink: 0 }} />

        {/* Bed badge */}
        <div style={{ backgroundColor: '#2563EB', color: '#fff', padding: '16px 20px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: '90px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, opacity: 0.9 }}>โรงผลิต</span>
          <span style={{ fontSize: 18, lineHeight: 1 }}>{order.bed ?? '?' }</span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {order.bed_jobs && order.bed_jobs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {order.bed_jobs.map((job, idx) => {
                const jProduct = job.plan_item?.product
                const sizeStr = jProduct?.size && jProduct?.size !== '-' ? ` ขนาด ${jProduct.size}` : ''
                return (
                  <div key={job.id} style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>
                    <span style={{ color: '#2563EB' }}>{jProduct?.name ?? '—'}</span>
                    {sizeStr} จำนวน <span style={{ color: '#059669' }}>{job.qty_target}</span> {jProduct?.unit ?? 'ชิ้น'}
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>{product?.name ?? `สั่งคอนกรีตรวมโรงผลิต ${order.bed ?? '?'}`}</div>
          )}
          <div style={{ fontSize: 12, color: '#6B7280', display: 'flex', gap: 12, marginTop: 4 }}>
            <span><i className="fas fa-user" style={{ marginRight: 4, fontSize: 10 }} />{order.requested_by_profile?.full_name ?? '—'}</span>
            <span><i className="fas fa-clock" style={{ marginRight: 4, fontSize: 10 }} />{fmtTime(order.requested_at)}</span>
            {orderNumber && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#EFF6FF', color: '#1D4ED8',
                border: '1px solid #BFDBFE', borderRadius: 6,
                padding: '1px 8px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700
              }}>
                <i className="fas fa-file-alt" style={{ fontSize: 9 }} />
                {orderNumber}
              </span>
            )}
          </div>
          {order.notes && (
            <div style={{ marginTop: 4, fontSize: 11, color: '#D97706', fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
              <i className="fas fa-exclamation-circle" style={{ marginTop: 3, flexShrink: 0 }} />
              <span>{order.notes}</span>
            </div>
          )}
          {/* Phase Badge */}
          {order.phase && order.phase !== 'main' && (
            <div style={{ marginTop: 6 }}>
              <span style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: 5, 
                padding: '3px 10px', 
                borderRadius: 20, 
                background: order.phase === 'counterfort' ? '#FFF7ED' : '#F5F3FF', 
                color: order.phase === 'counterfort' ? '#C2410C' : '#7C3AED', 
                fontSize: 11, 
                fontWeight: 700,
                border: `1px solid ${order.phase === 'counterfort' ? '#FED7AA' : '#DDD6FE'}`
              }}>
                {order.phase === 'counterfort' ? '🏗️ เฟส 1: CF (ฐานเกือก)' : '🧱 เฟส 2: STEM (ผนัง L-Wall)'}
              </span>
            </div>
          )}
          {/* Concrete Group Badge */}
          {(order.concrete_group || product?.concrete_group || order.bed_jobs?.[0]?.plan_item?.product?.concrete_group) && (
            <div style={{ marginTop: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: '#DBEAFE', color: '#1D4ED8', fontSize: 11, fontWeight: 700 }}>
                <i className="fas fa-fill-drip" style={{ fontSize: 9 }} />
                {order.concrete_group || product?.concrete_group || order.bed_jobs?.[0]?.plan_item?.product?.concrete_group}
              </span>
            </div>
          )}
        </div>

        {/* Volume & Progress */}
        <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', lineHeight: 1 }}>
              {order.qty_requested.toFixed(2)} <span style={{ fontSize: 12, fontWeight: 400, color: '#9CA3AF' }}>คิว</span>
            </div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
              จ่าย {suppliedCount}/{totalRounds} (รับแล้ว {receivedCount})
            </div>
            <div style={{ width: 120, height: 4, background: '#E5E7EB', borderRadius: 99, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#10B981' : '#2563EB', borderRadius: 99, transition: 'width 0.4s' }} />
            </div>
          </div>
          {onDelete && (
            <button
              disabled={isDeleting}
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบคำสั่งคอนกรีตนี้? (สถานะของงานจะถูกรีเซ็ตเป็นรอเทคอนกรีต)')) {
                  onDelete(order.id, order.bed, order.job_order?.id ?? null);
                }
              }}
              style={{
                background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: 'none',
                width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s', opacity: isDeleting ? 0.5 : 1
              }}
              title="ลบคำสั่งคอนกรีต"
            >
              {isDeleting ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-trash-alt" />}
            </button>
          )}
        </div>
      </div>

      {/* Rounds list */}
      {expanded && (
        <div>
          {rounds.map((r, idx) => {
            const isSupplied = r.status === 'supplied' || r.status === 'received'
            const isNext = !isSupplied && (idx === 0 || rounds[idx - 1]?.status === 'received')
            const isLocked = !isSupplied && !isNext
            const concreteGroup = order.concrete_group || product?.concrete_group || order.bed_jobs?.[0]?.plan_item?.product?.concrete_group
            return (
              <RoundRow
                key={r.id}
                round={r}
                onSupply={onSupply}
                loading={loadingRoundId === r.id}
                isLocked={isLocked}
                isNext={isNext}
                concreteGroup={concreteGroup}
              />
            )
          })}
          {rounds.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>ยังไม่มีข้อมูลรอบ</div>
          )}
          {/* Next round hint */}
          {nextPending && (
            <div style={{ padding: '8px 16px 12px', background: '#FFFBEB', fontSize: 12, color: '#D97706', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fas fa-info-circle" />
              {rounds.find(r => r.status === 'supplied') 
                ? `รอพนักงานกดยืนยันรับรอบที่ ${rounds.find(r => r.status === 'supplied')?.round_number}`
                : `รอบถัดไป: รอบที่ ${nextPending.round_number} (${nextPending.qty_per_round.toFixed(2)} คิว)`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── History Section ───────────────────────────────────────────────────────────
function HistorySection({ orders }: { orders: ConcreteOrder[] }) {
  if (orders.length === 0) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center' }}>
        <i className="fas fa-history" style={{ fontSize: 40, color: '#E5E7EB', display: 'block', marginBottom: 12 }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: '#9CA3AF' }}>ไม่มีข้อมูลในวันที่เลือก</div>
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
            {['เวลาสั่ง', 'โรงผลิต', 'สินค้า', 'ปริมาณ', 'รอบทั้งหมด', 'จ่ายแล้ว', 'ผู้สั่ง', 'สถานะ'].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((o, idx) => {
            const rounds = o.rounds ?? []
            const suppliedCount = rounds.filter(r => r.status === 'supplied' || r.status === 'received').length
            const isAllDone = suppliedCount === o.round_count
            return (
              <tr key={o.id} style={{ borderBottom: '1px solid #F3F4F6', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: 12 }}>{fmtTime(o.requested_at)}</td>
                <td style={{ padding: '12px 16px', fontWeight: 700 }}>โรงผลิต {o.bed ?? '?'}</td>
                <td style={{ padding: '12px 16px' }}>
                  {o.job_order?.plan_item?.product?.name ?? 'สั่งแบบรวม'}
                  {o.notes && (
                    <div style={{ marginTop: 4, fontSize: 10, color: '#D97706', fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                      <i className="fas fa-exclamation-circle" style={{ marginTop: 2, flexShrink: 0 }} />
                      <span>{o.notes}</span>
                    </div>
                  )}
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#2563EB' }}>{o.qty_requested.toFixed(2)} คิว</td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>{o.round_count}</td>
                <td style={{ padding: '12px 16px', textAlign: 'center', color: isAllDone ? '#059669' : '#D97706', fontWeight: 700 }}>{suppliedCount}</td>
                <td style={{ padding: '12px 16px', fontSize: 12 }}>{o.requested_by_profile?.full_name ?? '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 700,
                    background: isAllDone ? '#D1FAE5' : '#FEF3C7',
                    color: isAllDone ? '#065F46' : '#B45309',
                    border: `1px solid ${isAllDone ? '#A7F3D0' : '#FDE68A'}`,
                  }}>
                    {isAllDone ? 'จ่ายครบแล้ว' : `รอจ่าย ${o.round_count - suppliedCount} รอบ`}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ConcreteClient({ pending: initialPending, history: initialHistory, selectedDate, today, userRole }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'queue' | 'today' | 'history'>('queue')
  const [pendingOrders, setPendingOrders] = useState(initialPending)
  const [loadingRoundId, setLoadingRoundId] = useState<string | null>(null)
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null)
  const [historyDate, setHistoryDate] = useState(selectedDate)
  const [isPending, startTransition] = useTransition()

  // Sync local state when server data updates via router.refresh()
  useEffect(() => {
    setPendingOrders(initialPending)
  }, [initialPending])

  // Auto-refresh every 8 seconds for real-time queue updates
  useEffect(() => {
    if (tab === 'history') return
    const interval = setInterval(() => {
      startTransition(() => {
        router.refresh()
      })
    }, 8000)
    return () => clearInterval(interval)
  }, [router, tab])

  const totalPending = pendingOrders.reduce((s, o) => s + (o.rounds ?? []).filter(r => r.status === 'pending').length, 0)
  const todaySupplied = initialHistory.filter(o => o.status === 'supplied').length
  const todayM3 = initialHistory.reduce((s, o) => s + (o.qty_requested ?? 0), 0)

  const handleSupply = useCallback((roundId: string) => {
    setLoadingRoundId(roundId)
    startTransition(async () => {
      try {
        await supplyConcreteRound(roundId)
        toast.success('ยืนยันจ่ายคอนกรีตสำเร็จ')
        // Update local state
        setPendingOrders(prev => prev.map(order => ({
          ...order,
          rounds: (order.rounds ?? []).map(r =>
            r.id === roundId ? { ...r, status: 'supplied', supplied_at: new Date().toISOString() } : r
          ),
        })).filter(order => (order.rounds ?? []).some(r => r.status === 'pending' || r.status === 'supplied')))
        router.refresh()
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setLoadingRoundId(null)
      }
    })
  }, [router])

  const handleDelete = useCallback((orderId: string, bed: string | null, jobOrderId: string | null) => {
    setDeletingOrderId(orderId)
    startTransition(async () => {
      try {
        await deleteConcreteOrder(orderId, bed, jobOrderId)
        toast.success('ลบคำสั่งคอนกรีตเรียบร้อยแล้ว')
        setPendingOrders(prev => prev.filter(o => o.id !== orderId))
        router.refresh()
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setDeletingOrderId(null)
      }
    })
  }, [router])

  const handleDateChange = (date: string) => {
    setHistoryDate(date)
    router.push(`/concrete?date=${date}`)
  }

  const kpis = [
    { label: 'รอบรอจ่าย', value: totalPending, icon: 'fa-hourglass-half', color: '#EA580C', bg: '#FFF7ED' },
    { label: 'จ่ายครบแล้ว', value: todaySupplied, icon: 'fa-check-circle', color: '#16A34A', bg: '#F0FDF4' },
    { label: 'รวม คิว วันนี้', value: todayM3.toFixed(2), icon: 'fa-tint', color: '#2563EB', bg: '#EFF6FF' },
  ]

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    background: active ? '#2563EB' : 'transparent',
    color: active ? '#fff' : '#6B7280',
    border: 'none', transition: 'all 0.15s',
  })

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: '#F7F8FA', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, background: k.bg, color: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
              <i className={`fas ${k.icon}`} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: '#111827' }}>{k.value}</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 4, background: '#F9FAFB' }}>
          <button style={TAB_STYLE(tab === 'queue')} onClick={() => setTab('queue')}>
            <i className="fas fa-fill-drip" style={{ marginRight: 6 }} />
            คิวรออยู่ {totalPending > 0 && <span style={{ background: '#EF4444', color: '#fff', borderRadius: 50, padding: '1px 7px', fontSize: 11, marginLeft: 4 }}>{totalPending}</span>}
          </button>
          <button style={TAB_STYLE(tab === 'today')} onClick={() => setTab('today')}>
            <i className="fas fa-calendar-day" style={{ marginRight: 6 }} />
            วันนี้
          </button>
          <button style={TAB_STYLE(tab === 'history')} onClick={() => setTab('history')}>
            <i className="fas fa-history" style={{ marginRight: 6 }} />
            ย้อนหลัง
          </button>
          {tab === 'history' && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-calendar-alt" style={{ fontSize: 12, color: '#9CA3AF' }} />
              <input
                type="date"
                value={historyDate}
                max={today}
                onChange={e => handleDateChange(e.target.value)}
                style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 10px', fontSize: 13, outline: 'none', color: '#374151', background: '#fff' }}
              />
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: tab === 'queue' ? '20px' : 0 }}>
          {tab === 'queue' && (
            pendingOrders.length === 0 ? (
              <div style={{ padding: '80px 24px', textAlign: 'center' }}>
                <i className="fas fa-check-circle" style={{ fontSize: 48, color: '#10B981', display: 'block', marginBottom: 16 }} />
                <div style={{ fontSize: 16, fontWeight: 700, color: '#374151' }}>ไม่มีคิวรอดำเนินการ</div>
                <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4 }}>จ่ายคอนกรีตครบทุกรอบแล้ว</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {pendingOrders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onSupply={handleSupply}
                    loadingRoundId={loadingRoundId}
                    onDelete={userRole === 'admin' ? handleDelete : undefined}
                    isDeleting={deletingOrderId === order.id}
                  />
                ))}
              </div>
            )
          )}
          {tab === 'today' && <HistorySection orders={initialHistory} />}
          {tab === 'history' && <HistorySection orders={initialHistory} />}
        </div>
      </div>
    </div>
  )
}
