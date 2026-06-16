'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

interface PlanItem {
  id?: string
  productId?: string
  productCode: string
  productName: string
  size?: string
  category: string
  bed: string
  qty: number
  unit?: string
  concrete: number
  bomCode?: string | null
  wire: number
  mesh: number
  rebar: number
}

interface ProductionOrderPrintClientProps {
  orderNumber: string
  date: string
  time: string
  userFullName: string
  items: PlanItem[]
  planId: string
  status: string
  onClose?: () => void
}

function getThaiCategoryDisplay(category: string): string {
  const cleanCategory = category.trim()
  const prefix = cleanCategory.split(' ')[0]
  const CAT_STYLES = [
    { prefix: 'A13', short: 'แผ่นพื้น' },
    { prefix: 'A30', short: 'ผนังรั้วสำเร็จรูป' },
    { prefix: 'A31', short: 'ผนังสำเร็จรูป/ผนังกันตก/FIN' },
    { prefix: 'A35', short: 'รั้วสำเร็จรูป' },
    { prefix: 'A36', short: 'เสา คาน บันได' },
    { prefix: 'A41', short: 'เสาเข็ม' },
    { prefix: 'A42', short: 'กำแพงกันดิน' },
    { prefix: 'A82', short: 'เสารั้ว' },
  ]
  const matched = CAT_STYLES.find(c => c.prefix.toLowerCase() === prefix.toLowerCase())
  if (matched) {
    return `${matched.short} (${matched.prefix})`
  }
  return category
}

export default function ProductionOrderPrintClient({
  orderNumber,
  date,
  time,
  userFullName,
  items,
  planId,
  status,
  onClose,
}: ProductionOrderPrintClientProps) {
  const router = useRouter()
  const printRef = useRef<HTMLDivElement>(null)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('')
  const [isExporting, setIsExporting] = useState<'pdf' | 'png' | null>(null)
  const [qrUrl, setQrUrl] = useState<string>('')

  const totalQty = items.reduce((s, i) => s + i.qty, 0)
  const totalConcrete = items.reduce((s, i) => s + i.concrete, 0)

  useEffect(() => {
    // Generate URL on client-side only to prevent SSR Hydration Mismatch
    if (typeof window === 'undefined') return
    const baseUrl = window.location.origin
    const loginUrl = `${baseUrl.replace(/\/$/, '')}/login`
    setQrUrl(loginUrl)

    QRCode.toDataURL(loginUrl, { margin: 1, width: 200, errorCorrectionLevel: 'M' })
      .then((url) => setQrCodeDataUrl(url))
      .catch(console.error)
  }, [])

  const handleDownloadPDF = async () => {
    const element = printRef.current
    if (!element) return
    setIsExporting('pdf')
    try {
      // Disable scroll momentarily or pass scroll size to html2canvas to avoid truncating
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: true,
        scrollY: -window.scrollY,
        windowHeight: element.scrollHeight
      })
      const imgData = canvas.toDataURL('image/png')
      
      // Dynamically import jsPDF to avoid Next.js module conflicts
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      
      // Force filename and extension using a manual anchor tag click
      const blob = pdf.output('blob')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${orderNumber}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('PDF Generation Error:', err)
      alert("เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: " + err?.message)
    } finally {
      setIsExporting(null)
    }
  }

  const handleDownloadPNG = async () => {
    const element = printRef.current
    if (!element) return
    setIsExporting('png')
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: true,
        scrollY: -window.scrollY,
        windowHeight: element.scrollHeight
      })
      const url = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.href = url
      link.download = `${orderNumber}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err: any) {
      console.error('PNG Generation Error:', err)
      alert("เกิดข้อผิดพลาดในการสร้างไฟล์ PNG: " + err?.message)
    } finally {
      setIsExporting(null)
    }
  }

  const handlePrint = () => window.print()

  return (
    <>
      {/* Print-only styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { visibility: hidden !important; background: #fff !important; }
          #po-print-root {
            visibility: visible !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #po-print-root * { visibility: visible !important; }
          #po-toolbar { display: none !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}} />

      {/* Full page background */}
      <div
        id="po-print-root"
        style={{
          height: '100%',
          width: '100%',
          flex: 1,
          overflowY: 'auto',
          background: '#E8ECF1',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: 40,
          paddingBottom: 120,
        }}
      >
        {/* A4 Paper */}
        <div
          ref={printRef}
          style={{
            background: '#fff',
            width: '210mm',
            minHeight: '297mm',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            borderRadius: 4,
            padding: '16mm 20mm 20mm 20mm',
            position: 'relative',
            color: '#1A1B23',
            fontFamily: "'IBM Plex Sans Thai', 'Sarabun', sans-serif",
          }}
        >
          {/* ─── HEADER ─── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2.5px solid #111827', paddingBottom: 16, marginBottom: 20 }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ background: '#2563EB', borderRadius: 10, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <img 
                  src="/logo.png" 
                  alt="PCC Logo" 
                  style={{ width: '28px', height: '28px', objectFit: 'contain' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    e.currentTarget.parentElement?.insertAdjacentHTML('beforeend', '<i class="fas fa-industry" style="color: #fff; font-size: 20px"></i>');
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                  <span style={{ color: '#2563EB' }}>PCC </span>
                  <span style={{ color: '#111827' }}>POST-TENSION</span>
                </div>
                <div style={{ fontSize: 9, fontWeight: 600, color: '#6B7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>
                  ERP Production System
                </div>
              </div>
            </div>

            {/* Order Number */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 2 }}>เลขที่ใบสั่งผลิต</div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px', color: '#111827' }}>
                {orderNumber}
              </div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 3 }}>
                วันที่สร้าง: {date} เวลา {time}
              </div>
            </div>
          </div>

          {/* ─── TITLE ─── */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <h1 style={{ fontSize: 17, fontWeight: 800, color: '#111827', letterSpacing: '0.02em' }}>
              ใบสั่งผลิต (PRODUCTION ORDER)
            </h1>
          </div>

          {/* ─── META INFO BAR ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 20, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderRight: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: 9, color: '#9CA3AF', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>สถานะ</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: status === 'draft' ? '#F59E0B' : '#10B981', display: 'flex', alignItems: 'center', gap: 4 }}>
                {status === 'draft' ? '📝 แบบร่าง' : '✓ ยืนยันแล้ว'}
              </div>
            </div>
            <div style={{ padding: '10px 14px', borderRight: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: 9, color: '#9CA3AF', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ผู้อนุมัติ</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{userFullName}</div>
            </div>
            <div style={{ padding: '10px 14px', borderRight: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: 9, color: '#9CA3AF', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>จำนวนรายการ</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#2563EB' }}>{items.length} รายการ</div>
            </div>
            <div style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: 9, color: '#9CA3AF', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ชิ้นงานรวม</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#10B981' }}>{totalQty.toLocaleString()} ชิ้น</div>
            </div>
          </div>

          {/* ─── TABLE ─── */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24, fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                <th style={{ border: '1px solid #E5E7EB', padding: '8px 10px', fontWeight: 700, color: '#6B7280', fontSize: 11, textAlign: 'center', width: 36 }}>NO.</th>
                <th style={{ border: '1px solid #E5E7EB', padding: '8px 10px', fontWeight: 700, color: '#6B7280', fontSize: 11, textAlign: 'left' }}>รายการสินค้า</th>
                <th style={{ border: '1px solid #E5E7EB', padding: '8px 10px', fontWeight: 700, color: '#6B7280', fontSize: 11, textAlign: 'left' }}>วัตถุดิบ</th>
                <th style={{ border: '1px solid #E5E7EB', padding: '8px 10px', fontWeight: 700, color: '#6B7280', fontSize: 11, textAlign: 'center' }}>โรงผลิต</th>
                <th style={{ border: '1px solid #E5E7EB', padding: '8px 10px', fontWeight: 700, color: '#6B7280', fontSize: 11, textAlign: 'center' }}>จำนวน</th>
                <th style={{ border: '1px solid #E5E7EB', padding: '8px 10px', fontWeight: 700, color: '#6B7280', fontSize: 11, textAlign: 'center' }}>หน่วย</th>
                <th style={{ border: '1px solid #E5E7EB', padding: '8px 10px', fontWeight: 700, color: '#6B7280', fontSize: 11, textAlign: 'right' }}>คอนกรีต (Q)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(
                items.reduce((acc, item) => {
                  const cat = getThaiCategoryDisplay(item.category || 'อื่นๆ')
                  if (!acc[cat]) acc[cat] = []
                  acc[cat].push(item)
                  return acc
                }, {} as Record<string, typeof items>)
              ).map(([category, catItems]) => (
                <React.Fragment key={category}>
                  <tr style={{ background: '#F1F5F9' }}>
                    <td colSpan={7} style={{ border: '1px solid #E5E7EB', padding: '10px 16px', fontWeight: 800, color: '#334155', fontSize: 13 }}>
                      หมวดหมู่: {category}
                    </td>
                  </tr>
                  {catItems.map((item, idx) => (
                    <tr key={`${category}-${idx}`} style={{ background: '#fff' }}>
                      <td style={{ border: '1px solid #E5E7EB', padding: '10px', textAlign: 'center', color: '#9CA3AF', fontWeight: 600, verticalAlign: 'top' }}>
                        {idx + 1}
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '10px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, color: '#111827', fontSize: 13 }}>
                          {item.productName}{item.size && item.size !== '-' ? ` (${item.size})` : ''}
                        </div>
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '10px', textAlign: 'left', fontSize: 11, color: '#6B7280', verticalAlign: 'top' }}>
                        {item.bomCode || '-'}
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '10px', textAlign: 'center', fontSize: 13, verticalAlign: 'top' }}>
                        <span style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600, color: '#475569' }}>
                          โรงผลิต {item.bed}
                        </span>
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '10px', textAlign: 'center', fontWeight: 700, fontSize: 14, color: '#111827', verticalAlign: 'top' }}>
                        {item.qty.toLocaleString()}
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '10px', textAlign: 'center', fontSize: 11, color: '#6B7280', verticalAlign: 'top' }}>
                        {item.unit || 'ชิ้น'}
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '10px', textAlign: 'right', fontSize: 12, color: '#6B7280', verticalAlign: 'top' }}>
                        ~ {item.concrete.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#F9FAFB' }}>
                <td colSpan={4} style={{ border: '1px solid #E5E7EB', padding: '10px', textAlign: 'right', fontWeight: 700, color: '#374151', fontSize: 13 }}>
                  รวมทั้งหมด
                </td>
                <td style={{ border: '1px solid #E5E7EB', padding: '10px', textAlign: 'center', fontWeight: 800, color: '#2563EB', fontSize: 15 }}>
                  {totalQty.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #E5E7EB', padding: '10px', textAlign: 'center', fontWeight: 700, color: '#6B7280', fontSize: 12 }}>
                  ชิ้น
                </td>
                <td style={{ border: '1px solid #E5E7EB', padding: '10px', textAlign: 'right', fontWeight: 800, color: '#2563EB', fontSize: 14 }}>
                  ~ {totalConcrete.toFixed(2)} Q
                </td>
              </tr>
            </tfoot>
          </table>

          {/* ─── QR CODE SECTION ─── */}
          <div style={{ border: '1.5px solid #E5E7EB', borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 24, background: '#FAFAFA', marginBottom: 32 }}>
            {/* QR */}
            <div style={{ flexShrink: 0, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: 6 }}>
              {qrCodeDataUrl ? (
                <img src={qrCodeDataUrl} alt="Worker QR Code" style={{ width: 130, height: 130, display: 'block' }} />
              ) : (
                <div style={{ width: 130, height: 130, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#9CA3AF' }}>
                  กำลังสร้าง QR...
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
                QR Code สำหรับพนักงานหน้างาน
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#2563EB', marginBottom: 4 }}>
                {orderNumber}
              </div>
              <div style={{ fontSize: 9, color: '#9CA3AF', fontFamily: 'monospace', marginBottom: 12 }}>
                URL: {qrUrl}
              </div>
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#3B82F6', lineHeight: 1.6 }}>
                <strong>วิธีใช้:</strong> ให้พนักงานหน้างานสแกน QR Code นี้ เพื่อเข้าสู่ระบบผ่านโทรศัพท์/แท็บเล็ต
              </div>
            </div>
          </div>

          {/* ─── FOOTER ─── */}
          <div style={{
            position: 'absolute',
            bottom: '16mm',
            left: '20mm',
            right: '20mm',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTop: '1px solid #E5E7EB',
            paddingTop: 10,
          }}>
            <div>
              <div style={{ fontSize: 9, color: '#9CA3AF' }}>เอกสารนี้สร้างโดยระบบ PCC POST-TENSION ERP อัตโนมัติ</div>
              <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 3 }}>สร้างเมื่อ: {date} เวลา {time} น. | Ref: SYS-AUTO-GEN</div>
            </div>
            <div style={{ textAlign: 'center', marginRight: 20 }}>
              <div style={{ width: 140, borderBottom: '1px dashed #9CA3AF', marginBottom: 8, height: 30 }}></div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{userFullName}</div>
              <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>ผู้สร้างแผนการผลิต</div>
            </div>
          </div>
        </div>



        {/* ─── ACTION TOOLBAR (hidden on print) ─── */}
        <div
          id="po-toolbar"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(31, 41, 55, 0.65)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 50,
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            zIndex: 100,
          }}
        >

          {/* Download PDF */}
          <button
            onClick={handleDownloadPDF}
            disabled={isExporting !== null}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 18px',
              background: isExporting === 'pdf' ? '#991B1B' : '#DC2626',
              color: '#fff',
              border: 'none',
              borderRadius: 50,
              fontSize: 13, fontWeight: 600,
              cursor: isExporting !== null ? 'wait' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            {isExporting === 'pdf' ? 'กำลังสร้าง...' : 'ดาวน์โหลด PDF'}
          </button>

          {/* Download PNG */}
          <button
            onClick={handleDownloadPNG}
            disabled={isExporting !== null}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 18px',
              background: isExporting === 'png' ? '#065F46' : '#059669',
              color: '#fff',
              border: 'none',
              borderRadius: 50,
              fontSize: 13, fontWeight: 600,
              cursor: isExporting !== null ? 'wait' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            {isExporting === 'png' ? 'กำลังสร้าง...' : 'ดาวน์โหลด PNG'}
          </button>

          {/* Print */}
          <button
            onClick={handlePrint}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.1)',
              color: '#D1D5DB',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 50,
              fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            พิมพ์
          </button>

          {status === 'draft' && (
            <>
              {/* Edit Plan */}
              <button
                onClick={() => router.push('/planner')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 16px',
                  background: 'transparent',
                  color: '#F59E0B',
                  border: '1px solid #F59E0B',
                  borderRadius: 50,
                  fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245, 158, 11, 0.15)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                แก้ไขแผน
              </button>
              
              <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />
            </>
          )}

          {/* Back */}
          <button
            onClick={() => {
              if (onClose) {
                onClose()
              } else {
                router.back()
              }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px',
              background: 'transparent',
              color: '#9CA3AF',
              border: 'none',
              borderRadius: 50,
              fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            กลับ
          </button>
        </div>
      </div>
    </>
  )
}
