'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { deleteProductionPlan } from '@/app/actions/planner'
import PoDocumentModal from '@/components/shared/PoDocumentModal'

interface Plan {
  id: string
  plan_date: string
  status: string
  total_qty: number | null
  total_concrete: number | null
  created_at: string
  profile: { full_name: string; role: string } | { full_name: string; role: string }[] | null
  items: { id: string }[]
  production_orders?: { order_number: string; status: string }[]
}

interface Props {
  plans: Plan[]
  userRole?: string
}

const STATUS_CONFIG = {
  draft: {
    label: 'แบบร่าง',
    icon: 'fa-pencil-alt',
    bg: '#F9FAFB',
    text: '#6B7280',
    badgeBg: '#F3F4F6',
    badgeBorder: '#E5E7EB',
    badgeText: '#6B7280',
    kpiBg: '#F9FAFB',
    kpiBorder: '#E5E7EB',
    kpiText: '#6B7280',
    ring: 'rgba(107,114,128,0.25)',
  },
  confirmed: {
    label: 'สั่งผลิตแล้ว',
    icon: 'fa-check-circle',
    bg: '#EFF6FF',
    text: '#2563EB',
    badgeBg: '#DBEAFE',
    badgeBorder: '#BFDBFE',
    badgeText: '#1D4ED8',
    kpiBg: '#EFF6FF',
    kpiBorder: '#BFDBFE',
    kpiText: '#2563EB',
    ring: 'rgba(37,99,235,0.2)',
  },
  in_progress: {
    label: 'กำลังผลิต',
    icon: 'fa-industry',
    bg: '#FFFBEB',
    text: '#D97706',
    badgeBg: '#FEF3C7',
    badgeBorder: '#FDE68A',
    badgeText: '#B45309',
    kpiBg: '#FFFBEB',
    kpiBorder: '#FDE68A',
    kpiText: '#D97706',
    ring: 'rgba(217,119,6,0.2)',
  },
  completed: {
    label: 'ผลิตเสร็จสิ้น',
    icon: 'fa-flag-checkered',
    bg: '#ECFDF5',
    text: '#059669',
    badgeBg: '#D1FAE5',
    badgeBorder: '#A7F3D0',
    badgeText: '#065F46',
    kpiBg: '#ECFDF5',
    kpiBorder: '#A7F3D0',
    kpiText: '#059669',
    ring: 'rgba(5,150,105,0.2)',
  },
} as const

type StatusKey = keyof typeof STATUS_CONFIG

type ProfileShape = { full_name: string; role: string }

function getStatus(s: string): StatusKey {
  if (s in STATUS_CONFIG) return s as StatusKey
  return 'draft'
}

function getProfile(p: ProfileShape | ProfileShape[] | null): ProfileShape | null {
  if (!p) return null
  if (Array.isArray(p)) return p[0] ?? null
  return p
}

export default function ProductionOrdersClient({ plans, userRole = 'worker' }: Props) {
  const [activeStatus, setActiveStatus] = useState<StatusKey | 'all'>('all')
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [printModalPlanId, setPrintModalPlanId] = useState<string | null>(null)

  const handleDelete = (planId: string, orderNumber: string) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบใบสั่งผลิต ${orderNumber} ?\nการกระทำนี้จะลบข้อมูลที่เกี่ยวข้องทั้งหมดและไม่สามารถย้อนกลับได้`)) return

    setDeletingId(planId)
    startTransition(async () => {
      try {
        const res = await deleteProductionPlan(planId)
        if (res.success) {
          toast.success(`ลบใบสั่งผลิต ${orderNumber} สำเร็จ`)
        } else {
          toast.error(res.error || 'ไม่สามารถลบใบสั่งผลิตได้')
        }
      } catch (err) {
        toast.error('เกิดข้อผิดพลาดในการลบข้อมูล')
      } finally {
        setDeletingId(null)
      }
    })
  }

  // KPI counts
  const counts = useMemo(() => ({
    all: plans.length,
    draft: plans.filter(p => getStatus(p.status) === 'draft').length,
    confirmed: plans.filter(p => getStatus(p.status) === 'confirmed').length,
    in_progress: plans.filter(p => getStatus(p.status) === 'in_progress').length,
    completed: plans.filter(p => getStatus(p.status) === 'completed').length,
  }), [plans])

  // Filtered list
  const filtered = useMemo(() => {
    return plans.filter(p => {
      const matchStatus = activeStatus === 'all' || getStatus(p.status) === activeStatus
      const po = Array.isArray(p.production_orders) ? p.production_orders[0] : null
      const orderNumber = po?.order_number || `ไม่มี PO (#${p.id.slice(0, 8).toUpperCase()})`
      const profile = getProfile(p.profile)
      const matchSearch = !search.trim() ||
        orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        (profile?.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        p.plan_date.includes(search)
      return matchStatus && matchSearch
    })
  }, [plans, activeStatus, search])

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: '#F7F8FA', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── KPI Cards Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {/* All */}
        <button
          onClick={() => setActiveStatus('all')}
          style={{
            padding: '16px 18px',
            borderRadius: 12,
            border: `2px solid ${activeStatus === 'all' ? '#BFDBFE' : 'transparent'}`,
            background: '#EFF6FF',
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'all 0.15s',
            boxShadow: activeStatus === 'all' ? '0 0 0 3px rgba(37,99,235,0.2)' : '0 1px 2px rgba(0,0,0,0.05)',
            opacity: activeStatus === 'all' ? 1 : 0.6,
            filter: activeStatus === 'all' ? 'none' : 'grayscale(0.4)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <i className="fas fa-list" style={{ fontSize: 16, color: '#2563EB' }}></i>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#2563EB', lineHeight: 1 }}>{counts.all}</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', opacity: 0.8, letterSpacing: '0.03em' }}>ทั้งหมด</div>
        </button>

        {(['draft', 'confirmed', 'in_progress', 'completed'] as StatusKey[]).map(key => {
          const cfg = STATUS_CONFIG[key]
          const isActive = activeStatus === key
          return (
            <button
              key={key}
              onClick={() => setActiveStatus(isActive ? 'all' : key)}
              style={{
                padding: '16px 18px',
                borderRadius: 12,
                border: `2px solid ${isActive ? cfg.kpiBorder : 'transparent'}`,
                background: cfg.kpiBg,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s',
                boxShadow: isActive ? `0 0 0 3px ${cfg.ring}` : '0 1px 2px rgba(0,0,0,0.05)',
                opacity: activeStatus === 'all' || isActive ? 1 : 0.6,
                filter: activeStatus === 'all' || isActive ? 'none' : 'grayscale(0.4)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <i className={`fas ${cfg.icon}`} style={{ fontSize: 16, color: cfg.kpiText }}></i>
                <span style={{ fontSize: 28, fontWeight: 900, color: cfg.kpiText, lineHeight: 1 }}>{counts[key]}</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: cfg.text, opacity: 0.8, letterSpacing: '0.03em' }}>{cfg.label}</div>
            </button>
          )
        })}
      </div>

      {/* ── Table Card ── */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* Table Header Bar */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: 0 }}>
              {activeStatus === 'all' ? 'รายการสั่งผลิตทั้งหมด' : `รายการ: ${STATUS_CONFIG[activeStatus].label}`}
            </h2>
            <p style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
              แสดง {filtered.length} รายการ {search ? `(ค้นหา: "${search}")` : ''}
            </p>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#9CA3AF' }}></i>
            <input
              type="text"
              placeholder="ค้นหาเลขที่ PO, วันที่, ผู้อนุมัติ..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                paddingLeft: 32, paddingRight: 12, height: 36,
                border: '1px solid #E5E7EB', borderRadius: 8,
                fontSize: 12, width: 260, outline: 'none', color: '#374151',
                background: '#F9FAFB',
              }}
            />
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '80px 24px', textAlign: 'center' }}>
              <i className="fas fa-file-invoice" style={{ fontSize: 48, color: '#E5E7EB', display: 'block', marginBottom: 16 }}></i>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#9CA3AF' }}>ไม่พบรายการ</div>
              <div style={{ fontSize: 12, color: '#D1D5DB', marginTop: 4 }}>
                {activeStatus !== 'all' ? `ยังไม่มีใบสั่งผลิตที่มีสถานะ "${STATUS_CONFIG[activeStatus].label}"` : 'ยังไม่มีใบสั่งผลิตในระบบ'}
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                  <th style={thStyle}>เลขที่ PO</th>
                  <th style={thStyle}>วันที่แผนผลิต</th>
                  <th style={thStyle}>สร้างเมื่อ</th>
                  <th style={thStyle}>ผู้อนุมัติ</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>รายการ</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>ชิ้นงานรวม</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>สถานะ</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((plan, idx) => {
                  const po = Array.isArray(plan.production_orders) ? plan.production_orders[0] : null
                  const orderNumber = po?.order_number || `ไม่มี PO (#${plan.id.slice(0, 8).toUpperCase()})`
                  const statusKey = getStatus(plan.status)
                  const cfg = STATUS_CONFIG[statusKey]
                  const itemCount = (plan.items ?? []).length

                  return (
                    <tr
                      key={plan.id}
                      style={{
                        borderBottom: '1px solid #F3F4F6',
                        background: idx % 2 === 0 ? '#fff' : '#FAFAFA',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F0F7FF')}
                      onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#FAFAFA')}
                    >
                      {/* Order Number */}
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#111827', letterSpacing: '0.02em' }}>
                          {orderNumber}
                        </span>
                      </td>

                      {/* Plan Date */}
                      <td style={{ padding: '14px 20px', color: '#374151', fontWeight: 500 }}>
                        {fmtDate(plan.plan_date)}
                      </td>

                      {/* Created At */}
                      <td style={{ padding: '14px 20px', color: '#6B7280', fontSize: 12 }}>
                        {fmtDateTime(plan.created_at)}
                      </td>

                      {/* Approver */}
                      <td style={{ padding: '14px 20px' }}>
                        {(() => {
                          const prof = getProfile(plan.profile)
                          return prof?.full_name ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 28, height: 28, borderRadius: '50%', background: '#DBEAFE',
                                color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 11, fontWeight: 700, flexShrink: 0,
                              }}>
                                {prof.full_name.charAt(0)}
                              </div>
                              <span style={{ color: '#374151', fontWeight: 500, fontSize: 13 }}>{prof.full_name}</span>
                            </div>
                          ) : (
                            <span style={{ color: '#9CA3AF' }}>—</span>
                          )
                        })()}
                      </td>

                      {/* Item Count */}
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>{itemCount}</span>
                        <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 3 }}>รายการ</span>
                      </td>

                      {/* Total Qty */}
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#2563EB' }}>
                          {(plan.total_qty ?? 0).toLocaleString()}
                        </span>
                        <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 3 }}>ชิ้น</span>
                      </td>

                      {/* Status Badge */}
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '4px 12px', borderRadius: 50,
                          fontSize: 11, fontWeight: 700,
                          background: cfg.badgeBg,
                          color: cfg.badgeText,
                          border: `1px solid ${cfg.badgeBorder}`,
                          whiteSpace: 'nowrap',
                        }}>
                          <i className={`fas ${cfg.icon}`} style={{ fontSize: 10 }}></i>
                          {cfg.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                          <button
                            onClick={() => setPrintModalPlanId(plan.id)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '6px 16px', borderRadius: 8,
                              background: '#EFF6FF', color: '#2563EB',
                              fontSize: 12, fontWeight: 700,
                              border: '1px solid #BFDBFE',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                              whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = '#DBEAFE'
                              e.currentTarget.style.borderColor = '#93C5FD'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = '#EFF6FF'
                              e.currentTarget.style.borderColor = '#BFDBFE'
                            }}
                          >
                            <i className="fas fa-eye" style={{ fontSize: 11 }}></i>
                            ดูรายละเอียด
                          </button>

                          {userRole === 'admin' && (
                            <button
                              onClick={() => handleDelete(plan.id, orderNumber)}
                              disabled={isPending && deletingId === plan.id}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '6px 16px', borderRadius: 8,
                                background: '#FEF2F2', color: '#DC2626',
                                fontSize: 12, fontWeight: 700,
                                border: '1px solid #FECACA',
                                cursor: (isPending && deletingId === plan.id) ? 'not-allowed' : 'pointer',
                                opacity: (isPending && deletingId === plan.id) ? 0.6 : 1,
                                transition: 'all 0.15s',
                                whiteSpace: 'nowrap',
                              }}
                              onMouseEnter={e => {
                                if (isPending && deletingId === plan.id) return
                                e.currentTarget.style.background = '#FEE2E2'
                                e.currentTarget.style.borderColor = '#FCA5A5'
                              }}
                              onMouseLeave={e => {
                                if (isPending && deletingId === plan.id) return
                                e.currentTarget.style.background = '#FEF2F2'
                                e.currentTarget.style.borderColor = '#FECACA'
                              }}
                            >
                              {isPending && deletingId === plan.id ? (
                                <i className="fas fa-spinner fa-spin" style={{ fontSize: 11 }}></i>
                              ) : (
                                <i className="fas fa-trash-alt" style={{ fontSize: 11 }}></i>
                              )}
                              ลบข้อมูล
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Table Footer */}
        {filtered.length > 0 && (
          <div style={{
            padding: '10px 20px',
            borderTop: '1px solid #F3F4F6',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#FAFAFA',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>
              แสดง {filtered.length} จาก {plans.length} รายการทั้งหมด
            </span>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>
              รวมชิ้นงาน:{' '}
              <strong style={{ color: '#2563EB' }}>
                {filtered.reduce((s, p) => s + (p.total_qty ?? 0), 0).toLocaleString()}
              </strong>{' '}
              ชิ้น
            </span>
          </div>
        )}
      </div>

      <PoDocumentModal
        isOpen={printModalPlanId !== null}
        onClose={() => setPrintModalPlanId(null)}
        planId={printModalPlanId}
      />
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
