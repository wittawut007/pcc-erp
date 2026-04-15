'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface Product {
  id: string
  code: string
  name: string
  category: string
  concrete_per_unit: number
  unit: string
}

interface RawMaterial {
  name: string
  qty_on_hand: number
  unit: string
  min_stock: number
}

interface PlanItem {
  id?: string
  productId: string
  productCode: string
  productName: string
  category: string
  bed: string
  qty: number
  concrete: number
}

interface Props {
  products: Product[]
  todayPlan: any
  rawMaterials: RawMaterial[]
  today: string
}

const beds = ['A', 'B', 'C', 'D', 'E', 'F']

export default function PlannerClient({ products, todayPlan, rawMaterials, today }: Props) {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedBed, setSelectedBed] = useState('A')
  const [qty, setQty] = useState(1)
  const [planItems, setPlanItems] = useState<PlanItem[]>(
    todayPlan?.items?.map((item: any) => ({
      id: item.id,
      productId: item.product_id,
      productCode: item.product?.code ?? '',
      productName: item.product?.name ?? '',
      category: item.product?.category ?? '',
      bed: item.bed,
      qty: item.qty_target,
      concrete: (item.product?.concrete_per_unit ?? 0) * item.qty_target,
    })) ?? []
  )
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [filterCat, setFilterCat] = useState('ทั้งหมด')
  const [search, setSearch] = useState('')

  const categories = ['ทั้งหมด', ...Array.from(new Set(products.map(p => p.category)))]

  const filteredProducts = products.filter(p => {
    const matchCat = filterCat === 'ทั้งหมด' || p.category === filterCat
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const totalConcrete = planItems.reduce((s, i) => s + i.concrete, 0)
  const totalQty = planItems.reduce((s, i) => s + i.qty, 0)

  const handleAddProduct = () => {
    if (!selectedProduct) return
    const existing = planItems.findIndex(i => i.productId === selectedProduct.id && i.bed === selectedBed)
    if (existing >= 0) {
      const updated = [...planItems]
      updated[existing].qty += qty
      updated[existing].concrete = updated[existing].qty * selectedProduct.concrete_per_unit
      setPlanItems(updated)
    } else {
      setPlanItems([...planItems, {
        productId: selectedProduct.id,
        productCode: selectedProduct.code,
        productName: selectedProduct.name,
        category: selectedProduct.category,
        bed: selectedBed,
        qty,
        concrete: qty * selectedProduct.concrete_per_unit,
      }])
    }
    setQty(1)
  }

  const handleRemove = (idx: number) => {
    setPlanItems(planItems.filter((_, i) => i !== idx))
  }

  const handleSaveDraft = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Upsert plan
      const { data: plan, error: planError } = await supabase
        .from('production_plans')
        .upsert({ plan_date: today, created_by: user.id, status: 'draft', total_qty: totalQty, total_concrete: totalConcrete })
        .select()
        .single()
      if (planError) throw planError

      // Delete existing items
      await supabase.from('production_plan_items').delete().eq('plan_id', plan.id)

      // Insert new items
      if (planItems.length > 0) {
        const { error: itemsError } = await supabase.from('production_plan_items').insert(
          planItems.map(item => ({
            plan_id: plan.id,
            product_id: item.productId,
            bed: item.bed,
            qty_target: item.qty,
            status: 'pending',
          }))
        )
        if (itemsError) throw itemsError
      }

      // Log activity
      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'บันทึกแผนการผลิต (Draft)',
        entity_type: 'production_plan',
        entity_id: plan.id,
        detail: `วันที่ ${today} รวม ${totalQty} ชิ้น คอนกรีต ${totalConcrete.toFixed(2)} ม.³`,
      })

      toast.success('บันทึกแผนการผลิตสำเร็จ!')
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmPlan = async () => {
    setConfirming(true)
    try {
      await handleSaveDraft()
      const { data: plan } = await supabase.from('production_plans').select('id').eq('plan_date', today).single()
      if (!plan) throw new Error('Plan not found')

      await supabase.from('production_plans').update({ status: 'confirmed' }).eq('id', plan.id)

      // Fetch the generated plan items to get their IDs
      const { data: items } = await supabase.from('production_plan_items').select('id, bed, qty_target').eq('plan_id', plan.id)

      if (items && items.length > 0) {
        // Create job orders
        const { error: orderError } = await supabase.from('job_orders').insert(
          items.map(item => ({
            plan_item_id: item.id,
            bed: item.bed,
            qty_target: item.qty_target,
            status: 'pending'
          }))
        )
        // ignore duplicate key errors if already pressed
        if (orderError && !orderError.message.includes('duplicate')) throw orderError
      }

      toast.success('ยืนยันแผนการผลิตและสร้างคิวงานเทปูนแล้ว!')
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setConfirming(false)
    }
  }

  const isPlanConfirmed = todayPlan?.status === 'confirmed' || todayPlan?.status === 'completed'

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      {/* Toaster */}
      <div id="toast-container"></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 20 }}>
        {/* LEFT — Product Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Product Search */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>เลือกสินค้าที่จะผลิต</div>

            <div style={{ position: 'relative', marginBottom: 10 }}>
              <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}></i>
              <input
                type="text"
                placeholder="ค้นหารหัสหรือชื่อสินค้า..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: 'var(--bg)', outline: 'none' }}
              />
            </div>

            {/* Category Filter */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {categories.map(cat => (
                <button key={cat} onClick={() => setFilterCat(cat)} style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: filterCat === cat ? 'none' : '1px solid var(--border)',
                  background: filterCat === cat ? 'var(--accent)' : 'var(--bg)',
                  color: filterCat === cat ? 'white' : 'var(--text-secondary)',
                }}>
                  {cat === 'ทั้งหมด' ? 'ทั้งหมด' : cat.split(' ')[0]}
                </button>
              ))}
            </div>

            {/* Product List */}
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {filteredProducts.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                    background: selectedProduct?.id === p.id ? 'var(--accent-light)' : 'var(--bg)',
                    border: selectedProduct?.id === p.id ? '1.5px solid var(--accent)' : '1px solid transparent',
                    transition: 'all 0.1s',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      <span style={{ background: 'var(--border)', padding: '1px 6px', borderRadius: 4, marginRight: 6 }}>{p.code}</span>
                      {p.category.split(' ')[0]}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{p.concrete_per_unit} ม.³/{p.unit}</div>
                  </div>
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 12 }}>
                  <i className="fas fa-search" style={{ fontSize: 24, marginBottom: 8, display: 'block' }}></i>
                  ไม่พบสินค้า
                </div>
              )}
            </div>
          </div>

          {/* Add to Plan Controls */}
          {selectedProduct && (
            <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent)', marginBottom: 10 }}>
                <i className="fas fa-plus-circle" style={{ marginRight: 6 }}></i>
                เพิ่มลงแผน: {selectedProduct.name}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>แท่นผลิต</label>
                  <select value={selectedBed} onChange={e => setSelectedBed(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: 'white', outline: 'none' }}>
                    {beds.map(b => <option key={b} value={b}>แท่น {b}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>จำนวน ({selectedProduct.unit})</label>
                  <input type="number" min={1} value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)}
                    onFocus={e => e.target.select()}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, outline: 'none' }} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 10 }}>
                ปริมาณคอนกรีตที่ใช้: <strong>{(qty * selectedProduct.concrete_per_unit).toFixed(4)} ม.³</strong>
              </div>
              <button onClick={handleAddProduct} disabled={isPlanConfirmed}
                style={{
                  width: '100%', padding: '10px', background: isPlanConfirmed ? '#ccc' : 'var(--accent)', color: 'white',
                  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: isPlanConfirmed ? 'not-allowed' : 'pointer',
                }}>
                <i className="fas fa-plus" style={{ marginRight: 6 }}></i>
                เพิ่มลงตารางแผน
              </button>
            </div>
          )}

          {/* Raw Material Summary */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
              <i className="fas fa-layer-group" style={{ marginRight: 6, color: 'var(--accent)' }}></i>
              วัตถุดิบในคลัง (RM)
            </div>
            {rawMaterials.slice(0, 6).map((rm, i) => {
              const isLow = rm.qty_on_hand <= rm.min_stock
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12 }}>{rm.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isLow ? 'var(--red)' : 'var(--green)' }}>
                    {rm.qty_on_hand} {rm.unit}
                    {isLow && <i className="fas fa-exclamation-triangle" style={{ marginLeft: 4, fontSize: 10 }}></i>}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* RIGHT — Plan Table + Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Plan Status Banner */}
          {isPlanConfirmed && (
            <div style={{ background: '#ECFDF5', border: '1px solid #10B981', borderRadius: 'var(--radius)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="fas fa-check-circle" style={{ color: 'var(--green)', fontSize: 20 }}></i>
              <div>
                <div style={{ fontWeight: 700, color: '#047857', fontSize: 13 }}>แผนการผลิตได้รับการยืนยันแล้ว</div>
                <div style={{ fontSize: 11, color: '#059669' }}>ใบสั่งผลิตถูกสร้างเรียบร้อยแล้ว ไม่สามารถแก้ไขได้</div>
              </div>
            </div>
          )}

          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: 'รายการทั้งหมด', value: planItems.length, unit: 'รายการ', icon: 'fa-list', color: 'var(--accent)' },
              { label: 'จำนวนผลิต', value: totalQty.toLocaleString(), unit: 'ชิ้น', icon: 'fa-cubes', color: 'var(--green)' },
              { label: 'คอนกรีตรวม', value: totalConcrete.toFixed(2), unit: 'ม.³', icon: 'fa-fill-drip', color: 'var(--amber)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', textAlign: 'center' }}>
                <i className={`fas ${s.icon}`} style={{ fontSize: 22, color: s.color, marginBottom: 6, display: 'block' }}></i>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
                <div style={{ fontSize: 10, color: s.color, fontWeight: 600 }}>{s.unit}</div>
              </div>
            ))}
          </div>

          {/* Plan Table */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', flex: 1 }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>
                รายการแผนการผลิตวันนี้
                <span style={{ marginLeft: 8, background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                  {planItems.length} รายการ
                </span>
              </span>
              {!isPlanConfirmed && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleSaveDraft} disabled={saving || planItems.length === 0}
                    style={{ padding: '7px 14px', border: '1px solid var(--accent)', borderRadius: 6, background: 'white', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {saving ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 4 }}></i>บันทึก...</> : <><i className="fas fa-save" style={{ marginRight: 4 }}></i>บันทึก Draft</>}
                  </button>
                  <button onClick={handleConfirmPlan} disabled={confirming || planItems.length === 0}
                    style={{ padding: '7px 14px', border: 'none', borderRadius: 6, background: 'var(--accent)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {confirming ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 4 }}></i>กำลังยืนยัน...</> : <><i className="fas fa-check" style={{ marginRight: 4 }}></i>ยืนยันแผน</>}
                  </button>
                </div>
              )}
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 420 }}>
              {planItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                  <i className="fas fa-clipboard-list" style={{ fontSize: 36, marginBottom: 12, display: 'block', opacity: 0.3 }}></i>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>ยังไม่มีรายการในแผน</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>เลือกสินค้าทางซ้ายแล้วกด "เพิ่มลงตารางแผน"</div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['#', 'สินค้า', 'แท่น', 'จำนวน', 'คอนกรีต', ''].map((th, i) => (
                        <th key={th + i} style={{ padding: '8px 12px', textAlign: i >= 3 ? 'right' : 'left', color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>{th}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {planItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-[var(--bg)] transition-colors">
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ fontWeight: 600 }}>{item.productName}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{item.productCode}</div>
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '3px 10px', borderRadius: 4, fontWeight: 700, fontSize: 12 }}>แท่น {item.bed}</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>{item.qty.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'monospace', borderBottom: '1px solid var(--border)' }}>{item.concrete.toFixed(4)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>
                          {!isPlanConfirmed && (
                            <button onClick={() => handleRemove(idx)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: '4px 6px', borderRadius: 4 }}>
                              <i className="fas fa-times"></i>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg)' }}>
                      <td colSpan={3} style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12 }}>รวมทั้งหมด</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{totalQty.toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--amber)', fontFamily: 'monospace' }}>{totalConcrete.toFixed(4)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
