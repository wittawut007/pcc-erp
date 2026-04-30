'use client'

import { useState, useTransition } from 'react'
import { inspectPour, recordDemoldInspection } from '@/app/actions/qc'
import toast from 'react-hot-toast'

type TabType = 'pour' | 'demold'

interface Product { name: string; code: string; category: string }
interface PlanItem { bed: string; product: Product | null }
interface Worker { full_name: string }
interface QCInspection {
  pour_ok: boolean | null
  pour_inspected_at: string | null
  demold_qty_good: number
  demold_qty_defect: number
  demold_inspected_at: string | null
}

interface JobOrder {
  id: string
  bed: string
  qty_target: number
  qty_cast: number
  status: string
  started_at: string | null
  plan_item: PlanItem | null
  worker: Worker | null
  qc_inspection: QCInspection | null
}

interface Props {
  initialData: JobOrder[]
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  casting:     { label: 'กำลังหล่อ',    color: '#2563EB', bg: '#EFF4FF' },
  curing:      { label: 'บ่มคอนกรีต',  color: '#D97706', bg: '#FFFBEB' },
  ready_demold:{ label: 'พร้อมถอดแบบ', color: '#7C3AED', bg: '#F5F3FF' },
  demolded:    { label: 'ถอดแบบแล้ว',  color: '#16A34A', bg: '#F0FDF4' },
}

const DEFECT_OPTIONS = [
  { value: 'crack',     label: 'แตก/ร้าว' },
  { value: 'chip',      label: 'บิ่น/มุมหัก' },
  { value: 'honeycomb', label: 'รอยโพรง (Honeycomb)' },
  { value: 'other',     label: 'อื่นๆ' },
]

export default function QCClient({ initialData }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('pour')
  const [jobs, setJobs] = useState(initialData)
  const [selectedJob, setSelectedJob] = useState<JobOrder | null>(null)
  const [isPending, startTransition] = useTransition()

  // Pour form state
  const [pourOk, setPourOk] = useState<boolean | null>(null)
  const [pourNotes, setPourNotes] = useState('')

  // Demold form state
  const [demoldGood, setDemoldGood] = useState('')
  const [demoldDefect, setDemoldDefect] = useState('')
  const [defectReason, setDefectReason] = useState('')
  const [defectDetail, setDefectDetail] = useState('')

  const pourJobs = jobs.filter(j => ['casting', 'curing'].includes(j.status))
  const demoldJobs = jobs.filter(j => ['ready_demold', 'demolded'].includes(j.status))

  const resetForm = () => {
    setSelectedJob(null)
    setPourOk(null)
    setPourNotes('')
    setDemoldGood('')
    setDemoldDefect('')
    setDefectReason('')
    setDefectDetail('')
  }

  const handlePourSubmit = () => {
    if (!selectedJob || pourOk === null) {
      toast.error('กรุณาเลือกผลการตรวจสอบ')
      return
    }
    startTransition(async () => {
      try {
        await inspectPour(selectedJob.id, pourOk, pourNotes || undefined)
        toast.success('บันทึกผลตรวจการเทคอนกรีตเรียบร้อย')
        setJobs(prev =>
          prev.map(j => j.id === selectedJob.id
            ? { ...j, qc_inspection: { ...j.qc_inspection!, pour_ok: pourOk, pour_inspected_at: new Date().toISOString() } }
            : j
          )
        )
        resetForm()
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  const handleDemoldSubmit = () => {
    if (!selectedJob) return
    const good = parseInt(demoldGood)
    const defect = parseInt(demoldDefect) || 0
    if (!good && good !== 0) { toast.error('กรุณาระบุจำนวนของดี'); return }
    if (defect > 0 && !defectReason) { toast.error('กรุณาระบุสาเหตุของเสีย'); return }

    startTransition(async () => {
      try {
        await recordDemoldInspection(
          selectedJob.id, good, defect,
          defectReason || undefined,
          defectDetail || undefined
        )
        toast.success('บันทึกผลตรวจการถอดแบบเรียบร้อย')
        setJobs(prev => prev.filter(j => j.id !== selectedJob.id))
        resetForm()
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  const currentJobs = activeTab === 'pour' ? pourJobs : demoldJobs

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: '#F3F4F6', borderRadius: 12, padding: 4 }}>
        {[
          { key: 'pour' as const,   icon: 'fa-tint',   label: 'ตรวจการเทปูน',  count: pourJobs.length },
          { key: 'demold' as const, icon: 'fa-hammer', label: 'ตรวจถอดแบบ',    count: demoldJobs.length },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); resetForm() }}
            style={{
              padding: '10px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              background: activeTab === tab.key ? '#fff' : 'transparent',
              color: activeTab === tab.key ? '#DC2626' : '#6B7280',
              boxShadow: activeTab === tab.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.15s',
            }}
          >
            <i className={`fas ${tab.icon}`} />
            {tab.label}
            {tab.count > 0 && (
              <span style={{ background: '#DC2626', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Job Cards */}
      {currentJobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <i className="fas fa-check-circle" style={{ fontSize: 40, color: '#16A34A', display: 'block', marginBottom: 12 }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>ไม่มีรายการรอตรวจสอบ</p>
          <p style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
            {activeTab === 'pour' ? 'ยังไม่มีการเทคอนกรีต' : 'ยังไม่มีการถอดแบบ'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {currentJobs.map(job => {
            const cfg = STATUS_CONFIG[job.status] ?? { label: job.status, color: '#6B7280', bg: '#F3F4F6' }
            const product = job.plan_item?.product
            const isSelected = selectedJob?.id === job.id

            return (
              <div
                key={job.id}
                onClick={() => setSelectedJob(isSelected ? null : job)}
                style={{
                  background: '#fff',
                  border: `2px solid ${isSelected ? '#DC2626' : '#E5E7EB'}`,
                  borderRadius: 14,
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  boxShadow: isSelected ? '0 0 0 4px #FEE2E2' : '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#6B7280', textTransform: 'uppercase' }}>
                      แท่น {job.plan_item?.bed ?? job.bed}
                    </span>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginTop: 2 }}>
                      {product?.name ?? '—'}
                    </div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                      {product?.code ?? ''} · {job.worker?.full_name ?? '—'}
                    </div>
                  </div>
                  <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color, flexShrink: 0 }}>
                    {cfg.label}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  {[
                    { label: 'เป้าหมาย', value: `${job.qty_target} ชิ้น` },
                    { label: 'หล่อแล้ว', value: `${job.qty_cast} ชิ้น` },
                  ].map(stat => (
                    <div key={stat.label} style={{ flex: 1, background: '#F8FAFC', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>{stat.value}</div>
                      <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>{stat.label}</div>
                    </div>
                  ))}
                  {job.qc_inspection?.pour_inspected_at && (
                    <div style={{ flex: 1, background: '#F0FDF4', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#16A34A' }}>
                        <i className="fas fa-check" />
                      </div>
                      <div style={{ fontSize: 10, color: '#16A34A', marginTop: 1 }}>QC ตรวจเทแล้ว</div>
                    </div>
                  )}
                </div>

                {/* Inline Form */}
                {isSelected && (
                  <div
                    style={{ marginTop: 16, borderTop: '1px solid #F3F4F6', paddingTop: 16 }}
                    onClick={e => e.stopPropagation()}
                  >
                    {activeTab === 'pour' ? (
                      /* Pour Form */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0 }}>ผลการตรวจเทคอนกรีต</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {[
                            { value: true,  label: '✅ ผ่าน',  bg: pourOk === true ? '#F0FDF4' : '#F8FAFC', border: pourOk === true ? '#16A34A' : '#E5E7EB', color: pourOk === true ? '#16A34A' : '#6B7280' },
                            { value: false, label: '❌ ไม่ผ่าน', bg: pourOk === false ? '#FEF2F2' : '#F8FAFC', border: pourOk === false ? '#DC2626' : '#E5E7EB', color: pourOk === false ? '#DC2626' : '#6B7280' },
                          ].map(opt => (
                            <button
                              key={String(opt.value)}
                              onClick={() => setPourOk(opt.value)}
                              style={{
                                padding: '12px', borderRadius: 10, border: `2px solid ${opt.border}`,
                                background: opt.bg, color: opt.color, fontSize: 13, fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          placeholder="หมายเหตุ (ถ้ามี)"
                          value={pourNotes}
                          onChange={e => setPourNotes(e.target.value)}
                          rows={2}
                          style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, resize: 'none', fontFamily: 'inherit', outline: 'none' }}
                        />
                        <button
                          onClick={handlePourSubmit}
                          disabled={isPending || pourOk === null}
                          style={{
                            padding: '12px', borderRadius: 10, background: pourOk === null ? '#F3F4F6' : '#DC2626',
                            color: pourOk === null ? '#9CA3AF' : '#fff', fontSize: 14, fontWeight: 700,
                            border: 'none', cursor: pourOk === null ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          }}
                        >
                          {isPending ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-save" />}
                          บันทึกผลการตรวจสอบ
                        </button>
                      </div>
                    ) : (
                      /* Demold Form */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0 }}>บันทึกผลการตรวจถอดแบบ</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#16A34A', display: 'block', marginBottom: 4 }}>จำนวนดี (ชิ้น)</label>
                            <input
                              type="number" min={0} value={demoldGood}
                              onChange={e => setDemoldGood(e.target.value)}
                              placeholder="0"
                              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #16A34A', fontSize: 18, fontWeight: 700, fontFamily: 'monospace', textAlign: 'center', outline: 'none', color: '#16A34A', boxSizing: 'border-box' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#DC2626', display: 'block', marginBottom: 4 }}>จำนวนเสีย (ชิ้น)</label>
                            <input
                              type="number" min={0} value={demoldDefect}
                              onChange={e => setDemoldDefect(e.target.value)}
                              placeholder="0"
                              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #DC2626', fontSize: 18, fontWeight: 700, fontFamily: 'monospace', textAlign: 'center', outline: 'none', color: '#DC2626', boxSizing: 'border-box' }}
                            />
                          </div>
                        </div>
                        {parseInt(demoldDefect) > 0 && (
                          <>
                            <select
                              value={defectReason}
                              onChange={e => setDefectReason(e.target.value)}
                              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                            >
                              <option value="">-- เลือกสาเหตุของเสีย --</option>
                              {DEFECT_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                            <textarea
                              placeholder="รายละเอียดเพิ่มเติม"
                              value={defectDetail}
                              onChange={e => setDefectDetail(e.target.value)}
                              rows={2}
                              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, resize: 'none', fontFamily: 'inherit', outline: 'none' }}
                            />
                          </>
                        )}
                        <button
                          onClick={handleDemoldSubmit}
                          disabled={isPending || !demoldGood}
                          style={{
                            padding: '12px', borderRadius: 10, background: !demoldGood ? '#F3F4F6' : '#DC2626',
                            color: !demoldGood ? '#9CA3AF' : '#fff', fontSize: 14, fontWeight: 700,
                            border: 'none', cursor: !demoldGood ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          }}
                        >
                          {isPending ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-clipboard-check" />}
                          บันทึกผลการตรวจถอดแบบ
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
