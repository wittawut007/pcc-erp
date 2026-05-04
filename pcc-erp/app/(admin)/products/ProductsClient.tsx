'use client'

import { useState, useMemo } from 'react'
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

const CAT_STYLES = [
  { prefix: 'A13', short: 'แผ่นพื้นตัน', icon: 'fa-layer-group', pillBg: '#FFF7ED', pillText: '#EA580C', colorCode: '#2563EB' },
  { prefix: 'A30', short: 'ผนังรั้วสำเร็จรูป', icon: 'fa-table-cells-large', pillBg: '#FDF4FF', pillText: '#9333EA', colorCode: '#2563EB' },
  { prefix: 'A35', short: 'รั้วสำเร็จรูป', icon: 'fa-bars', pillBg: '#F3F4F6', pillText: '#4B5563', colorCode: '#2563EB' },
  { prefix: 'A36', short: 'เสา คาน บันได', icon: 'fa-cube', pillBg: '#F3F4F6', pillText: '#4B5563', colorCode: '#2563EB' },
  { prefix: 'A41', short: 'เสาเข็ม', icon: 'fa-arrows-up-down', pillBg: '#EFF4FF', pillText: '#2563EB', colorCode: '#2563EB' },
  { prefix: 'A42', short: 'กำแพงกันดิน', icon: 'fa-shield-halved', pillBg: '#F0FDF4', pillText: '#16A34A', colorCode: '#2563EB' },
]

const EMPTY_FORM = {
  code: '', name: '', category: CATEGORIES[0], size: '',
  unit: 'ชิ้น', concrete_per_unit: 0, bom_code: '', wip_code: '',
}

export default function ProductsClient({ products: initial }: { products: Product[] }) {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>(initial)
  
  // Filters
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [filterActive, setFilterActive] = useState('all') // 'all', 'active', 'inactive'
  
  // Pagination
  const [page, setPage] = useState(1)
  const itemsPerPage = 50

  const [showModal, setShowModal] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    return products.filter(p => {
      const filterPrefix = filterCat === 'all' ? 'all' : filterCat.split(' ')[0];
      const matchCat = filterPrefix === 'all' || p.category.startsWith(filterPrefix);
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase());
      const matchActive = filterActive === 'all' ? true : filterActive === 'active' ? p.is_active : !p.is_active;
      return matchCat && matchSearch && matchActive;
    })
  }, [products, filterCat, search, filterActive])

  // Pagination logic
  const totalItems = filtered.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)

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
        setProducts(prev => [data, ...prev])
        toast.success('เพิ่มสินค้าใหม่สำเร็จ!')
      }
      setShowModal(false)
    } catch (e: any) {
      toast.error(e.message.includes('duplicate') ? 'รหัสสินค้านี้มีอยู่แล้ว' : 'เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p: Product) => {
    if (confirm(`คุณต้องการลบสินค้า ${p.code} ใช่หรือไม่?`)) {
      const { error } = await supabase.from('products').delete().eq('id', p.id)
      if (error) { toast.error('เกิดข้อผิดพลาดในการลบ'); return }
      setProducts(prev => prev.filter(x => x.id !== p.id))
      toast.success('ลบสินค้าสำเร็จ!')
      
      const currentFilteredCount = filtered.length - 1
      if(page > 1 && (page - 1) * itemsPerPage >= currentFilteredCount) {
         setPage(page - 1)
      }
    }
  }

  const handleToggleActive = async (p: Product) => {
    const { error } = await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id)
    if (error) { toast.error('เกิดข้อผิดพลาด'); return }
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !x.is_active } : x))
    toast.success(p.is_active ? 'ปิดใช้งานสินค้าแล้ว' : 'เปิดใช้งานสินค้าแล้ว')
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      
      {/* Category Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        {CAT_STYLES.map(cat => {
          const count = products.filter(p => p.category.startsWith(cat.prefix)).length
          const fullCategoryName = `${cat.prefix} ${cat.short}`
          const isSelected = filterCat === fullCategoryName
          
          return (
            <div 
              key={cat.prefix} 
              onClick={() => {
                setFilterCat(isSelected ? 'all' : fullCategoryName)
                setPage(1)
              }}
              style={{ 
                background: cat.pillBg, 
                border: isSelected ? `2px solid ${cat.pillText}` : '1px solid transparent', 
                borderRadius: 'var(--radius)', 
                padding: isSelected ? '13px 15px' : '14px 16px', 
                position: 'relative', 
                overflow: 'hidden', 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                opacity: (filterCat !== 'all' && !isSelected) ? 0.6 : 1
              }}
            >
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: cat.pillText, borderTopLeftRadius: 'var(--radius)', borderBottomLeftRadius: 'var(--radius)' }}></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, paddingLeft: 4 }}>
                 <div style={{ fontSize: 11, fontWeight: 700, color: cat.pillText }}>{cat.prefix} {cat.short}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingLeft: 4 }}>
                 <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                   <span style={{ fontSize: 22, fontWeight: 700, color: cat.pillText, lineHeight: 1 }}>{count}</span>
                   <span style={{ fontSize: 11, color: cat.pillText, fontWeight: 500, opacity: 0.8 }}>รายการ</span>
                 </div>
                 <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'white', color: cat.pillText, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.9 }}>
                   <i className={`fas ${cat.icon}`} style={{ fontSize: 14 }}></i>
                 </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Actions Bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}></i>
          <input
            type="text"
            placeholder="ค้นหา ชื่อสินค้า, รหัส (FG)..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', outline: 'none' }}
          />
        </div>
        <select
          value={filterCat}
          onChange={e => { setFilterCat(e.target.value); setPage(1); }}
          style={{ padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', outline: 'none', minWidth: 160 }}
        >
          <option value="all">ทุกหมวดหมู่ (All Categories)</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterActive}
          onChange={e => { setFilterActive(e.target.value); setPage(1); }}
          style={{ padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', outline: 'none', minWidth: 140 }}
        >
            <option value="all">สถานะทั้งหมด</option>
            <option value="active">เปิดใช้งาน (Active)</option>
            <option value="inactive">ปิดใช้งาน (Inactive)</option>
        </select>

        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
            <button 
                onClick={() => toast('รอการเชื่อมต่อระบบ Import', { icon: '🚧' })}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
                <i className="fas fa-file-import"></i>
                Import CSV
            </button>
            <button 
                onClick={openAdd}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
                <i className="fas fa-plus"></i>
                เพิ่มรายการสินค้าใหม่
            </button>
        </div>
      </div>

      {/* Table Section */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>รหัสสินค้า (ITEM CODE)</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>ชื่อสินค้า (PRODUCT NAME)</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>ขนาดสินค้า (DIMENSIONS)</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>หมวดหมู่</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>สถานะ (STATUS)</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(p => {
                const prefix = p.category.split(' ')[0]
                const catStyle = CAT_STYLES.find(c => c.prefix === prefix) || CAT_STYLES[0]

                return (
                  <tr key={p.id} className="hover:bg-[var(--bg)] transition-colors" style={{ position: 'relative' }}>
                    {!p.is_active && <td style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--red)' }}></td>}
                    
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: p.is_active ? 'var(--text-primary)' : 'var(--text-muted)' }}>{p.code}</span>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: p.is_active ? 'var(--accent)' : 'var(--text-muted)' }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        WIP: {p.wip_code || 'ไม่ระบุ WIP'}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 11, color: p.is_active ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{p.size}</span>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '3px 8px', fontSize: 10, fontWeight: 700, borderRadius: 4, background: catStyle.pillBg, color: catStyle.pillText, opacity: p.is_active ? 1 : 0.6 }}>
                        {prefix}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                      {p.is_active ? (
                        <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #BBF7D0' }}>
                          ใช้งานปกติ (Active)
                        </span>
                      ) : (
                        <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: 'var(--red-light)', color: 'var(--red)', border: '1px solid #FECACA' }}>
                          <i className="fas fa-ban" style={{ fontSize: 9, marginRight: 3 }}></i> เลิกผลิต
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                      {p.is_active ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <button onClick={() => openEdit(p)} style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--bg)', color: 'var(--text-secondary)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} title="แก้ไข">
                            <i className="fas fa-edit" style={{ fontSize: 11 }}></i>
                          </button>
                          <button onClick={() => handleToggleActive(p)} style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--amber-light)', color: 'var(--amber)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} title="ปิดใช้งาน">
                            <i className="fas fa-power-off" style={{ fontSize: 11 }}></i>
                          </button>
                          <button onClick={() => handleDelete(p)} style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--bg)', color: 'var(--text-secondary)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} title="ลบ">
                            <i className="fas fa-trash-alt" style={{ fontSize: 11 }}></i>
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <button onClick={() => handleToggleActive(p)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--bg)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                            <i className="fas fa-rotate-right" style={{ fontSize: 9 }}></i>
                            เปิดใช้งาน
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          
          {paginated.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 12 }}>
              <i className="fas fa-box-open" style={{ fontSize: 24, marginBottom: 8, opacity: 0.3, display: 'block' }}></i>
              ไม่พบรายการสินค้า
            </div>
          )}
        </div>

        {/* Footer Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            แสดง {(page - 1) * itemsPerPage + (totalItems > 0 ? 1 : 0)} ถึง {Math.min(page * itemsPerPage, totalItems)} จากทั้งหมด {totalItems} รายการ
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button 
              disabled={page === 1} 
              onClick={() => setPage(page - 1)}
              style={{ padding: '4px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', border: 'none', background: 'transparent', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}
            >
              ก่อนหน้า
            </button>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, fontSize: 11, fontWeight: 600, 
                  background: page === p ? 'var(--accent)' : 'transparent', 
                  color: page === p ? 'white' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer'
                }}
              >
                {p}
              </button>
            ))}

            <button 
              disabled={page === totalPages || totalPages === 0}
              onClick={() => setPage(page + 1)}
              style={{ padding: '4px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', border: 'none', background: 'transparent', cursor: page === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer', opacity: page === totalPages || totalPages === 0 ? 0.5 : 1 }}
            >
              ถัดไป
            </button>
          </div>
        </div>
      </div>

      {/* Modal Form */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{editProduct ? 'แก้ไขข้อมูลสินค้า' : 'เพิ่มรายการสินค้าใหม่'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'รหัสสินค้า *', key: 'code', type: 'text', placeholder: 'A41-015-0200' },
                { label: 'หน่วย', key: 'unit', type: 'text', placeholder: 'ชิ้น / แผ่น / ต้น' },
                { label: 'ชื่อสินค้า *', key: 'name', type: 'text', placeholder: 'เสาเข็ม .15x.15 2.00 ม.', colSpan: 2 },
                { label: 'ขนาด', key: 'size', type: 'text', placeholder: '0.15x0.15 2.00 ม.' },
                { label: 'คอนกรีต/หน่วย (ม.³)', key: 'concrete_per_unit', type: 'number', placeholder: '0.05' },
                { label: 'BOM Code', key: 'bom_code', type: 'text', placeholder: 'BOM-IP22-10' },
                { label: 'WIP Code', key: 'wip_code', type: 'text', placeholder: 'WIP-A41' },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: (f as any).colSpan === 2 ? 'span 2' : undefined }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>{f.label}</label>
                  <input
                    type={f.type} placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: f.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
                    style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>หมวดหมู่</label>
                <select value={form.category} onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                  style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', background: 'white' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '11px', border: '1px solid var(--border)', borderRadius: 8, background: 'white', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
              <button 
                onClick={handleSave} disabled={saving}
                style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                {saving ? 'กำลังบันทึก...' : <><i className="fas fa-save" style={{ marginRight: 6 }}></i> บันทึกข้อมูล</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
