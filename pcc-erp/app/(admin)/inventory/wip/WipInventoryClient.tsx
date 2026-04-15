'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface WipItem {
  id: string; wip_code: string; qty: number; updated_at: string
  product: { code: string; name: string; category: string; unit: string; bom_code: string | null } | null
}

interface Product { id: string; code: string; name: string; category: string; wip_code: string | null; unit: string }

export default function WipInventoryClient({ wipItems: initial, products }: { wipItems: WipItem[]; products: Product[] }) {
  const supabase = createClient()
  const [items, setItems] = useState<WipItem[]>(initial)
  const [adjustModal, setAdjustModal] = useState<WipItem | null>(null)
  const [addModal, setAddModal] = useState(false)
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustMode, setAdjustMode] = useState<'add' | 'sub' | 'set'>('add')
  const [note, setNote] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [newQty, setNewQty] = useState(0)
  const [newWipCode, setNewWipCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = items.filter(i => !search || i.product?.name.toLowerCase().includes(search.toLowerCase()) || i.wip_code.toLowerCase().includes(search.toLowerCase()))
  const totalWip = items.reduce((s, i) => s + i.qty, 0)

  const handleAdjust = async () => {
    if (!adjustModal) return
    setSaving(true)
    try {
      let qty = adjustModal.qty
      if (adjustMode === 'add') qty += adjustQty
      else if (adjustMode === 'sub') qty = Math.max(0, qty - adjustQty)
      else qty = adjustQty

      const { error } = await supabase.from('wip_inventory').update({ qty, updated_at: new Date().toISOString() }).eq('id', adjustModal.id)
      if (error) throw error

      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: adjustMode === 'add' ? 'รับโครงเหล็ก (เพิ่ม WIP)' : adjustMode === 'sub' ? 'เบิกโครงเหล็ก (ลด WIP)' : 'ปรับ WIP',
        entity_type: 'wip_inventory',
        entity_id: adjustModal.id,
        detail: `${adjustModal.product?.name ?? adjustModal.wip_code}: ${adjustModal.qty} → ${qty} ${adjustModal.product?.unit ?? 'ชุด'}${note ? ' | ' + note : ''}`,
      })

      setItems(prev => prev.map(i => i.id === adjustModal.id ? { ...i, qty, updated_at: new Date().toISOString() } : i))
      toast.success('อัปเดตโครงเหล็กสำเร็จ!')
      setAdjustModal(null)
    } catch (e: any) { toast.error('เกิดข้อผิดพลาด: ' + e.message) }
    finally { setSaving(false) }
  }

  const handleAddNew = async () => {
    if (!selectedProductId) { toast.error('กรุณาเลือกสินค้า'); return }
    setSaving(true)
    try {
      const prod = products.find(p => p.id === selectedProductId)
      const wipCode = newWipCode || prod?.wip_code || `WIP-${prod?.code}`
      const { data, error } = await supabase.from('wip_inventory').insert({ product_id: selectedProductId, wip_code: wipCode, qty: newQty }).select('*, product:products(code,name,category,unit,bom_code)').single()
      if (error) throw error
      setItems(prev => [...prev, data])
      toast.success('เพิ่มรายการ WIP สำเร็จ!')
      setAddModal(false)
      setSelectedProductId(''); setNewQty(0); setNewWipCode('')
    } catch (e: any) { toast.error(e.message.includes('duplicate') ? 'สินค้านี้มี WIP อยู่แล้ว' : 'เกิดข้อผิดพลาด: ' + e.message) }
    finally { setSaving(false) }
  }

  const catColor: Record<string, string> = { A13: '#2563EB', A30: '#16A34A', A35: '#EA580C', A36: '#9333EA', A41: '#DC2626', A42: '#0284C7' }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'รายการ WIP', value: items.length, icon: 'fa-th-large', color: 'var(--accent)' },
          { label: 'โครงเหล็กรวม', value: totalWip.toLocaleString(), icon: 'fa-cubes', color: 'var(--indigo)', unit: 'ชุด' },
          { label: 'รายการที่แสดง', value: filtered.length, icon: 'fa-filter', color: 'var(--green)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 8, background: `${s.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className={`fas ${s.icon}`} style={{ color: s.color, fontSize: 20 }}></i>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value} {s.unit && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}>{s.unit}</span>}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}></i>
          <input type="text" placeholder="ค้นหาโครงเหล็ก..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', outline: 'none' }} />
        </div>
        <button onClick={() => setAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <i className="fas fa-plus"></i> เพิ่ม WIP
        </button>
      </div>

      {/* Grid Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {filtered.map(item => {
          const catKey = item.product?.category?.split(' ')[0] ?? ''
          const color = catColor[catKey] ?? 'var(--accent)'
          return (
            <div key={item.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }} className="hover:shadow-md transition-shadow">
              <div style={{ height: 4, background: color }}></div>
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${color}22`, color, marginBottom: 4, display: 'inline-block' }}>{catKey}</span>
                    <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>{item.product?.name ?? item.wip_code}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>{item.wip_code}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{item.qty.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.product?.unit ?? 'ชุด'}</div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12 }}>
                  อัปเดต: {new Date(item.updated_at).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
                <button onClick={() => { setAdjustModal(item); setAdjustQty(0); setAdjustMode('add'); setNote('') }}
                  style={{ width: '100%', padding: '8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <i className="fas fa-edit" style={{ marginRight: 5, color }}></i>ปรับจำนวน
                </button>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
            <i className="fas fa-th-large" style={{ fontSize: 40, opacity: 0.2, display: 'block', marginBottom: 12 }}></i>
            ไม่พบรายการ WIP
          </div>
        )}
      </div>

      {/* Adjust Modal */}
      {adjustModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>ปรับ WIP: {adjustModal.product?.name}</h2>
              <button onClick={() => setAdjustModal(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ background: 'var(--bg)', padding: '10px 14px', borderRadius: 8, marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12 }}>คงเหลือปัจจุบัน</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{adjustModal.qty} {adjustModal.product?.unit}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
              {[{ v: 'add', l: '+ รับเข้า', c: 'var(--green)' }, { v: 'sub', l: '− เบิกออก', c: 'var(--red)' }, { v: 'set', l: '= ตั้งใหม่', c: 'var(--accent)' }].map(m => (
                <button key={m.v} onClick={() => setAdjustMode(m.v as any)}
                  style={{ padding: '8px', border: adjustMode === m.v ? 'none' : '1px solid var(--border)', borderRadius: 7, background: adjustMode === m.v ? m.c : 'white', color: adjustMode === m.v ? 'white' : 'var(--text-secondary)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  {m.l}
                </button>
              ))}
            </div>
            <input type="number" min={0} value={adjustQty} onChange={e => setAdjustQty(parseInt(e.target.value) || 0)}
              onFocus={e => e.target.select()}
              style={{ width: '100%', padding: '10px', border: '1.5px solid var(--accent)', borderRadius: 7, fontSize: 18, fontWeight: 700, textAlign: 'center', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
            <input type="text" placeholder="หมายเหตุ..." value={note} onChange={e => setNote(e.target.value)}
              style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAdjustModal(null)} style={{ flex: 1, padding: '11px', border: '1px solid var(--border)', borderRadius: 8, background: 'white', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={handleAdjust} disabled={saving} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'กำลังบันทึก...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {addModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>เพิ่มรายการ WIP</h2>
              <button onClick={() => setAddModal(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>สินค้า *</label>
              <select value={selectedProductId} onChange={e => { setSelectedProductId(e.target.value); const p = products.find(x => x.id === e.target.value); setNewWipCode(p?.wip_code ?? '') }}
                style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', background: 'white' }}>
                <option value="">— เลือกสินค้า —</option>
                {products.filter(p => !items.some(i => i.product?.code === p.code)).map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>WIP Code</label>
              <input type="text" value={newWipCode} onChange={e => setNewWipCode(e.target.value)}
                style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>จำนวนเริ่มต้น</label>
              <input type="number" min={0} value={newQty} onChange={e => setNewQty(parseInt(e.target.value) || 0)}
                style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAddModal(false)} style={{ flex: 1, padding: '11px', border: '1px solid var(--border)', borderRadius: 8, background: 'white', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={handleAddNew} disabled={saving} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'กำลังบันทึก...' : 'เพิ่ม WIP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
