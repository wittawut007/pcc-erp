'use client'

import { useState, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface RawMaterial {
  id: string; name: string; category: string; unit: string
  qty_on_hand: number; min_stock: number; updated_at: string
}

const CATEGORIES = ['ทั้งหมด', 'เหล็กเส้น', 'ลวด', 'น้ำยา', 'ปูน', 'เมช', 'อื่นๆ']

export default function RawMaterialsClient({ materials: initial }: { materials: RawMaterial[] }) {
  const supabase = createClient()
  const [materials, setMaterials] = useState<RawMaterial[]>(initial)
  const [filterCat, setFilterCat] = useState('ทั้งหมด')
  const [search, setSearch] = useState('')
  const [adjustModal, setAdjustModal] = useState<RawMaterial | null>(null)
  const [addModal, setAddModal] = useState(false)
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustMinStock, setAdjustMinStock] = useState(0)
  const [adjustMode, setAdjustMode] = useState<'add' | 'sub' | 'set'>('add')
  const [adjustNote, setAdjustNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', category: 'เหล็กเส้น', unit: '', qty_on_hand: 0, min_stock: 0 })

  const filtered = materials.filter(m => {
    const matchCat = filterCat === 'ทั้งหมด' || m.category === filterCat
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const normalStock = materials.filter(m => m.qty_on_hand > m.min_stock)
  const lowStock = materials.filter(m => m.qty_on_hand <= m.min_stock && m.qty_on_hand > m.min_stock * 0.5)
  const criticalStock = materials.filter(m => m.qty_on_hand <= m.min_stock * 0.5)

  const handleAdjust = async () => {
    if (!adjustModal) return
    setSaving(true)
    try {
      let newQty = adjustModal.qty_on_hand
      if (adjustMode === 'add') newQty += adjustQty
      else if (adjustMode === 'sub') newQty = Math.max(0, newQty - adjustQty)
      else newQty = adjustQty

      const { error } = await supabase.from('raw_materials').update({ qty_on_hand: newQty, min_stock: adjustMinStock, updated_at: new Date().toISOString() }).eq('id', adjustModal.id)
      if (error) throw error

      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: adjustMode === 'add' ? 'รับวัตถุดิบ (เพิ่ม)' : adjustMode === 'sub' ? 'เบิกวัตถุดิบ (ลด)' : 'ปรับสต็อก',
        entity_type: 'raw_material',
        entity_id: adjustModal.id,
        detail: `${adjustModal.name}: ${adjustModal.qty_on_hand} → ${newQty} ${adjustModal.unit} (ขั้นต่ำ: ${adjustMinStock})${adjustNote ? ' | ' + adjustNote : ''}`,
      })

      setMaterials(prev => prev.map(m => m.id === adjustModal.id ? { ...m, qty_on_hand: newQty, min_stock: adjustMinStock, updated_at: new Date().toISOString() } : m))
      toast.success('อัปเดตสต็อกสำเร็จ!')
      setAdjustModal(null)
    } catch (e: any) { toast.error('เกิดข้อผิดพลาด: ' + e.message) }
    finally { setSaving(false) }
  }

  const handleAddNew = async () => {
    if (!newForm.name || !newForm.unit) { toast.error('กรุณากรอกชื่อและหน่วย'); return }
    setSaving(true)
    try {
      const { data, error } = await supabase.from('raw_materials').insert(newForm).select().single()
      if (error) throw error
      setMaterials(prev => [...prev, data])
      toast.success('เพิ่มวัตถุดิบใหม่สำเร็จ!')
      setAddModal(false)
      setNewForm({ name: '', category: 'เหล็กเส้น', unit: '', qty_on_hand: 0, min_stock: 0 })
    } catch (e: any) { toast.error('เกิดข้อผิดพลาด: ' + e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรายการ "${name}"?\nการกระทำนี้ไม่สามารถกู้คืนได้`)) return
    
    setSaving(true)
    try {
      const { error } = await supabase.from('raw_materials').delete().eq('id', id)
      if (error) throw error
      
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'ลบวัตถุดิบ',
        entity_type: 'raw_material',
        entity_id: id,
        detail: `ลบวัตถุดิบ: ${name}`
      })

      setMaterials(prev => prev.filter(m => m.id !== id))
      toast.success('ลบวัตถุดิบสำเร็จ!')
    } catch (e: any) {
      toast.error('ลบไม่สำเร็จ: ' + (e.message.includes('foreign key constraint') ? 'มีการใช้งานวัตถุดิบนี้ในระบบแล้ว' : e.message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'รายการทั้งหมด', value: materials.length, color: 'var(--accent)', icon: 'fa-layer-group' },
          { label: 'สต็อกปกติ', value: normalStock.length, color: 'var(--green)', icon: 'fa-check-circle' },
          { label: 'สต็อกใกล้หมด', value: lowStock.length, color: 'var(--amber)', icon: 'fa-exclamation-circle' },
          { label: 'สต็อกวิกฤต', value: criticalStock.length, color: 'var(--red)', icon: 'fa-exclamation-triangle' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: `${s.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className={`fas ${s.icon}`} style={{ color: s.color, fontSize: 18 }}></i>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Alert low stock */}
      {(lowStock.length > 0 || criticalStock.length > 0) && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
          <i className="fas fa-exclamation-triangle" style={{ color: 'var(--red)', fontSize: 18, flexShrink: 0 }}></i>
          <div>
            <span style={{ fontWeight: 700, color: '#B91C1C', fontSize: 13 }}>สต็อกที่ต้องสั่งเพิ่ม {lowStock.length + criticalStock.length} รายการ: </span>
            <span style={{ fontSize: 12, color: '#DC2626' }}>{[...criticalStock, ...lowStock].map(m => m.name).join(', ')}</span>
          </div>
        </div>
      )}

      {/* Actions Bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}></i>
          <input type="text" placeholder="ค้นหาวัตถุดิบ..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', outline: 'none' }} />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          style={{ padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', outline: 'none' }}>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <button onClick={() => setAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <i className="fas fa-plus"></i> เพิ่มวัตถุดิบ
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['ชื่อวัตถุดิบ', 'หมวดหมู่', 'คงเหลือ', 'สต็อกขั้นต่ำ', 'สถานะ', 'จัดการ'].map((h, i) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: i >= 5 ? 'center' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from(new Set(filtered.map(m => m.category))).sort().map(category => (
              <Fragment key={category}>
                <tr>
                  <td colSpan={6} style={{ padding: '12px 14px', background: 'var(--bg)', fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>
                    <i className="fas fa-folder-open" style={{ marginRight: 8, color: 'var(--text-muted)' }}></i>
                    หมวดหมู่: {category}
                  </td>
                </tr>
                {filtered.filter(m => m.category === category).map(m => {
                  const pct = m.min_stock > 0 ? (m.qty_on_hand / m.min_stock) * 100 : 100
                  const isLow = m.qty_on_hand <= m.min_stock
                  const isCritical = m.qty_on_hand <= m.min_stock * 0.5
                  return (
                    <tr key={m.id} className="hover:bg-[var(--bg)] transition-colors">
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 600, paddingLeft: 10 }}>{m.name}</div>
                      </td>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11 }}>{m.category}</td>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: isCritical ? 'var(--red)' : isLow ? '#B45309' : 'var(--text-primary)' }}>
                          {m.qty_on_hand.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>{m.unit}</span>
                        </div>
                        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginTop: 5, width: 80 }}>
                          <div style={{ height: '100%', background: isCritical ? 'var(--red)' : isLow ? 'var(--amber)' : 'var(--green)', width: `${Math.min(100, pct)}%`, borderRadius: 2 }}></div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{m.min_stock} {m.unit}</td>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                          background: isCritical ? 'var(--red-light)' : isLow ? 'var(--amber-light)' : 'var(--green-light)',
                          color: isCritical ? 'var(--red)' : isLow ? '#B45309' : '#059669' }}>
                          {isCritical ? '🔴 วิกฤต' : isLow ? '⚠ ใกล้หมด' : '✓ ปกติ'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button onClick={() => { setAdjustModal(m); setAdjustQty(0); setAdjustMinStock(m.min_stock); setAdjustMode('add'); setAdjustNote('') }}
                            style={{ padding: '6px 12px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            <i className="fas fa-edit" style={{ marginRight: 4 }}></i>ปรับสต็อก
                          </button>
                          <button onClick={() => handleDelete(m.id, m.name)} disabled={saving}
                            style={{ padding: '6px 10px', background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 12 }}>ไม่พบรายการ</div>
        )}
      </div>

      {/* Adjust Modal */}
      {adjustModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>ปรับสต็อก: {adjustModal.name}</h2>
              <button onClick={() => setAdjustModal(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ background: 'var(--bg)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>คงเหลือปัจจุบัน</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{adjustModal.qty_on_hand} {adjustModal.unit}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
              {[{ v: 'add', label: '+ รับเข้า', color: 'var(--green)' }, { v: 'sub', label: '− เบิกออก', color: 'var(--red)' }, { v: 'set', label: '= ตั้งใหม่', color: 'var(--accent)' }].map(m => (
                <button key={m.v} onClick={() => setAdjustMode(m.v as any)}
                  style={{ padding: '9px', border: adjustMode === m.v ? 'none' : '1px solid var(--border)', borderRadius: 7, background: adjustMode === m.v ? m.color : 'white', color: adjustMode === m.v ? 'white' : 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {m.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>จำนวนที่จะปรับ ({adjustModal.unit})</label>
                <input type="number" min={0} value={adjustQty} onChange={e => setAdjustQty(parseFloat(e.target.value) || 0)}
                  onFocus={e => e.target.select()}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--accent)', borderRadius: 7, fontSize: 16, fontWeight: 700, textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} />
                {adjustMode !== 'set' && (
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                    คงเหลือใหม่: <strong style={{ color: 'var(--accent)' }}>
                      {adjustMode === 'add' ? adjustModal.qty_on_hand + adjustQty : Math.max(0, adjustModal.qty_on_hand - adjustQty)} {adjustModal.unit}
                    </strong>
                  </p>
                )}
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>สต็อกขั้นต่ำ (Alert)</label>
                <input type="number" min={0} value={adjustMinStock} onChange={e => setAdjustMinStock(parseFloat(e.target.value) || 0)}
                  onFocus={e => e.target.select()}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 7, fontSize: 16, fontWeight: 700, textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>หมายเหตุ</label>
              <input type="text" placeholder="เช่น: รับของจากผู้จัดจำหน่าย, เบิกสำหรับงาน..." value={adjustNote} onChange={e => setAdjustNote(e.target.value)}
                style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAdjustModal(null)} style={{ flex: 1, padding: '11px', border: '1px solid var(--border)', borderRadius: 8, background: 'white', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={handleAdjust} disabled={saving}
                style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'กำลังบันทึก...' : 'ยืนยันการปรับสต็อก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Material Modal */}
      {addModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>เพิ่มวัตถุดิบใหม่</h2>
              <button onClick={() => setAddModal(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'ชื่อวัตถุดิบ *', key: 'name', colSpan: 2, type: 'text', placeholder: 'เช่น เหล็กเส้น DB16' },
                { label: 'หน่วย *', key: 'unit', type: 'text', placeholder: 'เส้น / ถัง / ม้วน' },
                { label: 'สต็อกเริ่มต้น', key: 'qty_on_hand', type: 'number', placeholder: '0' },
                { label: 'สต็อกขั้นต่ำ (alert)', key: 'min_stock', type: 'number', placeholder: '10' },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: (f as any).colSpan === 2 ? 'span 2' : undefined }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder} value={(newForm as any)[f.key]}
                    onChange={e => setNewForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>หมวดหมู่</label>
                <select value={newForm.category} onChange={e => setNewForm(p => ({ ...p, category: e.target.value }))}
                  style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', background: 'white' }}>
                  {CATEGORIES.filter(c => c !== 'ทั้งหมด').map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => setAddModal(false)} style={{ flex: 1, padding: '11px', border: '1px solid var(--border)', borderRadius: 8, background: 'white', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={handleAddNew} disabled={saving} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'กำลังบันทึก...' : <><i className="fas fa-plus" style={{ marginRight: 6 }}></i>เพิ่มวัตถุดิบ</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
