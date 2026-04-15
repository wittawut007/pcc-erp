'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface FgItem {
  id: string; qty: number; updated_at: string
  product: { code: string; name: string; category: string; unit: string; size: string } | null
}

interface Product { id: string; code: string; name: string; category: string; unit: string; size: string }

export default function FgInventoryClient({ fgItems: initial, products }: { fgItems: FgItem[]; products: Product[] }) {
  const supabase = createClient()
  const [items, setItems] = useState<FgItem[]>(initial)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('ทั้งหมด')
  const [adjustModal, setAdjustModal] = useState<FgItem | null>(null)
  const [shipModal, setShipModal] = useState<FgItem | null>(null)
  const [addModal, setAddModal] = useState(false)
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustMode, setAdjustMode] = useState<'add' | 'sub' | 'set'>('add')
  const [shipQty, setShipQty] = useState(1)
  const [shipNote, setShipNote] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [newQty, setNewQty] = useState(0)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')

  const categories = ['ทั้งหมด', ...Array.from(new Set(items.map(i => i.product?.category?.split(' ')[0]).filter((c): c is string => !!c)))]
  const filtered = items.filter(i => {
    const catKey = i.product?.category?.split(' ')[0]
    const matchCat = filterCat === 'ทั้งหมด' || catKey === filterCat
    const matchSearch = !search || i.product?.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })
  const totalFg = items.reduce((s, i) => s + i.qty, 0)

  const handleAdjust = async () => {
    if (!adjustModal) return
    setSaving(true)
    try {
      let qty = adjustModal.qty
      if (adjustMode === 'add') qty += adjustQty
      else if (adjustMode === 'sub') qty = Math.max(0, qty - adjustQty)
      else qty = adjustQty

      const { error } = await supabase.from('fg_inventory').update({ qty, updated_at: new Date().toISOString() }).eq('id', adjustModal.id)
      if (error) throw error

      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'ปรับสต็อก FG',
        entity_type: 'fg_inventory',
        entity_id: adjustModal.id,
        detail: `${adjustModal.product?.name}: ${adjustModal.qty} → ${qty} ${adjustModal.product?.unit}${note ? ' | ' + note : ''}`,
      })

      setItems(prev => prev.map(i => i.id === adjustModal.id ? { ...i, qty, updated_at: new Date().toISOString() } : i))
      toast.success('อัปเดต FG สำเร็จ!')
      setAdjustModal(null)
    } catch (e: any) { toast.error('เกิดข้อผิดพลาด: ' + e.message) }
    finally { setSaving(false) }
  }

  const handleShip = async () => {
    if (!shipModal) return
    if (shipQty > shipModal.qty) { toast.error(`สต็อกไม่พอ มีอยู่ ${shipModal.qty} ${shipModal.product?.unit}`); return }
    setSaving(true)
    try {
      const newQtyVal = shipModal.qty - shipQty
      const { error } = await supabase.from('fg_inventory').update({ qty: newQtyVal, updated_at: new Date().toISOString() }).eq('id', shipModal.id)
      if (error) throw error

      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'จัดส่งสินค้า (FG Out)',
        entity_type: 'fg_inventory',
        entity_id: shipModal.id,
        detail: `${shipModal.product?.name}: -${shipQty} ${shipModal.product?.unit} | เหลือ ${newQtyVal}${shipNote ? ' | ' + shipNote : ''}`,
      })

      setItems(prev => prev.map(i => i.id === shipModal.id ? { ...i, qty: newQtyVal, updated_at: new Date().toISOString() } : i))
      toast.success(`บันทึกจัดส่ง ${shipQty} ${shipModal.product?.unit} สำเร็จ!`)
      setShipModal(null)
    } catch (e: any) { toast.error('เกิดข้อผิดพลาด: ' + e.message) }
    finally { setSaving(false) }
  }

  const handleAddNew = async () => {
    if (!selectedProductId) { toast.error('กรุณาเลือกสินค้า'); return }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase.from('fg_inventory').insert({ product_id: selectedProductId, qty: newQty, last_updated_by: user?.id }).select('*, product:products(code,name,category,unit,size)').single()
      if (error) throw error
      setItems(prev => [...prev, data])
      toast.success('เพิ่ม FG สำเร็จ!')
      setAddModal(false); setSelectedProductId(''); setNewQty(0)
    } catch (e: any) { toast.error(e.message.includes('duplicate') ? 'สินค้านี้มี FG อยู่แล้ว' : e.message) }
    finally { setSaving(false) }
  }

  const catColor: Record<string, string> = { A13: '#2563EB', A30: '#16A34A', A35: '#EA580C', A36: '#9333EA', A41: '#DC2626', A42: '#0284C7' }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'รายการสินค้า FG', value: items.length, icon: 'fa-boxes', color: 'var(--accent)' },
          { label: 'สินค้าพร้อมขายรวม', value: `${totalFg.toLocaleString()} ชิ้น`, icon: 'fa-cubes', color: 'var(--green)' },
          { label: 'หมวดหมู่', value: categories.length - 1, icon: 'fa-tags', color: 'var(--indigo)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: `${s.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className={`fas ${s.icon}`} style={{ color: s.color, fontSize: 20 }}></i>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}></i>
          <input type="text" placeholder="ค้นหาสินค้า..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {categories.map(c => {
            const key = c === 'ทั้งหมด' ? 'all' : c
            const color = catColor[c as string] ?? 'var(--accent)'
            return (
              <button key={c} onClick={() => setFilterCat(c)}
                style={{ padding: '7px 14px', borderRadius: 20, border: filterCat === c ? 'none' : '1px solid var(--border)', background: filterCat === c ? color : 'var(--surface)', color: filterCat === c ? 'white' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {c === 'ทั้งหมด' ? 'ทั้งหมด' : c}
              </button>
            )
          })}
        </div>
        <button onClick={() => setAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <i className="fas fa-plus"></i> เพิ่ม FG
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['รหัสสินค้า', 'ชื่อสินค้า', 'ขนาด', 'สต็อก FG', 'อัปเดตล่าสุด', 'จัดการ'].map((h, i) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: i >= 5 ? 'center' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => {
              const catKey = item.product?.category?.split(' ')[0] ?? ''
              const color = catColor[catKey] ?? 'var(--accent)'
              return (
                <tr key={item.id} className="hover:bg-[var(--bg)] transition-colors">
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 700, background: `${color}22`, color }}>{catKey}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>{item.product?.code}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{item.product?.name}</td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11 }}>{item.product?.size}</td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color: item.qty === 0 ? 'var(--red)' : item.qty < 10 ? 'var(--amber)' : 'var(--green)' }}>{item.qty.toLocaleString()}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.product?.unit}</span>
                      {item.qty === 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--red-light)', color: 'var(--red)', fontWeight: 700 }}>หมดสต็อก</span>}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(item.updated_at).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button onClick={() => { setAdjustModal(item); setAdjustQty(0); setAdjustMode('add'); setNote('') }}
                        style={{ padding: '6px 10px', background: 'var(--accent-light)', color: 'var(--accent)', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                        <i className="fas fa-edit"></i>
                      </button>
                      <button onClick={() => { setShipModal(item); setShipQty(1); setShipNote('') }}
                        style={{ padding: '6px 10px', background: '#FFF0F5', color: '#C2185B', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600 }} title="บันทึกการจัดส่ง">
                        <i className="fas fa-truck"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 12 }}>ไม่พบสินค้า</div>
        )}
      </div>

      {/* Adjust Modal */}
      {adjustModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>ปรับสต็อก FG</h2>
              <button onClick={() => setAdjustModal(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>{adjustModal.product?.name}</p>
            <div style={{ background: 'var(--bg)', padding: '10px 14px', borderRadius: 8, marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12 }}>คงเหลือปัจจุบัน</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{adjustModal.qty} {adjustModal.product?.unit}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
              {[{ v: 'add', l: '+ เพิ่ม', c: 'var(--green)' }, { v: 'sub', l: '− ลด', c: 'var(--amber)' }, { v: 'set', l: '= ตั้งใหม่', c: 'var(--accent)' }].map(m => (
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
              style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAdjustModal(null)} style={{ flex: 1, padding: '11px', border: '1px solid var(--border)', borderRadius: 8, background: 'white', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={handleAdjust} disabled={saving} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'กำลังบันทึก...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ship Modal */}
      {shipModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>บันทึกการจัดส่ง</h2>
              <button onClick={() => setShipModal(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>{shipModal.product?.name}</p>
            <div style={{ background: '#FFF0F5', border: '1px solid #F9A8D4', padding: '10px 14px', borderRadius: 8, marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12 }}>สต็อกปัจจุบัน</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#C2185B' }}>{shipModal.qty} {shipModal.product?.unit}</span>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>จำนวนที่จัดส่ง ({shipModal.product?.unit}) *</label>
              <input type="number" min={1} max={shipModal.qty} value={shipQty} onChange={e => setShipQty(parseInt(e.target.value) || 1)}
                onFocus={e => e.target.select()}
                style={{ width: '100%', padding: '10px', border: '2px solid #C2185B', borderRadius: 7, fontSize: 18, fontWeight: 700, textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>เหลือหลังจัดส่ง: <strong>{Math.max(0, shipModal.qty - shipQty)} {shipModal.product?.unit}</strong></p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>เลขที่ใบส่งของ / ลูกค้า</label>
              <input type="text" placeholder="เช่น: DO-2025-001 / บริษัท..." value={shipNote} onChange={e => setShipNote(e.target.value)}
                style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShipModal(null)} style={{ flex: 1, padding: '11px', border: '1px solid var(--border)', borderRadius: 8, background: 'white', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={handleShip} disabled={saving} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, background: '#C2185B', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'กำลังบันทึก...' : <><i className="fas fa-truck" style={{ marginRight: 6 }}></i>บันทึกการจัดส่ง</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add FG Modal */}
      {addModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>เพิ่มสินค้า FG</h2>
              <button onClick={() => setAddModal(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>สินค้า *</label>
              <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}
                style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', background: 'white' }}>
                <option value="">— เลือกสินค้า —</option>
                {products.filter(p => !items.some(i => i.product?.code === p.code)).map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>จำนวนเริ่มต้น</label>
              <input type="number" min={0} value={newQty} onChange={e => setNewQty(parseInt(e.target.value) || 0)}
                style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAddModal(false)} style={{ flex: 1, padding: '11px', border: '1px solid var(--border)', borderRadius: 8, background: 'white', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={handleAddNew} disabled={saving} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'กำลังบันทึก...' : 'เพิ่ม FG'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
