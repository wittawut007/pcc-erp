'use client'

import { useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Product {
  id: string
  code: string
  name: string
  category: string
  size: string
  unit: string
  concrete_per_unit: number
  wire_per_unit?: number | null
  mesh_per_unit?: number | null
  rebar_per_unit?: number | null
  bom_code: string | null
  wip_code: string | null
  length: number | null
  is_active: boolean
  created_at: string
}

interface RawMaterial {
  id: string
  name: string
  category: 'ลวด' | 'เมช' | 'เหล็กเส้น' | string
  unit: string
  material_code: string | null
}

interface BomItemRow {
  id?: string           // uuid from product_bom_items (for existing rows)
  raw_material_id: string
  raw_material_name: string
  raw_material_unit: string
  qty_per_unit: number | string
  sort_order: number
}

export interface ProductBomItem {
  id: string
  product_id: string
  raw_material_id: string
  qty_per_unit: number
  sort_order: number
  raw_materials: {
    id: string
    name: string
    category: string
    unit: string
    material_code: string | null
  }
}

interface FormBom {
  wire: BomItemRow[]
  mesh: BomItemRow[]
  rebar: BomItemRow[]
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORIES = [
  'A13 แผ่นพื้น',
  'A30 ผนังรั้วสำเร็จรูป',
  'A35 รั้วสำเร็จรูป',
  'A36 เสา คาน บันได',
  'A41 เสาเข็ม',
  'A42 กำแพงกันดิน',
  'A82 เสารั้ว',
]

const CAT_STYLES = [
  { prefix: 'A13', short: 'แผ่นพื้น', icon: 'fa-layer-group', pillBg: '#FFF7ED', pillText: '#EA580C', colorCode: '#2563EB' },
  { prefix: 'A30', short: 'ผนังรั้วสำเร็จรูป', icon: 'fa-table-cells-large', pillBg: '#FDF4FF', pillText: '#9333EA', colorCode: '#2563EB' },
  { prefix: 'A35', short: 'รั้วสำเร็จรูป', icon: 'fa-bars', pillBg: '#F3F4F6', pillText: '#4B5563', colorCode: '#2563EB' },
  { prefix: 'A36', short: 'เสา คาน บันได', icon: 'fa-cube', pillBg: '#F3F4F6', pillText: '#4B5563', colorCode: '#2563EB' },
  { prefix: 'A41', short: 'เสาเข็ม', icon: 'fa-arrows-up-down', pillBg: '#EFF4FF', pillText: '#2563EB', colorCode: '#2563EB' },
  { prefix: 'A42', short: 'กำแพงกันดิน', icon: 'fa-shield-halved', pillBg: '#F0FDF4', pillText: '#16A34A', colorCode: '#2563EB' },
  { prefix: 'A82', short: 'เสารั้ว', icon: 'fa-cubes', pillBg: '#FFF7ED', pillText: '#EA580C', colorCode: '#2563EB' },
]

const BOM_CATEGORY_CONFIG = {
  wire: {
    key: 'wire' as const,
    label: 'ลวด',
    icon: 'fa-coil-spring',
    iconFallback: 'fa-circle-nodes',
    color: '#B45309',
    bg: '#FFFBEB',
    border: '#FDE68A',
    unitLabel: 'ม./หน่วย',
    placeholder: 'เลือกประเภทลวด...',
  },
  mesh: {
    key: 'mesh' as const,
    label: 'เมช',
    icon: 'fa-table-cells',
    color: '#0369A1',
    bg: '#F0F9FF',
    border: '#BAE6FD',
    unitLabel: 'ตร.ม./หน่วย',
    placeholder: 'เลือกประเภทเมช...',
  },
  rebar: {
    key: 'rebar' as const,
    label: 'เหล็กเส้น',
    icon: 'fa-bars-staggered',
    color: '#475569',
    bg: '#F8FAFC',
    border: '#CBD5E1',
    unitLabel: 'ม./หน่วย',
    placeholder: 'เลือกประเภทเหล็กเส้น...',
  },
}

const EMPTY_BASE_FORM = {
  code: '', name: '', category: CATEGORIES[0], size: '',
  unit: 'ชิ้น', concrete_per_unit: '' as string | number, length: '' as string | number,
}

const EMPTY_BOM: FormBom = { wire: [], mesh: [], rebar: [] }

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProductsClient({
  products: initial,
  rawMaterials,
  productBomItems: initialBomItems,
}: {
  products: Product[]
  rawMaterials: RawMaterial[]
  productBomItems: ProductBomItem[]
}) {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>(initial)
  const [productBomItems, setProductBomItems] = useState<ProductBomItem[]>(initialBomItems)

  // Filters
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [filterActive, setFilterActive] = useState('all')

  // Pagination
  const [page, setPage] = useState(1)
  const itemsPerPage = 50

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [baseForm, setBaseForm] = useState(EMPTY_BASE_FORM)
  const [bomForm, setBomForm] = useState<FormBom>(EMPTY_BOM)
  const [saving, setSaving] = useState(false)

  // CSV Import state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importRows, setImportRows] = useState<any[]>([])
  const [importing, setImporting] = useState(false)

  // ─── Derived: rawMaterials grouped by category ────────────────────────────
  const wireOptions = useMemo(() => rawMaterials.filter(rm => rm.category === 'ลวด'), [rawMaterials])
  const meshOptions = useMemo(() => rawMaterials.filter(rm => rm.category === 'เมช'), [rawMaterials])
  const rebarOptions = useMemo(() => rawMaterials.filter(rm => rm.category === 'เหล็กเส้น'), [rawMaterials])

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const buildBomItemRow = (rmId: string, options: RawMaterial[]): BomItemRow | null => {
    const rm = options.find(r => r.id === rmId)
    if (!rm) return null
    return { raw_material_id: rm.id, raw_material_name: rm.name, raw_material_unit: rm.unit, qty_per_unit: 0, sort_order: 1 }
  }

  const addBomRow = (category: keyof FormBom, options: RawMaterial[]) => {
    // Default to first available option not already selected
    const used = bomForm[category].map(r => r.raw_material_id)
    const available = options.find(o => !used.includes(o.id))
    if (!available) { toast.error('ไม่มีวัตถุดิบในกลุ่มนี้ให้เลือกเพิ่มแล้ว'); return }
    setBomForm(prev => {
      const nextSortOrder = prev[category].length + 1
      return {
        ...prev,
        [category]: [
          ...prev[category],
          {
            raw_material_id: available.id,
            raw_material_name: available.name,
            raw_material_unit: available.unit,
            qty_per_unit: 0,
            sort_order: nextSortOrder
          }
        ]
      }
    })
  }

  const updateBomRow = (category: keyof FormBom, index: number, field: 'raw_material_id' | 'qty_per_unit', value: string | number, options: RawMaterial[]) => {
    setBomForm(prev => {
      const rows = [...prev[category]]
      if (field === 'raw_material_id') {
        const rm = options.find(r => r.id === value)
        if (!rm) return prev
        rows[index] = { ...rows[index], raw_material_id: rm.id, raw_material_name: rm.name, raw_material_unit: rm.unit }
      } else {
        rows[index] = { ...rows[index], qty_per_unit: value }
      }
      return { ...prev, [category]: rows }
    })
  }

  const removeBomRow = (category: keyof FormBom, index: number) => {
    setBomForm(prev => {
      const remaining = prev[category].filter((_, i) => i !== index)
      const remapped = remaining.map((row, idx) => ({
        ...row,
        sort_order: idx + 1
      }))
      return { ...prev, [category]: remapped }
    })
  }

  // ─── Export CSV ───────────────────────────────────────────────────────────

  const handleExportCSV = () => {
    const headers = ['code','name','category','size','unit','concrete_per_unit','wire_per_unit','mesh_per_unit','rebar_per_unit','bom_code','length','is_active']
    const rows = products.map(p => [
      p.code, p.name, p.category, p.size, p.unit,
      p.concrete_per_unit, p.wire_per_unit ?? '', p.mesh_per_unit ?? '', p.rebar_per_unit ?? '',
      p.bom_code ?? '', p.length ?? '',
      p.is_active ? 'TRUE' : 'FALSE'
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `products_export_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`ดาวน์โหลด CSV สำเร็จ (${products.length} รายการ)`)
  }

  // ─── Import CSV ───────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.csv')) { toast.error('กรุณาเลือกไฟล์ .csv เท่านั้น'); return }

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string
        const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
        if (lines.length < 2) { toast.error('ไฟล์ CSV ต้องมีข้อมูลอย่างน้อย 1 แถว'); return }

        const parseCSVLine = (line: string): string[] => {
          const result: string[] = []
          let current = ''
          let inQuotes = false
          for (let i = 0; i < line.length; i++) {
            const ch = line[i]
            if (ch === '"' && inQuotes && line[i+1] === '"') { current += '"'; i++; continue }
            if (ch === '"') { inQuotes = !inQuotes; continue }
            if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
            current += ch
          }
          result.push(current.trim())
          return result
        }

        const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim())
        const requiredCols = ['code', 'name', 'category']
        const missing = requiredCols.filter(c => !headers.includes(c))
        if (missing.length > 0) { toast.error(`ไม่พบคอลัมน์ที่จำเป็น: ${missing.join(', ')}`); return }

        const parsed = lines.slice(1).map(line => {
          const vals = parseCSVLine(line)
          const row: any = {}
          headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
          return {
            code: row['code'] || '',
            name: row['name'] || '',
            category: row['category'] || CATEGORIES[0],
            size: row['size'] || '',
            unit: row['unit'] || 'ชิ้น',
            concrete_per_unit: parseFloat(row['concrete_per_unit']) || 0,
            wire_per_unit: parseFloat(row['wire_per_unit']) || 0,
            mesh_per_unit: parseFloat(row['mesh_per_unit']) || 0,
            rebar_per_unit: parseFloat(row['rebar_per_unit']) || 0,
            bom_code: row['bom_code'] || null,
            length: parseFloat(row['length']) || null,
            is_active: row['is_active']?.toUpperCase() !== 'FALSE',
          }
        }).filter(r => r.code && r.name)

        if (parsed.length === 0) { toast.error('ไม่พบข้อมูลที่ถูกต้องในไฟล์'); return }
        setImportRows(parsed)
        setShowImportModal(true)
      } catch {
        toast.error('เกิดข้อผิดพลาดในการอ่านไฟล์ CSV')
      }
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  const handleConfirmImport = async () => {
    if (importing) return
    setImporting(true)
    try {
      const { data, error } = await supabase
        .from('products')
        .upsert(importRows, { onConflict: 'code' })
        .select()
      if (error) throw error
      const { data: refreshed } = await supabase.from('products').select('*').order('category').order('code')
      setProducts(refreshed ?? [])
      toast.success(`นำเข้าสำเร็จ ${importRows.length} รายการ`)
      setShowImportModal(false)
      setImportRows([])
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setImporting(false)
    }
  }

  // ─── Filter + Pagination ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return products.filter(p => {
      const filterPrefix = filterCat === 'all' ? 'all' : filterCat.split(' ')[0]
      const matchCat = filterPrefix === 'all' || p.category.startsWith(filterPrefix)
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())
      const matchActive = filterActive === 'all' ? true : filterActive === 'active' ? p.is_active : !p.is_active
      return matchCat && matchSearch && matchActive
    })
  }, [products, filterCat, search, filterActive])

  const totalItems = filtered.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  // ─── Modal Open Handlers ──────────────────────────────────────────────────

  const openAdd = () => {
    setEditProduct(null)
    setBaseForm(EMPTY_BASE_FORM)
    setBomForm(EMPTY_BOM)
    setShowModal(true)
  }

  const openEdit = (p: Product) => {
    setEditProduct(p)
    setBaseForm({
      code: p.code, name: p.name, category: p.category, size: p.size,
      unit: p.unit, concrete_per_unit: p.concrete_per_unit,
      length: p.length ?? 0,
    })

    // Build BOM from product_bom_items
    const items = productBomItems.filter(item => item.product_id === p.id)
    const toRow = (item: ProductBomItem): BomItemRow => ({
      id: item.id,
      raw_material_id: item.raw_material_id,
      raw_material_name: item.raw_materials?.name ?? '',
      raw_material_unit: item.raw_materials?.unit ?? '',
      qty_per_unit: Number(item.qty_per_unit),
      sort_order: item.sort_order ?? 1,
    })

    setBomForm({
      wire:  items.filter(i => i.raw_materials?.category === 'ลวด').map(toRow).sort((a, b) => a.sort_order - b.sort_order),
      mesh:  items.filter(i => i.raw_materials?.category === 'เมช').map(toRow).sort((a, b) => a.sort_order - b.sort_order),
      rebar: items.filter(i => i.raw_materials?.category === 'เหล็กเส้น').map(toRow).sort((a, b) => a.sort_order - b.sort_order),
    })
    setShowModal(true)
  }

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!baseForm.code || !baseForm.name) { toast.error('กรุณากรอกรหัสและชื่อสินค้า'); return }
    setSaving(true)
    try {
      const payload = {
        ...baseForm,
        concrete_per_unit: parseFloat(baseForm.concrete_per_unit as string) || 0,
        bom_code: null, // deprecated — now using product_bom_items
        wip_code: null, // Always null since WIP is removed from the system
        length: baseForm.category.startsWith('A13') ? (parseFloat(baseForm.length as string) || null) : null,
        // Keep legacy columns for backward compatibility (sum of qty)
        wire_per_unit: bomForm.wire.reduce((s, r) => s + (parseFloat(r.qty_per_unit as string) || 0), 0) || null,
        mesh_per_unit: bomForm.mesh.reduce((s, r) => s + (parseFloat(r.qty_per_unit as string) || 0), 0) || null,
        rebar_per_unit: bomForm.rebar.reduce((s, r) => s + (parseFloat(r.qty_per_unit as string) || 0), 0) || null,
      }

      let productId: string

      if (editProduct) {
        const { error } = await supabase.from('products').update(payload).eq('id', editProduct.id)
        if (error) throw error
        setProducts(prev => prev.map(p => p.id === editProduct.id ? { ...p, ...payload } : p))
        productId = editProduct.id
      } else {
        const { data, error } = await supabase.from('products').insert({ ...payload, is_active: true }).select().single()
        if (error) throw error
        setProducts(prev => [data, ...prev])
        productId = data.id
      }

      // Upsert BOM items
      const allBomRows = [...bomForm.wire, ...bomForm.mesh, ...bomForm.rebar]
        .filter(r => r.raw_material_id && (parseFloat(r.qty_per_unit as string) || 0) > 0)
        .map(r => ({
          product_id: productId,
          raw_material_id: r.raw_material_id,
          qty_per_unit: parseFloat(r.qty_per_unit as string) || 0,
          sort_order: r.sort_order
        }))

      // Delete removed items (existing product only)
      if (editProduct) {
        const { error: delError } = await supabase
          .from('product_bom_items')
          .delete()
          .eq('product_id', productId)
        if (delError) throw delError
      }

      if (allBomRows.length > 0) {
        const { error: bomError } = await supabase
          .from('product_bom_items')
          .insert(allBomRows)
        if (bomError) throw bomError
      }

      // Refresh local BOM state
      const { data: refreshedBom } = await supabase
        .from('product_bom_items')
        .select('id, product_id, raw_material_id, qty_per_unit, sort_order, raw_materials(id, name, category, unit, material_code)')
        .eq('product_id', productId)
      setProductBomItems(prev => {
        const others = prev.filter(b => b.product_id !== productId)
        return [...others, ...((refreshedBom as unknown as ProductBomItem[]) ?? [])]
      })

      toast.success(editProduct ? 'แก้ไขข้อมูลสินค้าสำเร็จ!' : 'เพิ่มสินค้าใหม่สำเร็จ!')
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
      setProductBomItems(prev => prev.filter(b => b.product_id !== p.id))
      toast.success('ลบสินค้าสำเร็จ!')
      const currentFilteredCount = filtered.length - 1
      if (page > 1 && (page - 1) * itemsPerPage >= currentFilteredCount) setPage(page - 1)
    }
  }

  const handleToggleActive = async (p: Product) => {
    const { error } = await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id)
    if (error) { toast.error('เกิดข้อผิดพลาด'); return }
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !x.is_active } : x))
    toast.success(p.is_active ? 'ปิดใช้งานสินค้าแล้ว' : 'เปิดใช้งานสินค้าแล้ว')
  }

  // ─── BOM Section Sub-component ────────────────────────────────────────────

  const renderBomSection = (
    categoryKey: keyof FormBom,
    options: RawMaterial[]
  ) => {
    const config = BOM_CATEGORY_CONFIG[categoryKey]
    const rows = bomForm[categoryKey]

    return (
      <div style={{ border: `1px solid ${config.border}`, borderRadius: 10, overflow: 'hidden' }}>
        {/* Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: config.bg, borderBottom: rows.length > 0 ? `1px solid ${config.border}` : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <i className={`fas ${config.icon}`} style={{ color: config.color, fontSize: 12 }}></i>
            <span style={{ fontSize: 12, fontWeight: 700, color: config.color }}>{config.label}</span>
            {rows.length > 0 && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 10, background: config.color, color: 'white' }}>
                {rows.length} รายการ
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => addBomRow(categoryKey, options)}
            disabled={options.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: config.color, color: 'white', border: 'none',
              opacity: options.length === 0 ? 0.4 : 1,
            }}
          >
            <i className="fas fa-plus" style={{ fontSize: 9 }}></i>
            เพิ่ม{config.label}
          </button>
        </div>

        {/* BOM Rows */}
        {rows.length > 0 && (
          <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6, background: 'white' }}>
            {rows.map((row, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '45px 1fr 110px 28px', gap: 6, alignItems: 'center' }}>
                {/* Index badge */}
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: config.color,
                  background: config.bg,
                  border: `1px solid ${config.border}`,
                  borderRadius: 6,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  whiteSpace: 'nowrap'
                }}>
                  #{row.sort_order}
                </div>

                {/* Material Dropdown */}
                <select
                  value={row.raw_material_id}
                  onChange={e => updateBomRow(categoryKey, idx, 'raw_material_id', e.target.value, options)}
                  style={{
                    width: '100%', padding: '7px 8px', border: `1px solid ${config.border}`,
                    borderRadius: 6, fontSize: 11, outline: 'none', background: 'white',
                    color: '#1e293b', boxSizing: 'border-box'
                  }}
                >
                  {options.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name} ({opt.material_code ?? opt.unit})
                    </option>
                  ))}
                </select>

                {/* Quantity Input */}
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.qty_per_unit ?? ''}
                    placeholder="0.0000"
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '' || /^[0-9.]*$/.test(val)) {
                        updateBomRow(categoryKey, idx, 'qty_per_unit', val, options);
                      }
                    }}
                    style={{
                      width: '100%', padding: '7px 24px 7px 8px', border: `1px solid ${config.border}`,
                      borderRadius: 6, fontSize: 11, outline: 'none', boxSizing: 'border-box',
                      textAlign: 'right',
                    }}
                  />
                  <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: '#94a3b8', pointerEvents: 'none' }}>
                    {row.raw_material_unit || config.unitLabel.split('/')[0]}
                  </span>
                </div>

                {/* Remove Button */}
                <button
                  type="button"
                  onClick={() => removeBomRow(categoryKey, idx)}
                  style={{ width: 28, height: 28, borderRadius: 6, background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                  title="ลบรายการนี้"
                >
                  <i className="fas fa-trash-alt" style={{ fontSize: 10 }}></i>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {rows.length === 0 && (
          <div style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: '#94a3b8', background: 'white' }}>
            ไม่มี {config.label} — กด <strong>เพิ่ม{config.label}</strong> เพื่อระบุ BOM
          </div>
        )}
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

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
              onClick={() => { setFilterCat(isSelected ? 'all' : fullCategoryName); setPage(1) }}
              style={{
                background: cat.pillBg,
                border: isSelected ? `2px solid ${cat.pillText}` : '1px solid transparent',
                borderRadius: 'var(--radius)',
                padding: isSelected ? '13px 15px' : '14px 16px',
                position: 'relative', overflow: 'hidden',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.2s ease',
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
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', outline: 'none' }}
          />
        </div>
        <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1) }}
          style={{ padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', outline: 'none', minWidth: 160 }}>
          <option value="all">ทุกหมวดหมู่ (All Categories)</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterActive} onChange={e => { setFilterActive(e.target.value); setPage(1) }}
          style={{ padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', outline: 'none', minWidth: 140 }}>
          <option value="all">สถานะทั้งหมด</option>
          <option value="active">เปิดใช้งาน (Active)</option>
          <option value="inactive">ปิดใช้งาน (Inactive)</option>
        </select>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
          <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />
          <button onClick={handleExportCSV}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--surface)', color: '#16A34A', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <i className="fas fa-file-arrow-down"></i> Export CSV
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <i className="fas fa-file-import"></i> Import CSV
          </button>
          <button onClick={openAdd}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <i className="fas fa-plus"></i> เพิ่มรายการสินค้าใหม่
          </button>
        </div>
      </div>

      {/* Table Section */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['รหัสสินค้า (ITEM CODE)', 'ชื่อสินค้า (PRODUCT NAME)', 'ขนาดสินค้า (DIMENSIONS)', 'หมวดหมู่', 'สถานะ (STATUS)', 'จัดการ'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: i >= 3 ? 'center' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map(p => {
                const prefix = p.category.split(' ')[0]
                const catStyle = CAT_STYLES.find(c => c.prefix === prefix) || CAT_STYLES[0]
                const bomCount = productBomItems.filter(b => b.product_id === p.id).length

                return (
                  <tr key={p.id} className="hover:bg-[var(--bg)] transition-colors" style={{ position: 'relative' }}>
                    {!p.is_active && <td style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--red)' }}></td>}
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: p.is_active ? 'var(--text-primary)' : 'var(--text-muted)' }}>{p.code}</span>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: p.is_active ? 'var(--accent)' : 'var(--text-muted)' }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
                        {bomCount > 0 && (
                          <span style={{ color: '#0369A1', fontWeight: 600 }}>
                            <i className="fas fa-cubes" style={{ fontSize: 8, marginRight: 3 }}></i>BOM {bomCount} รายการ
                          </span>
                        )}
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
                            <i className="fas fa-rotate-right" style={{ fontSize: 9 }}></i> เปิดใช้งาน
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
            <button disabled={page === 1} onClick={() => setPage(page - 1)}
              style={{ padding: '4px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', border: 'none', background: 'transparent', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>
              ก่อนหน้า
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, fontSize: 11, fontWeight: 600, background: page === p ? 'var(--accent)' : 'transparent', color: page === p ? 'white' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>
                {p}
              </button>
            ))}
            <button disabled={page === totalPages || totalPages === 0} onClick={() => setPage(page + 1)}
              style={{ padding: '4px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', border: 'none', background: 'transparent', cursor: page === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer', opacity: page === totalPages || totalPages === 0 ? 0.5 : 1 }}>
              ถัดไป
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Import CSV Preview Modal
      ════════════════════════════════════════════════════════════════════════ */}
      {showImportModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 24, width: '100%', maxWidth: 760, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>ตรวจสอบข้อมูลก่อน Import</h2>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>พบ {importRows.length} รายการ — ระบบจะ Upsert โดยใช้ &quot;รหัสสินค้า&quot; เป็น Key</p>
              </div>
              <button onClick={() => setShowImportModal(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>
                  <tr>
                    {['รหัส', 'ชื่อสินค้า', 'หมวดหมู่', 'ขนาด', 'หน่วย', 'คอนกรีต/หน่วย', 'สถานะ'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 700 }}>{r.code}</td>
                      <td style={{ padding: '7px 10px' }}>{r.name}</td>
                      <td style={{ padding: '7px 10px' }}>{r.category}</td>
                      <td style={{ padding: '7px 10px' }}>{r.size || '-'}</td>
                      <td style={{ padding: '7px 10px' }}>{r.unit}</td>
                      <td style={{ padding: '7px 10px' }}>{r.concrete_per_unit}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: r.is_active ? 'var(--green-light)' : 'var(--red-light)', color: r.is_active ? 'var(--green)' : 'var(--red)' }}>
                          {r.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setShowImportModal(false)} style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 8, background: 'white', fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={handleConfirmImport} disabled={importing}
                style={{ flex: 2, padding: '10px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 700, cursor: importing ? 'wait' : 'pointer', opacity: importing ? 0.7 : 1 }}>
                {importing ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>กำลัง Import...</> : <><i className="fas fa-file-import" style={{ marginRight: 6 }}></i>ยืนยัน Import {importRows.length} รายการ</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Add / Edit Product Modal — BOM Grouped Form
      ════════════════════════════════════════════════════════════════════════ */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.22)' }}>

            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px 14px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#0F172A' }}>
                  {editProduct ? 'แก้ไขข้อมูลสินค้า' : 'เพิ่มรายการสินค้าใหม่'}
                </h2>
                <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>กรอกข้อมูลพื้นฐานและระบุวัตถุดิบ (BOM) แต่ละกลุ่ม</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ width: 30, height: 30, borderRadius: 8, background: '#F1F5F9', border: 'none', fontSize: 14, cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            {/* Modal Scrollable Body */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '16px 22px' }}>

              {/* ── Section 1: ข้อมูลพื้นฐาน ──────────────────────────── */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fas fa-tag" style={{ fontSize: 10, color: '#2563EB' }}></i>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1E293B' }}>ข้อมูลพื้นฐาน</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {/* Code */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>รหัสสินค้า *</label>
                    <input type="text" placeholder="A41-015-0200" value={baseForm.code}
                      onChange={e => setBaseForm(p => ({ ...p, code: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  {/* Unit */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>หน่วย</label>
                    <input type="text" placeholder="ชิ้น / แผ่น / ต้น" value={baseForm.unit}
                      onChange={e => setBaseForm(p => ({ ...p, unit: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  {/* Name */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>ชื่อสินค้า *</label>
                    <input type="text" placeholder="เสาเข็ม .15x.15 2.00 ม." value={baseForm.name}
                      onChange={e => setBaseForm(p => ({ ...p, name: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  {/* Size */}
                  <div style={{ gridColumn: baseForm.category.startsWith('A13') ? 'span 1' : 'span 2' }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>ขนาด</label>
                    <input type="text" placeholder="0.15x0.15 2.00 ม." value={baseForm.size}
                      onChange={e => setBaseForm(p => ({ ...p, size: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  {/* Length (only for A13 category) */}
                  {baseForm.category.startsWith('A13') && (
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>ระบุความยาว (ม.)</label>
                      <input type="text" inputMode="decimal" placeholder="เช่น 2.50" value={baseForm.length ?? ''}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^[0-9.]*$/.test(val)) {
                            setBaseForm(p => ({ ...p, length: val }));
                          }
                        }}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  )}
                  {/* Category */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>หมวดหมู่</label>
                    <select value={baseForm.category} onChange={e => setBaseForm(p => ({ ...p, category: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12, outline: 'none', background: 'white' }}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* ── Section 2: คอนกรีต ─────────────────────────────────── */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fas fa-fill-drip" style={{ fontSize: 10, color: '#16A34A' }}></i>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1E293B' }}>คอนกรีต</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 14px', background: '#F0FDF4' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#166534', flexShrink: 0 }}>ปริมาณคอนกรีต</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.0000"
                    value={baseForm.concrete_per_unit ?? ''}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '' || /^[0-9.]*$/.test(val)) {
                        setBaseForm(p => ({ ...p, concrete_per_unit: val }));
                      }
                    }}
                    style={{ flex: 1, padding: '7px 10px', border: '1px solid #86EFAC', borderRadius: 7, fontSize: 12, outline: 'none', textAlign: 'right', background: 'white', boxSizing: 'border-box' }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#166534', flexShrink: 0 }}>ม.³ / หน่วย</span>
                </div>
              </div>

              {/* ── Section 3: BOM วัตถุดิบ ────────────────────────────── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, background: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fas fa-cubes" style={{ fontSize: 10, color: '#B45309' }}></i>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1E293B' }}>วัตถุดิบ (BOM)</span>
                  <span style={{ fontSize: 10, color: '#94A3B8' }}>— เพิ่มหลายรายการได้ต่อกลุ่ม</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {renderBomSection('wire', wireOptions)}
                  {renderBomSection('mesh', meshOptions)}
                  {renderBomSection('rebar', rebarOptions)}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', gap: 10, padding: '14px 22px 18px', borderTop: '1px solid #F1F5F9', flexShrink: 0 }}>
              <button onClick={() => setShowModal(false)}
                style={{ flex: 1, padding: '11px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white', fontSize: 13, cursor: 'pointer', color: '#475569', fontWeight: 600 }}>
                ยกเลิก
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>กำลังบันทึก...</> : <><i className="fas fa-save" style={{ marginRight: 6 }}></i>บันทึกข้อมูล</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
