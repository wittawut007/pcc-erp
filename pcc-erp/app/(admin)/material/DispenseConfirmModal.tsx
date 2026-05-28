'use client'

import { useState, useEffect, useRef } from 'react'

interface RawMaterial {
  id: string
  material_code: string | null
  name: string
  unit: string
  qty_on_hand: number
  weight_per_meter: number | null
  category: string
}

interface Requisition {
  id: string
  plan_id: string
  raw_material_id: string
  qty_required: number
  qty_dispensed: number
  status: string
  notes: string | null
  dispensed_at: string | null
  raw_material: RawMaterial | null
  plan: { id: string; plan_date: string; status: string; production_orders?: { order_number: string }[] } | null
  dispensed_by_profile: { full_name: string } | null
  receiver_name: string | null
}

interface Props {
  item: Requisition | null
  onClose: () => void
  onConfirm: (itemId: string, qty: number, receiverName: string) => Promise<void>
  isLoading: boolean
  initialReceiver?: string
}

export default function DispenseConfirmModal({ item, onClose, onConfirm, isLoading, initialReceiver }: Props) {
  const [receiverName, setReceiverName] = useState('')
  const [inputMode, setInputMode] = useState<'meters' | 'kg'>('kg')
  const [inputValue, setInputValue] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const receiverRef = useRef<HTMLInputElement>(null)

  const isWire = item?.raw_material?.category === 'ลวด' || item?.raw_material?.category === 'Wire'
  const wireFactor = item?.raw_material?.weight_per_meter ?? 0.0989
  const rawUnit = item?.raw_material?.unit ?? ''

  // For wire: required is in meters; convert to kg for display
  const requiredMeters = isWire ? item?.qty_required ?? 0 : 0
  const requiredKg = isWire ? (item?.qty_required ?? 0) * wireFactor : (item?.qty_required ?? 0)
  const requiredDisplay = isWire ? requiredKg : (item?.qty_required ?? 0)
  const dispensedDisplay = isWire
    ? (item?.qty_dispensed ?? 0)
    : (item?.qty_dispensed ?? 0)
  const remainingKg = requiredKg - (item?.qty_dispensed ?? 0)
  const remainingMeters = isWire ? remainingKg / wireFactor : 0

  const stockQty = item?.raw_material?.qty_on_hand ?? 0

  // Derived display qty from input
  let qtyInKg = 0
  let qtyInMeters = 0
  const parsed = parseFloat(inputValue)
  if (!isNaN(parsed) && parsed > 0) {
    if (isWire) {
      if (inputMode === 'meters') {
        qtyInMeters = parsed
        qtyInKg = parsed * wireFactor
      } else {
        qtyInKg = parsed
        qtyInMeters = parsed / wireFactor
      }
    } else {
      qtyInKg = parsed
    }
  }

  // The quantity passed to the server action is always in kg (for wire) or raw unit (for non-wire)
  const qtyToDispense = isWire ? qtyInKg : qtyInKg

  useEffect(() => {
    if (item) {
      setReceiverName(initialReceiver ?? '')
      setInputMode('kg')
      setInputValue('')
      setErrorMsg('')
      setTimeout(() => receiverRef.current?.focus(), 100)
    }
  }, [item, initialReceiver])

  if (!item) return null

  const handleConfirm = async () => {
    if (!receiverName.trim()) { setErrorMsg('กรุณาระบุชื่อผู้มารับวัตถุดิบ'); return }
    if (!inputValue || parseFloat(inputValue) <= 0) { setErrorMsg('กรุณาระบุจำนวนที่ต้องการจ่าย'); return }
    if (qtyToDispense > stockQty + 0.001) { setErrorMsg(`สต็อกไม่เพียงพอ (มีอยู่ ${stockQty.toFixed(3)} ${rawUnit})`); return }
    setErrorMsg('')
    await onConfirm(item.id, qtyToDispense, receiverName.trim())
  }

  const planDate = item.plan?.plan_date
    ? new Date(item.plan.plan_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'
  const orderNumbers = item.plan?.production_orders?.map(o => o.order_number).filter(Boolean) || []
  const orderNum = orderNumbers.length > 0 ? orderNumbers.join(', ') : `#${item.plan_id.slice(0, 8).toUpperCase()}`

  const progressPct = requiredKg > 0 ? Math.min(100, ((item.qty_dispensed) / requiredKg) * 100) : 0

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 560,
        boxShadow: '0 32px 64px rgba(0,0,0,0.25)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        animation: 'fadeInUp 0.22s ease',
      }}>
        <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }`}</style>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', background: '#fff', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', letterSpacing: '-0.3px' }}>ยืนยันการเบิกจ่ายวัตถุดิบ</div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 3 }}>กรุณาตรวจสอบข้อมูลก่อนยืนยัน</div>
          </div>
          <button onClick={onClose} style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7280', fontSize: 14, transition: 'background 0.15s', flexShrink: 0 }}>
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 24px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Plan reference */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, padding: '3px 10px', background: '#EFF4FF', color: '#2563EB', borderRadius: 5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="fas fa-calendar-alt" /> แผน: {planDate}
            </span>
            <span style={{ fontSize: 11, padding: '3px 10px', background: '#F1F5F9', color: '#475569', borderRadius: 5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="fas fa-hashtag" /> {orderNum}
            </span>
          </div>

          {/* Material card */}
          <div style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="fas fa-cube" style={{ color: '#fff', fontSize: 16 }} />
              </div>
              <div style={{ flex: 1 }}>
                {item.raw_material?.material_code && (
                  <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#2563EB', background: '#EFF4FF', padding: '2px 7px', borderRadius: 4, display: 'inline-block', marginBottom: 4, fontWeight: 700 }}>
                    {item.raw_material.material_code}
                  </div>
                )}
                <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', lineHeight: 1.3 }}>{item.raw_material?.name ?? '—'}</div>
                {item.notes && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 3 }}>{item.notes}</div>}
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
              {[
                { label: 'ต้องการทั้งหมด', value: isWire ? `${requiredMeters.toLocaleString(undefined, { maximumFractionDigits: 2 })} เมตร` : `${requiredDisplay.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${rawUnit}`, sub: isWire ? `≈ ${requiredKg.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${rawUnit}` : undefined, color: '#1E40AF' },
                { label: 'จ่ายแล้ว', value: `${dispensedDisplay.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${rawUnit}`, color: dispensedDisplay > 0 ? '#16A34A' : '#9CA3AF' },
                { label: 'สต็อกคงเหลือ', value: `${stockQty.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${rawUnit}`, color: stockQty >= remainingKg ? '#374151' : '#DC2626' },
              ].map(s => (
                <div key={s.label} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: s.color, lineHeight: 1.2 }}>{s.value}</div>
                  {s.sub && <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>{s.sub}</div>}
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#6B7280' }}>ความคืบหน้าการจ่าย</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#2563EB' }}>{progressPct.toFixed(0)}%</span>
              </div>
              <div style={{ height: 6, background: '#E5E7EB', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progressPct}%`, background: progressPct >= 100 ? '#16A34A' : '#2563EB', borderRadius: 99, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          </div>

          {/* Unit mode toggle (wire only) */}
          {isWire && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fas fa-exchange-alt" style={{ color: '#2563EB' }} />
                เลือกหน่วยการกรอกข้อมูล
              </div>
              <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 10, padding: 4, gap: 4 }}>
                {(['kg', 'meters'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => { setInputMode(mode); setInputValue('') }}
                    style={{
                      flex: 1, padding: '9px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      border: 'none', transition: 'all 0.2s',
                      background: inputMode === mode ? '#fff' : 'transparent',
                      color: inputMode === mode ? '#2563EB' : '#6B7280',
                      boxShadow: inputMode === mode ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <i className={mode === 'kg' ? 'fas fa-weight-hanging' : 'fas fa-ruler-horizontal'} />
                    {mode === 'kg' ? 'น้ำหนัก (กก.)' : 'ความยาว (เมตร)'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Qty input */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <i className="fas fa-balance-scale" style={{ color: '#2563EB' }} />
              {isWire
                ? (inputMode === 'kg' ? 'ปริมาณที่จ่าย (กิโลกรัม)' : 'ปริมาณที่จ่าย (เมตร)')
                : `ปริมาณที่จ่าย (${rawUnit})`}
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  type="number"
                  placeholder={isWire ? (inputMode === 'kg' ? 'ระบุน้ำหนัก กก.' : 'ระบุความยาว เมตร') : `ระบุจำนวน ${rawUnit}`}
                  value={inputValue}
                  onChange={e => { setInputValue(e.target.value); setErrorMsg('') }}
                  style={{
                    width: '100%', padding: '11px 14px', borderRadius: 10, border: errorMsg ? '1.5px solid #EF4444' : '1.5px solid #D1D5DB',
                    fontSize: 15, fontWeight: 700, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  min={0}
                  step="any"
                  onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
                />
              </div>
              {isWire && qtyInKg > 0 && (
                <div style={{ background: '#EFF4FF', border: '1.5px solid #BFDBFE', borderRadius: 10, padding: '11px 14px', minWidth: 130, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {inputMode === 'kg' ? 'เทียบเท่า' : 'น้ำหนัก'}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1E40AF', marginTop: 2 }}>
                    {inputMode === 'kg'
                      ? `${qtyInMeters.toLocaleString(undefined, { maximumFractionDigits: 2 })} เมตร`
                      : `${qtyInKg.toLocaleString(undefined, { maximumFractionDigits: 3 })} กก.`}
                  </div>
                  <div style={{ fontSize: 9, color: '#3B82F6', marginTop: 2 }}>
                    อัตรา: {wireFactor} กก./เมตร
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Receiver */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <i className="fas fa-user" style={{ color: '#2563EB' }} />
              ชื่อผู้มารับวัตถุดิบ
            </label>
            <input
              ref={receiverRef}
              type="text"
              placeholder="ระบุชื่อผู้มารับ..."
              value={receiverName}
              onChange={e => { setReceiverName(e.target.value); setErrorMsg('') }}
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 10, border: errorMsg ? '1.5px solid #EF4444' : '1.5px solid #D1D5DB',
                fontSize: 14, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
              }}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
            />
          </div>

          {/* Error */}
          {errorMsg && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-exclamation-circle" />
              {errorMsg}
            </div>
          )}

          {/* Confirm summary (live preview) */}
          {qtyToDispense > 0 && receiverName.trim() && (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="fas fa-check-circle" style={{ color: '#16A34A', fontSize: 18 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>
                  จ่าย {qtyToDispense.toLocaleString(undefined, { maximumFractionDigits: 3 })} {rawUnit}
                  {isWire && inputMode === 'meters' && ` (${qtyInMeters.toLocaleString(undefined, { maximumFractionDigits: 2 })} เมตร)`}
                </div>
                <div style={{ fontSize: 11, color: '#16A34A' }}>
                  ให้: {receiverName.trim()} · {item.raw_material?.name}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '20px 24px', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid #F1F5F9', marginTop: 20 }}>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{ padding: '11px 22px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#F1F5F9', color: '#374151', border: 'none', cursor: 'pointer', transition: 'background 0.15s' }}
          >
            ยกเลิก
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            style={{
              padding: '11px 28px', borderRadius: 10, fontSize: 14, fontWeight: 700,
              background: isLoading ? '#93C5FD' : '#2563EB', color: '#fff', border: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 12px rgba(37,99,235,0.35)', transition: 'all 0.15s',
            }}
          >
            {isLoading ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />}
            {isLoading ? 'กำลังบันทึก...' : 'ยืนยันการจ่าย'}
          </button>
        </div>
      </div>
    </div>
  )
}
