'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface JobOrder {
  id: string
  bed: string
  qty_target: number
  qty_cast: number
  status: string
  started_at: string | null
  cast_at: string | null
  expected_demold_at: string | null
  demolded_at: string | null
  created_at: string
  plan_item: {
    qty_target: number
    bed: string
    product: { id: string; code: string; name: string; category: string; unit: string }
  } | null
  worker: { full_name: string; employee_code: string | null } | null
}

interface Worker {
  id: string
  full_name: string
  employee_code: string | null
}

const STATUS_CONFIG = {
  pending:      { label: 'รอเริ่ม',         bg: '#F3F4F6', color: '#6B7280', icon: 'fa-clock', next: 'casting',      nextLabel: 'เริ่มเทปูน' },
  casting:      { label: 'กำลังเท',         bg: 'var(--accent-light)', color: 'var(--accent)', icon: 'fa-truck-monster', next: 'curing',       nextLabel: 'บ่มปูนแล้ว' },
  curing:       { label: 'กำลังบ่ม',        bg: 'var(--amber-light)', color: '#B45309', icon: 'fa-hourglass-half', next: 'ready_demold', nextLabel: 'พร้อมถอดแบบ' },
  ready_demold: { label: 'พร้อมถอดแบบ',    bg: 'var(--green-light)', color: '#059669', icon: 'fa-check-circle', next: 'demolded',     nextLabel: 'ถอดแบบแล้ว' },
  demolded:     { label: 'ถอดแบบแล้ว',     bg: '#F0FDF4', color: '#15803D', icon: 'fa-cubes', next: null,          nextLabel: '' },
  cancelled:    { label: 'ยกเลิก',         bg: 'var(--red-light)', color: 'var(--red)', icon: 'fa-times-circle', next: null, nextLabel: '' },
} as const

export default function JobOrdersClient({ jobOrders: initial, workers }: { jobOrders: JobOrder[]; workers: Worker[] }) {
  const supabase = createClient()
  const [jobs, setJobs] = useState<JobOrder[]>(initial)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterBed, setFilterBed] = useState('all')
  const [updating, setUpdating] = useState<string | null>(null)
  const [showDetail, setShowDetail] = useState<JobOrder | null>(null)
  const [castQty, setCastQty] = useState(0)
  const [selectedWorker, setSelectedWorker] = useState('')
  const [curingHours, setCuringHours] = useState(24)

  const statuses = ['all', 'pending', 'casting', 'curing', 'ready_demold', 'demolded']
  const beds = ['all', 'A', 'B', 'C', 'D', 'E', 'F']

  const filtered = jobs.filter(j => {
    const matchStatus = filterStatus === 'all' || j.status === filterStatus
    const matchBed = filterBed === 'all' || j.bed === filterBed
    return matchStatus && matchBed
  })

  const statusCounts = {
    pending: jobs.filter(j => j.status === 'pending').length,
    casting: jobs.filter(j => j.status === 'casting').length,
    curing: jobs.filter(j => j.status === 'curing').length,
    ready_demold: jobs.filter(j => j.status === 'ready_demold').length,
    demolded: jobs.filter(j => j.status === 'demolded').length,
  }

  const openDetail = (job: JobOrder) => {
    setShowDetail(job)
    setCastQty(job.qty_cast || job.qty_target)
    setSelectedWorker('')
    setCuringHours(24)
  }

  const handleAdvanceStatus = async (job: JobOrder) => {
    const cfg = STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG]
    if (!cfg.next) return
    setUpdating(job.id)
    try {
      const now = new Date().toISOString()
      const updates: any = { status: cfg.next }

      if (job.status === 'pending') {
        updates.started_at = now
        updates.qty_cast = castQty
        if (selectedWorker) updates.worker_id = selectedWorker
      }
      if (job.status === 'casting') {
        updates.cast_at = now
        updates.qty_cast = castQty
        updates.expected_demold_at = new Date(Date.now() + curingHours * 3600000).toISOString()
      }
      if (job.status === 'ready_demold') {
        updates.demolded_at = now
      }

      const { error } = await supabase.from('job_orders').update(updates).eq('id', job.id)
      if (error) throw error

      // Log
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action_type: cfg.nextLabel,
          entity_type: 'job_order',
          entity_id: job.id,
          detail: `${job.plan_item?.product?.name ?? '—'} | แท่น ${job.bed} | ${castQty} ${job.plan_item?.product?.unit ?? 'ชิ้น'}`,
        })
      }

      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, ...updates } : j))
      toast.success(`อัปเดตสถานะเป็น "${STATUS_CONFIG[cfg.next as keyof typeof STATUS_CONFIG].label}" สำเร็จ!`)
      setShowDetail(null)
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setUpdating(null)
    }
  }

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const getElapsed = (startIso: string | null) => {
    if (!startIso) return null
    const diff = Date.now() - new Date(startIso).getTime()
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    return h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { key: 'pending',      label: 'รอเริ่ม',         cfg: STATUS_CONFIG.pending },
          { key: 'casting',      label: 'กำลังเท',         cfg: STATUS_CONFIG.casting },
          { key: 'curing',       label: 'กำลังบ่ม',        cfg: STATUS_CONFIG.curing },
          { key: 'ready_demold', label: 'พร้อมถอดแบบ',    cfg: STATUS_CONFIG.ready_demold },
          { key: 'demolded',     label: 'ถอดแบบแล้ว',     cfg: STATUS_CONFIG.demolded },
        ].map(s => (
          <button key={s.key} onClick={() => setFilterStatus(filterStatus === s.key ? 'all' : s.key)}
            style={{
              background: filterStatus === s.key ? s.cfg.bg : 'var(--surface)', border: `1.5px solid ${filterStatus === s.key ? s.cfg.color : 'var(--border)'}`,
              borderRadius: 'var(--radius)', padding: '14px 16px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <i className={`fas ${s.cfg.icon}`} style={{ color: s.cfg.color, fontSize: 18 }}></i>
              <span style={{ fontSize: 28, fontWeight: 700, color: s.cfg.color }}>{statusCounts[s.key as keyof typeof statusCounts]}</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{s.label}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>กรองแท่น:</span>
        {beds.map(b => (
          <button key={b} onClick={() => setFilterBed(b)}
            style={{ padding: '5px 14px', borderRadius: 20, border: filterBed === b ? 'none' : '1px solid var(--border)', background: filterBed === b ? 'var(--accent)' : 'var(--surface)', color: filterBed === b ? 'white' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {b === 'all' ? 'ทุกแท่น' : `แท่น ${b}`}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>แสดง {filtered.length} รายการ</span>
      </div>

      {/* Job Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {filtered.map(job => {
          const cfg = STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending
          const pct = job.qty_target > 0 ? Math.round((job.qty_cast / job.qty_target) * 100) : 0
          const elapsed = getElapsed(job.cast_at || job.started_at)
          return (
            <div key={job.id} style={{ background: 'var(--surface)', border: `1px solid var(--border)`, borderRadius: 'var(--radius)', overflow: 'hidden', transition: 'box-shadow 0.15s' }}
              className="hover:shadow-md">
              {/* Card Header */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: cfg.bg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: cfg.color }}>แท่น {job.bed}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.7)', color: cfg.color }}>
                    <i className={`fas ${cfg.icon}`} style={{ marginRight: 4 }}></i>
                    {cfg.label}
                  </span>
                </div>
                {elapsed && (
                  <span style={{ fontSize: 10, color: cfg.color, fontWeight: 600 }}>
                    <i className="far fa-clock" style={{ marginRight: 3 }}></i>{elapsed}
                  </span>
                )}
              </div>

              {/* Card Body */}
              <div style={{ padding: '14px 16px' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.3 }}>
                  {job.plan_item?.product?.name ?? 'ไม่ระบุสินค้า'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 12 }}>
                  {job.plan_item?.product?.code ?? '—'}
                </div>

                {/* Progress */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ความคืบหน้า</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? 'var(--green)' : 'var(--accent)' }}>{pct}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--green)' : 'var(--accent)', borderRadius: 3, transition: 'width 0.3s' }}></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>เทแล้ว {job.qty_cast} / เป้า {job.qty_target}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{job.plan_item?.product?.unit}</span>
                  </div>
                </div>

                {/* Timeline */}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 12 }}>
                  {job.started_at && <div><i className="fas fa-play-circle" style={{ marginRight: 5, color: 'var(--accent)', width: 14 }}></i>เริ่ม: {fmtDate(job.started_at)}</div>}
                  {job.cast_at && <div><i className="fas fa-fill-drip" style={{ marginRight: 5, color: 'var(--amber)', width: 14 }}></i>เทปูน: {fmtDate(job.cast_at)}</div>}
                  {job.expected_demold_at && <div><i className="fas fa-calendar-check" style={{ marginRight: 5, color: 'var(--green)', width: 14 }}></i>ถอดแบบได้: {fmtDate(job.expected_demold_at)}</div>}
                </div>

                {/* Worker */}
                {job.worker && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                      {job.worker.full_name.charAt(0)}
                    </div>
                    {job.worker.full_name}
                  </div>
                )}

                {/* Action Button */}
                {cfg.next && (
                  <button onClick={() => openDetail(job)} disabled={updating === job.id}
                    style={{ width: '100%', padding: '9px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <i className="fas fa-arrow-right" style={{ marginRight: 6 }}></i>
                    {cfg.nextLabel}
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <i className="fas fa-clipboard-list" style={{ fontSize: 48, opacity: 0.2, marginBottom: 16, display: 'block' }}></i>
            <div style={{ fontSize: 14, fontWeight: 600 }}>ไม่มีงานในคิว</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>สร้างแผนการผลิตก่อนแล้วยืนยันเพื่อสร้างคิวงาน</div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetail && (() => {
        const cfg = STATUS_CONFIG[showDetail.status as keyof typeof STATUS_CONFIG]
        const nextCfg = cfg.next ? STATUS_CONFIG[cfg.next as keyof typeof STATUS_CONFIG] : null
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>อัปเดตสถานะงาน — แท่น {showDetail.bed}</h2>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{showDetail.plan_item?.product?.name}</p>
                </div>
                <button onClick={() => setShowDetail(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
              </div>

              {/* Status flow */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20, padding: '12px 16px', background: 'var(--bg)', borderRadius: 8 }}>
                <span style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                <i className="fas fa-arrow-right" style={{ color: 'var(--text-muted)', fontSize: 12 }}></i>
                {nextCfg && <span style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: nextCfg.bg, color: nextCfg.color }}>{nextCfg.label}</span>}
              </div>

              {/* Fields based on current status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {showDetail.status === 'pending' && (
                  <>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>จำนวนที่จะเท ({showDetail.plan_item?.product?.unit})</label>
                      <input type="number" min={1} value={castQty} onChange={e => setCastQty(parseInt(e.target.value) || 0)}
                        onFocus={e => e.target.select()}
                        style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>เป้าหมาย: {showDetail.qty_target} {showDetail.plan_item?.product?.unit}</p>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>พนักงานผู้เท (ไม่บังคับ)</label>
                      <select value={selectedWorker} onChange={e => setSelectedWorker(e.target.value)}
                        style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, outline: 'none', background: 'white' }}>
                        <option value="">— เลือกพนักงาน —</option>
                        {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}{w.employee_code ? ` (${w.employee_code})` : ''}</option>)}
                      </select>
                    </div>
                  </>
                )}
                {showDetail.status === 'casting' && (
                  <>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>จำนวนที่เทจริง ({showDetail.plan_item?.product?.unit})</label>
                      <input type="number" min={0} value={castQty} onChange={e => setCastQty(parseInt(e.target.value) || 0)}
                        onFocus={e => e.target.select()}
                        style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>ระยะเวลาบ่ม (ชั่วโมง)</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[16, 24, 48, 72].map(h => (
                          <button key={h} onClick={() => setCuringHours(h)}
                            style={{ flex: 1, padding: '8px', border: curingHours === h ? 'none' : '1px solid var(--border)', borderRadius: 6, background: curingHours === h ? 'var(--accent)' : 'white', color: curingHours === h ? 'white' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            {h} ชม.
                          </button>
                        ))}
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                        ถอดแบบได้: {new Date(Date.now() + curingHours * 3600000).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </>
                )}
                {(showDetail.status === 'curing' || showDetail.status === 'ready_demold') && (
                  <div style={{ background: 'var(--green-light)', border: '1px solid #D1FAE5', borderRadius: 8, padding: 14, display: 'flex', gap: 12 }}>
                    <i className="fas fa-info-circle" style={{ color: 'var(--green)', fontSize: 20, marginTop: 2 }}></i>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#047857' }}>ยืนยันการ{cfg.nextLabel}</div>
                      <div style={{ fontSize: 12, color: '#059669', marginTop: 3 }}>
                        {showDetail.plan_item?.product?.name} | {showDetail.qty_cast} {showDetail.plan_item?.product?.unit} | แท่น {showDetail.bed}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button onClick={() => setShowDetail(null)} style={{ flex: 1, padding: '11px', border: '1px solid var(--border)', borderRadius: 8, background: 'white', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
                <button onClick={() => handleAdvanceStatus(showDetail)} disabled={updating === showDetail.id}
                  style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {updating === showDetail.id
                    ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>กำลังบันทึก...</>
                    : <><i className="fas fa-check" style={{ marginRight: 6 }}></i>ยืนยัน — {cfg.nextLabel}</>}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
