'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface Product {
  id: string
  code: string
  name: string
  category: string
  size: string
  unit: string
  concrete_per_unit: number
  bom_code: string | null
  wip_code: string | null
  is_active: boolean
  created_at: string
}

const CATEGORIES = [
  'A13 แผ่นพื้นตัน',
  'A30 ผนังรั้วสำเร็จรูป',
  'A35 รั้วสำเร็จรูป',
  'A36 เสา คาน บันได',
  'A41 เสาเข็ม',
  'A42 กำแพงกันดิน',
]

const EMPTY_FORM = {
  code: '', name: '', category: CATEGORIES[0], size: '',
  unit: 'ชิ้น', concrete_per_unit: 0, bom_code: '', wip_code: '',
}

export default function ProductsClient({ products: initial }: { products: Product[] }) {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>(initial)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('ทั้งหมด')
  const [showModal, setShowModal] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const categories = ['ทั้งหมด', ...CATEGORIES]

  const filtered = products.filter(p => {
    const matchCat = filterCat === 'ทั้งหมด' || p.category === filterCat
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const openAdd = () => {
    setEditProduct(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const openEdit = (p: Product) => {
    setEditProduct(p)
    setForm({ code: p.code, name: p.name, category: p.category, size: p.size, unit: p.unit, concrete_per_unit: p.concrete_per_unit, bom_code: p.bom_code ?? '', wip_code: p.wip_code ?? '' })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.code || !form.name) { toast.error('กรุณากรอกรหัสและชื่อสินค้า'); return }
    setSaving(true)
    try {
      if (editProduct) {
        const { error } = await supabase.from('products').update({ ...form, bom_code: form.bom_code || null, wip_code: form.wip_code || null }).eq('id', editProduct.id)
        if (error) throw error
        setProducts(prev => prev.map(p => p.id === editProduct.id ? { ...p, ...form } : p))
        toast.success('แก้ไขข้อมูลสินค้าสำเร็จ!')
      } else {
        const { data, error } = await supabase.from('products').insert({ ...form, bom_code: form.bom_code || null, wip_code: form.wip_code || null, is_active: true }).select().single()
        if (error) throw error
        setProducts(prev => [...prev, data])
        toast.success('เพิ่มสินค้าใหม่สำเร็จ!')
      }
      setShowModal(false)
    } catch (e: any) {
      toast.error(e.message.includes('duplicate') ? 'รหัสสินค้านี้มีอยู่แล้ว' : 'เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (p: Product) => {
    const { error } = await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id)
    if (error) { toast.error('เกิดข้อผิดพลาด'); return }
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !x.is_active } : x))
    toast.success(p.is_active ? 'ปิดใช้งานสินค้าแล้ว' : 'เปิดใช้งานสินค้าแล้ว')
  }

  const catColorMap: Record<string, { bg: string; color: string }> = {
    'A13': { bg: '#EFF4FF', color: '#2563EB' },
    'A30': { bg: '#F0FDF4', color: '#16A34A' },
    'A35': { bg: '#FFF7ED', color: '#EA580C' },
    'A36': { bg: '#FDF4FF', color: '#9333EA' },
    'A41': { bg: '#FEF2F2', color: '#DC2626' },
    'A42': { bg: '#F0F9FF', color: '#0284C7' },
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

      {/* Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}></i>
          <input
            type="text" placeholder="ค้นหารหัสหรือชื่อสินค้า..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', outline: 'none' }}
          />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          style={{ padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', outline: 'none', color: 'var(--text-primary)' }}>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={openAdd}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <i className="fas fa-plus"></i>
          เพิ่มสินค้าใหม่
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'สินค้าทั้งหมด', value: products.length, color: 'var(--accent)', bg: 'var(--accent-light)' },
          { label: 'ใช้งานอยู่', value: products.filter(p => p.is_active).length, color: 'var(--green)', bg: 'var(--green-light)' },
          { label: 'แสดงผลขณะนี้', value: filtered.length, color: 'var(--indigo)', bg: 'var(--indigo-light)' },
          { label: 'หมวดหมู่', value: CATEGORIES.length, color: 'var(--amber)', bg: 'var(--amber-light)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['รหัสสินค้า', 'ชื่อสินค้า', 'หมวดหมู่', 'ขนาด', 'คอนกรีต/หน่วย', 'BOM', 'WIP Code', 'สถานะ', 'จัดการ'].map((th, i) => (
                <th key={th} style={{ padding: '10px 14px', textAlign: i >= 7 ? 'center' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>{th}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const catKey = p.category.split(' ')[0]
              const catStyle = catColorMap[catKey] ?? { bg: '#F3F4F6', color: '#6B7280' }
              return (
                <tr key={p.id} className="hover:bg-[var(--bg)] transition-colors" style={{ opacity: p.is_active ? 1 : 0.5 }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--accent)', borderBottom: '1px solid var(--border)' }}>{p.code}</td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{p.unit}</div>
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ background: catStyle.bg, color: catStyle.color, padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{catKey}</span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{p.size}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>
                    {p.concrete_per_unit} <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>ม.³</span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', borderBottom: '1px solid var(--border)' }}>{p.bom_code ?? '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', borderBottom: '1px solid var(--border)' }}>{p.wip_code ?? '—'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: p.is_active ? 'var(--green-light)' : '#F3F4F6', color: p.is_active ? 'var(--green)' : '#9CA3AF' }}>
                      {p.is_active ? 'ใช้งาน' : 'ปิดใช้'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button onClick={() => openEdit(p)} style={{ padding: '5px 10px', background: 'var(--accent-light)', color: 'var(--accent)', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                        <i className="fas fa-pen"></i>
                      </button>
                      <button onClick={() => handleToggleActive(p)} style={{ padding: '5px 10px', background: p.is_active ? 'var(--amber-light)' : 'var(--green-light)', color: p.is_active ? 'var(--amber)' : 'var(--green)', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11 }}>
                        <i className={`fas ${p.is_active ? 'fa-toggle-off' : 'fa-toggle-on'}`}></i>
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
            <i className="fas fa-box-open" style={{ fontSize: 36, marginBottom: 12, display: 'block', opacity: 0.3 }}></i>
            ไม่พบสินค้า
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 540, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{editProduct ? 'แก้ไขข้อมูลสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { label: 'รหัสสินค้า *', key: 'code', placeholder: 'A41-015-0200', type: 'text' },
                { label: 'หน่วย', key: 'unit', placeholder: 'ชิ้น / แผ่น / ต้น', type: 'text' },
                { label: 'ชื่อสินค้า *', key: 'name', placeholder: 'เสาเข็ม .15x.15 2.00 ม.', type: 'text', colSpan: 2 },
                { label: 'ขนาด', key: 'size', placeholder: '0.15x0.15 2.00 ม.', type: 'text' },
                { label: 'คอนกรีต/หน่วย (ม.³)', key: 'concrete_per_unit', placeholder: '0.05', type: 'number' },
                { label: 'BOM Code', key: 'bom_code', placeholder: 'BOM-IP22-10', type: 'text' },
                { label: 'WIP Code', key: 'wip_code', placeholder: 'WIP-A41', type: 'text' },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: (f as any).colSpan === 2 ? 'span 2' : undefined }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>{f.label}</label>
                  <input
                    type={f.type} placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: f.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
                    style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>หมวดหมู่</label>
                <select value={form.category} onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                  style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', background: 'white' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '11px', border: '1px solid var(--border)', borderRadius: 8, background: 'white', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={handleSave} disabled={saving}
                style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>กำลังบันทึก...</> : <><i className="fas fa-save" style={{ marginRight: 6 }}></i>บันทึก</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
