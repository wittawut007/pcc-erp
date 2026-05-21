'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import html2canvas from 'html2canvas'

interface FgItem {
  id: string
  productCode: string
  productName: string
  size: string
  category: string
  unit: string
  bed: string
  qtyTarget: number
  qtyGood: number
  qtyDefect: number
  defectDetail: string
}

interface FgPrintClientProps {
  orderNumber: string
  planDateStr: string
  printDateStr: string
  printTimeStr: string
  confirmedBy: string
  items: FgItem[]
  erpReference: string | null
  status: string
}

export default function FgPrintClient({
  orderNumber,
  planDateStr,
  printDateStr,
  printTimeStr,
  confirmedBy,
  items,
  erpReference,
  status,
}: FgPrintClientProps) {
  const router = useRouter()
  const printRef = useRef<HTMLDivElement>(null)
  const [isExporting, setIsExporting] = useState<'pdf' | 'png' | null>(null)

  const totalTarget = items.reduce((s, i) => s + i.qtyTarget, 0)
  const totalGood = items.reduce((s, i) => s + i.qtyGood, 0)
  const totalDefect = items.reduce((s, i) => s + i.qtyDefect, 0)

  const handleDownloadPDF = async () => {
    const element = printRef.current
    if (!element) return
    setIsExporting('pdf')
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        scrollY: -window.scrollY,
        windowHeight: element.scrollHeight
      })
      const imgData = canvas.toDataURL('image/png')
      
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      
      const blob = pdf.output('blob')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `FG-${orderNumber}.pdf`
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
        logging: false,
        scrollY: -window.scrollY,
        windowHeight: element.scrollHeight
      })
      const url = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.href = url
      link.download = `FG-${orderNumber}.png`
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

  // Group items by category
  const groupedItems = items.reduce((acc, item) => {
    const cat = item.category || 'อื่นๆ'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {} as Record<string, FgItem[]>)

  return (
    <>
      {/* Print-only styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { visibility: hidden !important; background: #fff !important; }
          #fg-print-root {
            visibility: visible !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #fg-print-root * { visibility: visible !important; }
          #fg-toolbar { display: none !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}} />

      {/* Full page background */}
      <div
        id="fg-print-root"
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
            boxSizing: 'border-box',
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
                  <span style={{ color: '#111827' }}>POSTENTION</span>
                </div>
                <div style={{ fontSize: 9, fontWeight: 600, color: '#6B7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>
                  ERP Production System
                </div>
              </div>
            </div>

            {/* Order Number */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 2 }}>เลขที่ใบสั่งผลิตอ้างอิง</div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px', color: '#111827' }}>
                {orderNumber}
              </div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 3 }}>
                วันที่สั่งผลิต: {planDateStr}
              </div>
            </div>
          </div>

          {/* ─── TITLE ─── */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <h1 style={{ fontSize: 17, fontWeight: 800, color: '#111827', letterSpacing: '0.02em', margin: 0 }}>
              ใบรายงานผลการผลิตสินค้าสำเร็จรูป (FINISHED GOODS REPORT)
            </h1>
          </div>

          {/* ─── META INFO BAR ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 20, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderRight: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: 9, color: '#9CA3AF', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>สถานะใบสั่งผลิต</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: status === 'erp_synced' ? '#10B981' : '#2563EB', display: 'flex', alignItems: 'center', gap: 4 }}>
                {status === 'erp_synced' ? '✓ บันทึกเข้าระบบแล้ว' : '✓ QC ตรวจสอบแล้ว'}
              </div>
            </div>
            <div style={{ padding: '10px 14px', borderRight: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: 9, color: '#9CA3AF', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ผู้อนุมัติสั่งผลิต</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{confirmedBy}</div>
            </div>
            <div style={{ padding: '10px 14px', borderRight: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: 9, color: '#9CA3AF', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>หมายเลขอ้างอิง ERP</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: erpReference ? '#10B981' : '#6B7280', fontFamily: 'monospace' }}>
                {erpReference || 'ยังไม่เข้าระบบกลาง'}
              </div>
            </div>
            <div style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: 9, color: '#9CA3AF', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>วันที่พิมพ์เอกสาร</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{printDateStr}</div>
            </div>
          </div>

          {/* ─── TABLE ─── */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24, fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                <th style={{ border: '1px solid #E5E7EB', padding: '8px 10px', fontWeight: 700, color: '#6B7280', fontSize: 11, textAlign: 'center', width: 36 }}>NO.</th>
                <th style={{ border: '1px solid #E5E7EB', padding: '8px 10px', fontWeight: 700, color: '#6B7280', fontSize: 11, textAlign: 'left' }}>รายการสินค้าสำเร็จรูป</th>
                <th style={{ border: '1px solid #E5E7EB', padding: '8px 10px', fontWeight: 700, color: '#6B7280', fontSize: 11, textAlign: 'center', width: 70 }}>โรงผลิต</th>
                <th style={{ border: '1px solid #E5E7EB', padding: '8px 10px', fontWeight: 700, color: '#6B7280', fontSize: 11, textAlign: 'center', width: 70 }}>เป้าหมาย</th>
                <th style={{ border: '1px solid #E5E7EB', padding: '8px 10px', fontWeight: 700, color: '#6B7280', fontSize: 11, textAlign: 'center', width: 70 }}>งานดี (ชิ้น)</th>
                <th style={{ border: '1px solid #E5E7EB', padding: '8px 10px', fontWeight: 700, color: '#6B7280', fontSize: 11, textAlign: 'center', width: 70 }}>งานเสีย (ชิ้น)</th>
                <th style={{ border: '1px solid #E5E7EB', padding: '8px 10px', fontWeight: 700, color: '#6B7280', fontSize: 11, textAlign: 'left', width: 150 }}>สาเหตุความเสียหาย / หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedItems).map(([category, catItems]) => (
                <React.Fragment key={category}>
                  <tr style={{ background: '#F1F5F9' }}>
                    <td colSpan={7} style={{ border: '1px solid #E5E7EB', padding: '8px 12px', fontWeight: 800, color: '#334155', fontSize: 12 }}>
                      หมวดหมู่: {category}
                    </td>
                  </tr>
                  {catItems.map((item, idx) => (
                    <tr key={`${category}-${idx}`} style={{ background: '#fff' }}>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px 10px', textAlign: 'center', color: '#9CA3AF', fontWeight: 600, verticalAlign: 'top' }}>
                        {idx + 1}
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px 10px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, color: '#111827', fontSize: 12 }}>
                          {item.productName}{item.size && item.size !== '-' ? ` (${item.size})` : ''}
                        </div>
                        <div style={{ fontSize: 10, color: '#9CA3AF', fontFamily: 'monospace', marginTop: 2 }}>
                          {item.productCode}
                        </div>
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px 10px', textAlign: 'center', fontSize: 12, verticalAlign: 'top' }}>
                        <span style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600, color: '#475569' }}>
                          เตียง {item.bed}
                        </span>
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px 10px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: '#475569', verticalAlign: 'top' }}>
                        {item.qtyTarget.toLocaleString()}
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px 10px', textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#16A34A', verticalAlign: 'top' }}>
                        {item.qtyGood.toLocaleString()}
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px 10px', textAlign: 'center', fontWeight: 700, fontSize: 13, color: item.qtyDefect > 0 ? '#DC2626' : '#9CA3AF', verticalAlign: 'top' }}>
                        {item.qtyDefect.toLocaleString()}
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px 10px', fontSize: 11, color: item.qtyDefect > 0 ? '#DC2626' : '#6B7280', verticalAlign: 'top', lineHeight: 1.4 }}>
                        {item.defectDetail}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#F9FAFB', fontWeight: 800 }}>
                <td colSpan={3} style={{ border: '1px solid #E5E7EB', padding: '10px', textAlign: 'right', fontSize: 12, color: '#374151' }}>
                  ยอดรวมทั้งหมด
                </td>
                <td style={{ border: '1px solid #E5E7EB', padding: '10px', textAlign: 'center', fontSize: 13, color: '#475569' }}>
                  {totalTarget.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #E5E7EB', padding: '10px', textAlign: 'center', fontSize: 14, color: '#16A34A' }}>
                  {totalGood.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #E5E7EB', padding: '10px', textAlign: 'center', fontSize: 14, color: totalDefect > 0 ? '#DC2626' : '#6B7280' }}>
                  {totalDefect.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #E5E7EB', padding: '10px', fontSize: 11, color: '#9CA3AF', fontWeight: 400 }}>
                  ชิ้นดีรวม {((totalGood / Math.max(totalTarget, 1)) * 100).toFixed(1)}% | ชิ้นเสียรวม {((totalDefect / Math.max(totalTarget, 1)) * 100).toFixed(1)}%
                </td>
              </tr>
            </tfoot>
          </table>

          {/* ─── REMARKS & NOTE ─── */}
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '12px 16px', background: '#FAFAFA', fontSize: 11, color: '#6B7280', lineHeight: 1.5, marginBottom: 120 }}>
            <strong>หมายเหตุ:</strong>
            <ol style={{ margin: '4px 0 0 16px', padding: 0 }}>
              <li>ปริมาณสินค้าสำเร็จรูป (งานดี) ข้างต้น ได้รับการตรวจสอบและยืนยันสถานะคุณภาพจากฝ่ายควบคุมคุณภาพ (QC) เรียบร้อยแล้ว</li>
              <li>เจ้าหน้าที่คลังสินค้าตรวจนับสินค้าจริงเปรียบเทียบกับเอกสารนี้ ก่อนเซ็นรับสินค้าเข้าสู่คลังสินค้าสำเร็จรูป (FG Inventory)</li>
              <li>เมื่อตรวจสอบและเซ็นเอกสารครบถ้วนแล้ว ให้นำเลขที่อ้างอิง ERP ไปบันทึกอัปเดตลงในระบบ ERP เครือข่ายส่วนกลาง</li>
            </ol>
          </div>

          {/* ─── FOOTER SIGNATURES ─── */}
          <div style={{
            position: 'absolute',
            bottom: '16mm',
            left: '20mm',
            right: '20mm',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTop: '1px solid #E5E7EB',
            paddingTop: 14,
          }}>
            <div>
              <div style={{ fontSize: 9, color: '#9CA3AF' }}>เอกสารรายงานผลผลิตสำเร็จรูปอัตโนมัติจาก PCC ERP System</div>
              <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 3 }}>พิมพ์เมื่อ: {printDateStr} เวลา {printTimeStr} น.</div>
            </div>
            
            <div style={{ display: 'flex', gap: 60 }}>
              {/* Confirmed By Signature Line */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 140, borderBottom: '1px dashed #9CA3AF', marginBottom: 8, height: 35 }}></div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{confirmedBy}</div>
                <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>ผู้อนุมัติแผนและสั่งผลิต</div>
              </div>

              {/* Warehouse Signature Line */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 160, borderBottom: '1px dashed #9CA3AF', marginBottom: 8, height: 35 }}></div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>(....................................................)</div>
                <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2, fontWeight: 700 }}>พนักงานคลังสินค้า (Warehouse Staff)</div>
                <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 4 }}>วันที่ ......../......../........</div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── ACTION TOOLBAR (hidden on print) ─── */}
        <div
          id="fg-toolbar"
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

          {/* Back */}
          <button
            onClick={() => router.back()}
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
