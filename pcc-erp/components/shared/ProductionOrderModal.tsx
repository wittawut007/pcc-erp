'use client'

import React, { useEffect, useState, useRef } from 'react'
import QRCode from 'qrcode'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

interface PlanItem {
  id?: string
  productCode: string
  productName: string
  size?: string
  category: string
  bed: string
  qty: number
  unit?: string
  concrete: number
}

interface ProductionOrderModalProps {
  isOpen: boolean
  onClose: () => void
  orderNumber: string
  date: string
  time: string
  userFullName: string
  items: PlanItem[]
  workerToken: string
}

export default function ProductionOrderModal({
  isOpen,
  onClose,
  orderNumber,
  date,
  time,
  userFullName,
  items,
  workerToken,
}: ProductionOrderModalProps) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('')
  const printRef = useRef<HTMLDivElement>(null)

  const totalQty = items.reduce((s, i) => s + i.qty, 0)
  const totalConcrete = items.reduce((s, i) => s + i.concrete, 0)
  // Fix Date display to use current time or passed time realistically
  const qrUrl = typeof window !== 'undefined' ? `${window.location.origin}/worker-entry?token=${workerToken}` : ''

  useEffect(() => {
    if (isOpen && qrUrl) {
      QRCode.toDataURL(qrUrl, { margin: 1, width: 160 })
        .then(url => {
          setQrCodeDataUrl(url)
        })
        .catch(err => {
          console.error(err)
        })
    }
  }, [isOpen, qrUrl])

  if (!isOpen) return null

  const handleDownloadPDF = async () => {
    const element = printRef.current
    if (!element) return

    const canvas = await html2canvas(element, { scale: 2 })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
    pdf.save(`${orderNumber}.pdf`)
  }

  const handleDownloadPNG = async () => {
    const element = printRef.current
    if (!element) return

    const canvas = await html2canvas(element, { scale: 2 })
    const url = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.download = `${orderNumber}.png`
    link.href = url
    link.click()
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 pt-10 pb-20 print:bg-transparent print:p-0 print:overflow-visible">
      {/* Container to restrict width on screen, scaled properly */}
      <div className="flex flex-col gap-6 w-full max-w-[850px] items-center print:w-full">
        
        {/* A4 Document Area */}
        <div 
          ref={printRef}
          className="bg-white shadow-xl relative text-black print:shadow-none print:m-0"
          style={{ width: '210mm', minHeight: '297mm', padding: '16mm 20mm' }}
        >
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 text-white p-2 rounded-lg">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 4H10V10H4V4ZM20 4V10H14V4H20ZM14 15.5V14H20V15.5H14ZM14 20V18.5H20V20H14ZM4 20V14H10V20H4Z" fill="currentColor"/>
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight leading-none text-blue-600">PCC <span className="text-gray-900">POSTENTION</span></h1>
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-widest mt-1">ERP Production System</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-500 mb-1">เลขที่ใบสั่งผลิต</p>
              <h2 className="text-lg font-bold">{orderNumber}</h2>
              <p className="text-xs text-gray-600 mt-1">วันที่สร้าง: {date} {time}</p>
            </div>
          </div>

          <div className="text-center mb-6">
            <h3 className="text-lg font-bold">ใบสั่งผลิต (PRODUCTION ORDER)</h3>
          </div>

          {/* Meta Info */}
          <div className="grid grid-cols-4 border border-gray-200 rounded-lg mb-6 overflow-hidden">
            <div className="p-3 border-r border-gray-200 flex flex-col justify-center">
              <div className="text-[10px] text-gray-500 mb-1">สถานะ</div>
              <div className="text-sm font-bold text-emerald-600">✓ ยืนยันแล้ว</div>
            </div>
            <div className="p-3 border-r border-gray-200 flex flex-col justify-center">
              <div className="text-[10px] text-gray-500 mb-1">ผู้อนุมัติ</div>
              <div className="text-sm font-bold text-gray-900">{userFullName}</div>
            </div>
            <div className="p-3 border-r border-gray-200 flex flex-col justify-center">
              <div className="text-[10px] text-gray-500 mb-1">จำนวนรายการ</div>
              <div className="text-sm font-bold text-blue-600">{items.length} รายการ</div>
            </div>
            <div className="p-3 flex flex-col justify-center">
              <div className="text-[10px] text-gray-500 mb-1">ชิ้นงานรวม</div>
              <div className="text-sm font-bold text-emerald-600">{totalQty.toLocaleString()} ชิ้น</div>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-sm border-collapse mb-8 text-left">
            <thead>
              <tr className="bg-gray-50">
                <th className="border p-2 font-semibold text-gray-600 text-xs w-10 text-center">NO.</th>
                <th className="border p-2 font-semibold text-gray-600 text-xs">รายการสินค้า</th>
                <th className="border p-2 font-semibold text-gray-600 text-xs text-center">รหัส BOM</th>
                <th className="border p-2 font-semibold text-gray-600 text-xs text-center">โรงผลิต</th>
                <th className="border p-2 font-semibold text-gray-600 text-xs text-center">จำนวน</th>
                <th className="border p-2 font-semibold text-gray-600 text-xs text-center">หน่วย</th>
                <th className="border p-2 font-semibold text-gray-600 text-xs text-right">คอนกรีต (Q)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="border p-3 text-center text-gray-500 align-top">{idx + 1}</td>
                  <td className="border p-3 align-top">
                    <div className="font-bold text-gray-900 text-[13px]">{item.productName} {item.size ? `(${item.size})` : ''}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{item.productCode}</div>
                  </td>
                  <td className="border p-3 text-center text-[12px] font-mono text-gray-600 align-top">BOM-{item.productCode.substring(0, 4)}</td>
                  <td className="border p-3 text-center text-[13px] align-top">โรงผลิต {item.bed}</td>
                  <td className="border p-3 text-center font-bold text-[13px] align-top">{item.qty.toLocaleString()}</td>
                  <td className="border p-3 text-center text-[12px] text-gray-500 align-top">{item.unit || 'ชิ้น'}</td>
                  <td className="border p-3 text-right text-[13px] text-gray-600 align-top">~ {item.concrete.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50">
                <td colSpan={4} className="border p-3 text-right font-bold text-gray-700 text-[13px]">รวมทั้งหมด</td>
                <td className="border p-3 text-center font-bold text-blue-600 text-[14px]">{totalQty.toLocaleString()}</td>
                <td className="border p-3 text-center font-bold text-gray-500 text-[12px]">ชิ้น</td>
                <td className="border p-3 text-right font-bold text-blue-600 text-[14px]">~ {totalConcrete.toFixed(1)} Q</td>
              </tr>
            </tfoot>
          </table>

          {/* QR Code Section */}
          <div className="border border-gray-200 rounded-xl p-5 flex items-center gap-6 mt-auto">
            <div className="bg-white p-1 border border-gray-200 rounded shrink-0">
              {qrCodeDataUrl ? (
                <img src={qrCodeDataUrl} alt="Worker QR Code" className="w-[120px] h-[120px]" />
              ) : (
                <div className="w-[120px] h-[120px] bg-gray-100 flex items-center justify-center text-xs text-gray-400">Loading QR...</div>
              )}
            </div>
            <div>
              <h4 className="font-bold text-gray-900 text-[15px] mb-1">QR Code สำหรับพนักงานหน้างาน</h4>
              <p className="font-bold text-blue-600 text-[16px] mb-1">{orderNumber}</p>
              <p className="text-[10px] text-gray-500 font-mono mb-3">{'URL: ' + qrUrl}</p>
              <div className="bg-gray-50 p-2.5 rounded text-[11px] text-gray-600 leading-relaxed border border-gray-100">
                วิธีใช้: ให้พนักงานหน้างานสแกน QR Code นี้เพื่อ เข้าระบบและลงแจ้งยอดการทำงาน ในโทรศัพท์/แท็บเล็ต โดยไม่ต้อง Login ซ้ำ
              </div>
            </div>
          </div>

          {/* Footer inside A4 context */}
          <div className="absolute bottom-[16mm] left-[20mm] right-[20mm] flex justify-between items-end border-t border-gray-200 pt-3">
            <div>
              <p className="text-[9px] text-gray-400">เอกสารนี้สร้างโดยระบบ PCC POSTENTION ERP อัตโนมัติ</p>
              <p className="text-[9px] text-gray-400 mt-1">สร้างเมื่อ: {date} เวลา {time} น. | Ref: SYS-AUTO-GEN</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-gray-900">{userFullName}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">ผู้ดูแลระบบ (Admin)</p>
            </div>
          </div>
        </div>

        {/* Action Buttons Overlay (Not visible during print) */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white px-4 py-3 rounded-full flex gap-3 shadow-2xl print:hidden border border-gray-700/50 items-center z-50">
           <button onClick={handleDownloadPDF} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 transition-colors rounded-full text-sm font-semibold">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
             ดาวน์โหลด PDF
           </button>
           <button onClick={handleDownloadPNG} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-colors rounded-full text-sm font-semibold">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
             ดาวน์โหลด PNG
           </button>
           <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 active:bg-gray-800 transition-colors rounded-full text-sm font-semibold text-gray-200">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
             พิมพ์
           </button>
           <div className="w-px h-6 bg-gray-700 mx-1"></div>
           <button onClick={onClose} className="flex items-center gap-2 pl-3 pr-4 py-2 hover:bg-white/10 active:bg-white/20 transition-colors rounded-full text-sm font-semibold text-gray-300">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
             กลับ
           </button>
        </div>
      </div>
      
      {/* Global Print Styles (could also be in globals.css) */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * {
            visibility: hidden;
          }
          #toast-container {
             display: none !important;
          }
          .print\\:overflow-visible {
             overflow: visible !important;
          }
          .fixed.inset-0.print\\:bg-transparent > div > div:first-child,
          .fixed.inset-0.print\\:bg-transparent > div > div:first-child * {
            visibility: visible;
          }
          .fixed.inset-0.print\\:bg-transparent {
             position: absolute;
             left: 0;
             top: 0;
             margin: 0;
             padding: 0;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
      `}} />
    </div>
  )
}
