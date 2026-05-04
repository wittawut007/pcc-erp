'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface Job {
  id: string; bed: string; qty_cast: number; qty_target: number
  status: string; cast_at: string | null; expected_demold_at: string | null
  plan_item: { product: { id: string; code: string; name: string; category: string; unit: string } | null } | null
  worker: { full_name: string } | null
}

interface DemoldRecord {
  id: string; qty_good: number; qty_defect: number; defect_reason: string | null
  defect_detail: string | null; created_at: string
  job_order: { bed: string; plan_item: { product: { name: string; unit: string } | null } | null } | null
  worker: { full_name: string } | null
}

interface Worker { id: string; full_name: string; employee_code: string | null }

const DEFECT_REASONS = [
  { value: 'crack',      label: 'แตก / ร้าว' },
  { value: 'chip',       label: 'บิ่น / มุมหัก' },
  { value: 'honeycomb',  label: 'Honeycomb (รูพรุน)' },
  { value: 'other',      label: 'อื่นๆ' },
]

export default function DemoldingClient({ readyJobs, recentDemolding, workers }: { readyJobs: Job[]; recentDemolding: DemoldRecord[]; workers: Worker[] }) {
  const supabase = createClient()
  const [jobs, setJobs] = useState<Job[]>(readyJobs)
  const [records, setRecords] = useState<DemoldRecord[]>(recentDemolding)
  const [selected, setSelected] = useState<Job | null>(null)
  const [form, setForm] = useState({ qtyGood: 0, qtyDefect: 0, defectReason: '', defectDetail: '', workerId: '' })
  const [saving, setSaving] = useState(false)

  const isOverdue = (job: Job) => job.expected_demold_at && new Date(job.expected_demold_at) < new Date()
  const isReady = (job: Job) => job.status === 'ready_demold'

  const openForm = (job: Job) => {
    setSelected(job)
    setForm({ qtyGood: job.qty_cast, qtyDefect: 0, defectReason: '', defectDetail: '', workerId: '' })
  }

  const handleSubmit = async () => {
    if (!selected) return
    if (form.qtyGood + form.qtyDefect > selected.qty_cast) {
      toast.error(`รวมชิ้นดี+ของเสียต้องไม่เกิน ${selected.qty_cast} ${selected.plan_item?.product?.unit}`)
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Insert demolding record
      const { data: record, error: recError } = await supabase.from('demolding_records').insert({
        job_order_id: selected.id,
        worker_id: form.workerId || user.id,
        qty_good: form.qtyGood,
        qty_defect: form.qtyDefect,
        defect_reason: form.qtyDefect > 0 ? form.defectReason || null : null,
        defect_detail: form.defectDetail || null,
      }).select().single()
      if (recError) throw recError

      // Update job order → demolded + qty
      await supabase.from('job_orders').update({
        status: 'demolded',
        demolded_at: new Date().toISOString(),
        qty_cast: form.qtyGood + form.qtyDefect,
      }).eq('id', selected.id)

      // Update FG inventory (upsert)
      const productId = selected.plan_item?.product?.id
      if (productId && form.qtyGood > 0) {
        const { data: existing } = await supabase.from('fg_inventory').select('id, qty').eq('product_id', productId).single()
        if (existing) {
          await supabase.from('fg_inventory').update({ qty: existing.qty + form.qtyGood, updated_at: new Date().toISOString(), last_updated_by: user.id }).eq('id', existing.id)
        } else {
          await supabase.from('fg_inventory').insert({ product_id: productId, qty: form.qtyGood, last_updated_by: user.id })
        }
      }

      // Activity log
      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'ถอดแบบ & QC',
        entity_type: 'demolding_record',
        entity_id: record.id,
        detail: `${selected.plan_item?.product?.name} | ดี ${form.qtyGood} / เสีย ${form.qtyDefect} ${selected.plan_item?.product?.unit}`,
      })

      toast.success(`บันทึกถอดแบบสำเร็จ! ชิ้นดี ${form.qtyGood} | ของเสีย ${form.qtyDefect}`)
      setJobs(prev => prev.filter(j => j.id !== selected.id))
      setSelected(null)
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const fmtTime = (iso: string | null) => iso ? new Date(iso).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 20, alignItems: 'start' }}>

        {/* LEFT — Queue */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            คิวรอถอดแบบ ({jobs.length} งาน)
          </div>

          {jobs.length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="fas fa-check-double" style={{ fontSize: 40, opacity: 0.2, display: 'block', marginBottom: 12 }}></i>
              ไม่มีงานในคิวถอดแบบ
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {jobs.map(job => {
                const overdue = isOverdue(job)
                const ready = isReady(job)
                return (
                  <button key={job.id} onClick={() => openForm(job)}
                    style={{
                      background: selected?.id === job.id ? 'var(--accent-light)' : 'var(--surface)',
                      border: `1.5px solid ${selected?.id === job.id ? 'var(--accent)' : overdue ? 'var(--red)' : ready ? 'var(--green)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius)', padding: '14px 16px', cursor: 'pointer', textAlign: 'left', width: '100%',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{job.plan_item?.product?.name ?? '—'}</span>
                        <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 700 }}>โรงผลิต {job.bed}</span>
                      </div>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, fontWeight: 700,
                        background: overdue ? 'var(--red-light)' : ready ? 'var(--green-light)' : 'var(--amber-light)',
                        color: overdue ? 'var(--red)' : ready ? '#059669' : '#B45309' }}>
                        {overdue ? '⚠ เกินเวลา' : ready ? '✓ พร้อมถอด' : '🕐 กำลังบ่ม'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)' }}>
                      <span><i className="fas fa-cubes" style={{ marginRight: 4 }}></i>{job.qty_cast} {job.plan_item?.product?.unit}</span>
                      <span><i className="fas fa-calendar" style={{ marginRight: 4 }}></i>ถอดได้: {fmtTime(job.expected_demold_at)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* RIGHT — Form + History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* QC Form */}
          <div style={{ background: 'var(--surface)', border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: selected ? 16 : 0 }}>
              {selected ? `บันทึกถอดแบบ — ${selected.plan_item?.product?.name}` : 'เลือกงานจากคิวด้านซ้าย'}
            </div>

            {selected && (
              <>
                {/* Info Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
                  {[
                    { label: 'โรงผลิต', value: selected.bed, color: 'var(--accent)' },
                    { label: 'เทมาแล้ว', value: `${selected.qty_cast} ${selected.plan_item?.product?.unit}`, color: 'var(--text-primary)' },
                    { label: 'สถานะ', value: selected.status === 'ready_demold' ? 'พร้อมถอด' : 'กำลังบ่ม', color: selected.status === 'ready_demold' ? 'var(--green)' : '#B45309' },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'var(--bg)', borderRadius: 7, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                      ✅ ชิ้นดี ({selected.plan_item?.product?.unit})
                    </label>
                    <input type="number" min={0} value={form.qtyGood}
                      onChange={e => setForm(f => ({ ...f, qtyGood: parseInt(e.target.value) || 0 }))}
                      onFocus={e => e.target.select()}
                      style={{ width: '100%', padding: '10px 12px', border: '2px solid var(--green)', borderRadius: 7, fontSize: 16, fontWeight: 700, color: 'var(--green)', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                      ❌ ของเสีย ({selected.plan_item?.product?.unit})
                    </label>
                    <input type="number" min={0} value={form.qtyDefect}
                      onChange={e => setForm(f => ({ ...f, qtyDefect: parseInt(e.target.value) || 0 }))}
                      onFocus={e => e.target.select()}
                      style={{ width: '100%', padding: '10px 12px', border: '2px solid var(--red)', borderRadius: 7, fontSize: 16, fontWeight: 700, color: 'var(--red)', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
                  </div>
                </div>

                {/* Defect rate */}
                <div style={{ margin: '12px 0', padding: '8px 12px', background: 'var(--bg)', borderRadius: 7, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>รวม: {form.qtyGood + form.qtyDefect} / {selected.qty_cast}</span>
                  <span style={{ fontWeight: 700, color: form.qtyDefect > 0 ? 'var(--red)' : 'var(--green)' }}>
                    อัตราเสีย: {selected.qty_cast > 0 ? ((form.qtyDefect / selected.qty_cast) * 100).toFixed(1) : 0}%
                  </span>
                </div>

                {form.qtyDefect > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>สาเหตุของเสีย</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                      {DEFECT_REASONS.map(r => (
                        <button key={r.value} onClick={() => setForm(f => ({ ...f, defectReason: r.value }))}
                          style={{ padding: '8px', border: form.defectReason === r.value ? 'none' : '1px solid var(--border)', borderRadius: 6, background: form.defectReason === r.value ? 'var(--red-light)' : 'white', color: form.defectReason === r.value ? 'var(--red)' : 'var(--text-secondary)', fontSize: 11, fontWeight: form.defectReason === r.value ? 700 : 400, cursor: 'pointer' }}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                    <textarea value={form.defectDetail} onChange={e => setForm(f => ({ ...f, defectDetail: e.target.value }))}
                      placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)..."
                      rows={2}
                      style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
                  </div>
                )}

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>พนักงานถอดแบบ</label>
                  <select value={form.workerId} onChange={e => setForm(f => ({ ...f, workerId: e.target.value }))}
                    style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', background: 'white' }}>
                    <option value="">— ใช้ผู้เข้าสู่ระบบปัจจุบัน —</option>
                    {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
                  </select>
                </div>

                <button onClick={handleSubmit} disabled={saving}
                  style={{ width: '100%', padding: '12px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {saving ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>กำลังบันทึก...</> : <><i className="fas fa-save" style={{ marginRight: 6 }}></i>บันทึกผลการถอดแบบ & อัปเดต FG</>}
                </button>
              </>
            )}
          </div>

          {/* History */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>ประวัติการถอดแบบล่าสุด</div>
            {records.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 12 }}>ยังไม่มีประวัติ</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['สินค้า', 'โรงผลิต', 'ดี', 'เสีย', 'สาเหตุ', 'เวลา'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 8).map(r => (
                    <tr key={r.id} className="hover:bg-[var(--bg)]">
                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', fontWeight: 600, maxWidth: 160 }}>{r.job_order?.plan_item?.product?.name ?? '—'}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                        <span style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>{r.job_order?.bed}</span>
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'center', fontWeight: 700, color: 'var(--green)' }}>{r.qty_good}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'center', fontWeight: 700, color: r.qty_defect > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{r.qty_defect}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--text-muted)' }}>
                        {r.defect_reason ? DEFECT_REASONS.find(x => x.value === r.defect_reason)?.label : '—'}
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(r.created_at).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
