'use client'

import React, { useState, useRef } from 'react'
import html2canvas from 'html2canvas'

interface MaterialDocumentPrintClientProps {
  orderNumber: string
  date: string
  time: string
  userFullName: string
  totalConcrete: number
  planItems: any[]
  onClose: () => void
}

export default function MaterialDocumentPrintClient({
  orderNumber,
  date,
  time,
  userFullName,
  totalConcrete,
  planItems = [],
  onClose
}: MaterialDocumentPrintClientProps) {
  const printRef = useRef<HTMLDivElement>(null)
  const [isExporting, setIsExporting] = useState<'pdf' | 'png' | null>(null)

  const handleDownloadPDF = async () => {
    const element = printRef.current
    if (!element) return
    setIsExporting('pdf')
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: true,
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
      link.download = `Material_Summary_${orderNumber}.pdf`
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
      link.download = `Material_Summary_${orderNumber}.png`
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

  // Group items by category, ignore items with 0 qty
  const groupedItems = planItems.reduce((acc: Record<string, any[]>, item) => {
    if (!item || item.qty_required <= 0) return acc;
    const cat = item.raw_material?.category || 'อื่นๆ';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  // Extract unique receiver names and dispenser names
  const receivers = Array.from(new Set(planItems.map(i => i.receiver_name).filter(Boolean))) as string[]
  const displayReceiver = receivers.length > 0 ? receivers.join(', ') : ''

  const dispensers = Array.from(new Set(planItems.map(i => i.dispensed_by_profile?.full_name).filter(Boolean))) as string[]
  const displayDispenser = dispensers.length > 0 ? dispensers.join(', ') : (userFullName || '')

  // Find the first non-null dispensed_at date to display in the signature date
  const dispensedAtItem = planItems.find(i => i.dispensed_at)
  const displayDate = dispensedAtItem && dispensedAtItem.dispensed_at
    ? new Date(dispensedAtItem.dispensed_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { visibility: hidden !important; background: #fff !important; }
          #mat-print-root {
            visibility: visible !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #mat-print-root * { visibility: visible !important; }
          #mat-toolbar { display: none !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}} />

      <div
        id="mat-print-root"
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
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2.5px solid #111827', paddingBottom: 16, marginBottom: 20 }}>
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

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 2 }}>เลขอ้างอิงแผนการผลิต</div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px', color: '#111827' }}>
                {orderNumber}
              </div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 3 }}>
                สำหรับเบิกจ่ายวัตถุดิบ
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h1 style={{ fontSize: 17, fontWeight: 800, color: '#111827', letterSpacing: '0.02em' }}>
              ใบสรุปเบิกจ่ายวัตถุดิบ (RAW MATERIALS SUMMARY)
            </h1>
          </div>

          {/* Concrete is separated since it's from plan directly */}
          {totalConcrete > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 14, fontWeight: 800, color: '#111827', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fas fa-fill-drip" style={{ color: '#9CA3AF' }}></i> คอนกรีตผสมเสร็จ
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB' }}>
                    <th style={{ border: '1px solid #E5E7EB', padding: '10px 14px', fontWeight: 700, color: '#6B7280', fontSize: 12, textAlign: 'left' }}>รายการ</th>
                    <th style={{ border: '1px solid #E5E7EB', padding: '10px 14px', fontWeight: 700, color: '#6B7280', fontSize: 12, textAlign: 'right', width: '25%' }}>จำนวนที่ต้องใช้โดยประมาณ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #E5E7EB', padding: '12px 14px', fontWeight: 600, color: '#111827' }}>คอนกรีตผสมเสร็จ</td>
                    <td style={{ border: '1px solid #E5E7EB', padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#2563EB', fontSize: 14 }}>~ {totalConcrete.toFixed(2)} Q</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Grouped Raw Materials */}
          {Object.entries(groupedItems).map(([category, items]) => {
            if (items.length === 0) return null;
            
            let icon = 'fa-box';
            if (category === 'ลวด' || category === 'Wire') icon = 'fa-wave-square';
            if (category === 'เมช' || category === 'Mesh') icon = 'fa-border-all';
            if (category === 'เหล็กเส้น') icon = 'fa-bars';

            return (
              <div key={category} style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 14, fontWeight: 800, color: '#111827', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className={`fas ${icon}`} style={{ color: '#9CA3AF' }}></i> หมวดหมู่: {category}
                </h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB' }}>
                      <th style={{ border: '1px solid #E5E7EB', padding: '10px 14px', fontWeight: 700, color: '#6B7280', fontSize: 12, textAlign: 'left' }}>รายการย่อย (Material)</th>
                      <th style={{ border: '1px solid #E5E7EB', padding: '10px 14px', fontWeight: 700, color: '#6B7280', fontSize: 12, textAlign: 'right', width: '22%' }}>จำนวนที่ต้องใช้</th>
                      <th style={{ border: '1px solid #E5E7EB', padding: '10px 14px', fontWeight: 700, color: '#6B7280', fontSize: 12, textAlign: 'right', width: '20%' }}>น้ำหนักตามแผน</th>
                      <th style={{ border: '1px solid #E5E7EB', padding: '10px 14px', fontWeight: 700, color: '#6B7280', fontSize: 12, textAlign: 'right', width: '20%' }}>น้ำหนักที่เบิกจ่าย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const isWire = category === 'ลวด' || category === 'Wire';
                      const weightPerMeter = item.raw_material?.weight_per_meter || 0;
                      const plannedWeight = isWire && weightPerMeter ? item.qty_required * weightPerMeter : item.qty_required;
                      
                      const hasDispensed = item.status === 'dispensed' || item.status === 'partial' || item.qty_dispensed > 0;
                      
                      return (
                        <tr key={idx}>
                          <td style={{ border: '1px solid #E5E7EB', padding: '12px 14px', fontWeight: 600, color: '#111827' }}>
                            {item.raw_material?.name || 'Unknown'}
                          </td>
                          <td style={{ border: '1px solid #E5E7EB', padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#4B5563' }}>
                            {item.qty_required.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} {isWire ? 'ม.' : item.raw_material?.unit || ''}
                          </td>
                          <td style={{ border: '1px solid #E5E7EB', padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#2563EB', fontSize: 14 }}>
                            {plannedWeight.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} {isWire || weightPerMeter ? 'กก.' : item.raw_material?.unit || ''}
                          </td>
                          <td style={{ border: '1px solid #E5E7EB', padding: '12px 14px', textAlign: 'right', fontWeight: hasDispensed ? 700 : 400, color: hasDispensed ? '#059669' : '#9CA3AF', fontSize: 14 }}>
                            {hasDispensed ? `${(item.qty_dispensed || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${isWire || weightPerMeter ? 'กก.' : item.raw_material?.unit || ''}` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* Signature lines */}
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 80 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 180, borderBottom: '1px dashed #9CA3AF', marginBottom: 8, height: 30, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                {displayReceiver && <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{displayReceiver}</span>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                ( {displayReceiver || '..........................................................'} )
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>ผู้เบิกวัตถุดิบ</div>
              <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4 }}>
                วันที่ {displayDate || '......../......../..............'}
              </div>
            </div>
            
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 180, borderBottom: '1px dashed #9CA3AF', marginBottom: 8, height: 30, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                {displayDispenser && <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{displayDispenser}</span>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                ( {displayDispenser || '..........................................................'} )
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>เจ้าหน้าที่คลังวัตถุดิบ</div>
              <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4 }}>
                วันที่ {displayDate || '......../......../..............'}
              </div>
            </div>
          </div>

          <div style={{
            position: 'absolute',
            bottom: '16mm',
            left: '20mm',
            right: '20mm',
            borderTop: '1px solid #E5E7EB',
            paddingTop: 10,
          }}>
            <div style={{ fontSize: 9, color: '#9CA3AF' }}>เอกสารนี้ใช้สำหรับอ้างอิงการเบิกจ่ายวัตถุดิบตามแผนการผลิตอ้างอิง {orderNumber}</div>
            <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 3 }}>สร้างโดย: {userFullName} | วันที่ {date} {time}</div>
          </div>
        </div>

        {/* ─── ACTION TOOLBAR (hidden on print) ─── */}
        <div
          id="mat-toolbar"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(17, 24, 39, 0.92)',
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
          
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />

          {/* Close */}
          <button
            onClick={onClose}
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
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            ปิด
          </button>
        </div>
      </div>
    </>
  )
}
