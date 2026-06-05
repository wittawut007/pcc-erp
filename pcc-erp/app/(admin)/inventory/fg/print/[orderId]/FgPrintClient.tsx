'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import html2canvas from 'html2canvas'

interface BomItem {
  id: string
  qtyPerUnit: number
  materialName: string
  materialCategory: string
  materialUnit: string
  materialCode: string | null
  weightPerMeter: number | null
}

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
  concretePerUnit: number
  wirePerUnit: number
  rebarPerUnit: number
  meshPerUnit: number
  length: number
  bomItems: BomItem[]
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
  totalConcrete: number
  planMaterials: any[]
  onClose?: () => void
}

// อัตราส่วนแปลงน้ำหนัก/ความยาวมาตรฐาน PCC
const MATERIAL_FALLBACKS: Record<string, { weightPerMeter?: number; weightPerSquareMeter?: number }> = {
  // Wires (Category: ลวด)
  'd1-007-028': { weightPerMeter: 0.048 },    // ลวดเหล็ก(ขด) 2.8 มม.
  'd1-007-020': { weightPerMeter: 0.025 },    // ลวดเหล็ก(ขด) 2.0 มม.
  'd1-003-004': { weightPerMeter: 0.0989 },   // ลวด PC-Wire 4 มม.
  'd1-003-005': { weightPerMeter: 0.1540 },   // ลวด PC-Wire 5 มม.
  'd1-003-007': { weightPerMeter: 0.3020 },   // ลวด PC-WIRE 7 มม.
  'd1-004-012a': { weightPerMeter: 0.7750 },  // ลวด PC-Strand 1/2"

  // Rebars (Category: เหล็กเส้น)
  'd1-009-006': { weightPerMeter: 0.2220 },   // เหล็กเส้นกลม 6 มม. RB 6
  'd1-009-009': { weightPerMeter: 0.4990 },   // เหล็กเส้นกลม 9 มม. RB 9
  'd1-009-012': { weightPerMeter: 0.8880 },   // RB 12
  'd1-010-d12': { weightPerMeter: 0.8880 },   // DB 12 MM
  'd1-010-d16': { weightPerMeter: 1.5800 },   // DB 16 MM
  'd1-010-d20': { weightPerMeter: 2.4700 },   // DB 20 MM
  'd1-010-d25': { weightPerMeter: 3.8500 },   // DB 25 MM

  // Mesh (Category: เมช)
  'd1-012-42020': { weightPerSquareMeter: 0.99 }, // ตะแกรงเหล็กสำเร็จรูป 4mm 20*20
  'd1-012-41010': { weightPerSquareMeter: 1.97 }, // ตะแกรงเหล็กสำเร็จรูป 4mm 10*10
  'd1-012-62020': { weightPerSquareMeter: 2.22 }, // ตะแกรงเหล็กสำเร็จรูป 6มม 20*20
  'd1-012-61515': { weightPerSquareMeter: 2.96 }, // ตะแกรงเหล็กสำเร็จรูป 6มม 15*15
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
  totalConcrete,
  planMaterials = [],
  onClose,
}: FgPrintClientProps) {
  const router = useRouter()
  const printRef = useRef<HTMLDivElement>(null)
  const [isExporting, setIsExporting] = useState<'pdf' | 'png' | null>(null)

  // คำนวณยอดรวมแผ่นงานที่ 1
  const totalTarget = items.reduce((s, i) => s + i.qtyTarget, 0)
  const totalGood = items.reduce((s, i) => s + i.qtyGood, 0)
  const totalDefect = items.reduce((s, i) => s + i.qtyDefect, 0)

  // ─── การคำนวณวัตถุดิบ (Raw Material Calculations) ───
  const getMaterialWeightPerMeter = (rawMat: any) => {
    if (!rawMat) return 0.154
    if (rawMat.weightPerMeter && rawMat.weightPerMeter > 0) {
      return rawMat.weightPerMeter
    }
    if (rawMat.weight_per_meter && rawMat.weight_per_meter > 0) {
      return rawMat.weight_per_meter
    }
    const code = (rawMat.materialCode || rawMat.material_code || '').toLowerCase().trim()
    return MATERIAL_FALLBACKS[code]?.weightPerMeter || 0.154
  }

  const getMaterialWeightPerSquareMeter = (rawMat: any) => {
    if (!rawMat) return 1.32
    const code = (rawMat.materialCode || rawMat.material_code || '').toLowerCase().trim()
    return MATERIAL_FALLBACKS[code]?.weightPerSquareMeter || 1.32
  }

  // 1. ดึงความต้องการทางทฤษฎี (Theoretical Requirements) ของแต่ละสินค้าเป็นเกณฑ์จัดสรร
  const productTheoreticals = items.map(item => {
    const qty = item.qtyGood
    const materialsList: Array<{
      bomItem: BomItem | null
      isConcrete: boolean
      theoreticalQty: number // ค่าทฤษฎีดิบ
    }> = []

    if (item.concretePerUnit > 0) {
      materialsList.push({
        bomItem: null,
        isConcrete: true,
        theoreticalQty: item.concretePerUnit * qty,
      })
    }

    if (item.bomItems && item.bomItems.length > 0) {
      item.bomItems.forEach(bom => {
        materialsList.push({
          bomItem: bom,
          isConcrete: false,
          theoreticalQty: bom.qtyPerUnit * qty,
        })
      })
    } else {
      // Fallback BOM items if none in DB but products have parameters
      if (item.wirePerUnit > 0) {
        materialsList.push({
          bomItem: {
            id: 'fallback-wire',
            qtyPerUnit: item.wirePerUnit,
            materialName: 'ลวดอัดแรง (PC Wire)',
            materialCategory: 'ลวด',
            materialUnit: 'กก.',
            materialCode: 'd1-003-005',
            weightPerMeter: 0.154,
          },
          isConcrete: false,
          theoreticalQty: item.wirePerUnit * qty,
        })
      }
      if (item.rebarPerUnit > 0) {
        materialsList.push({
          bomItem: {
            id: 'fallback-rebar',
            qtyPerUnit: item.rebarPerUnit,
            materialName: 'เหล็กเส้นกลม (RB/DB)',
            materialCategory: 'เหล็กเส้น',
            materialUnit: 'เมตร',
            materialCode: 'd1-009-012',
            weightPerMeter: 0.888,
          },
          isConcrete: false,
          theoreticalQty: item.rebarPerUnit * qty,
        })
      }
      if (item.meshPerUnit > 0) {
        materialsList.push({
          bomItem: {
            id: 'fallback-mesh',
            qtyPerUnit: item.meshPerUnit,
            materialName: 'ตะแกรงเหล็กสำเร็จรูป (Mesh)',
            materialCategory: 'เมช',
            materialUnit: 'ตร.ม.',
            materialCode: 'd1-012-42020',
            weightPerMeter: null,
          },
          isConcrete: false,
          theoreticalQty: item.meshPerUnit * qty,
        })
      }
    }

    return {
      productName: item.productName,
      productCode: item.productCode,
      size: item.size,
      bed: item.bed,
      qtyGood: qty,
      materials: materialsList,
    }
  })

  // คำนวณความต้องการทางทฤษฎีรวม (Total Theoretical Requirements) เพื่อหาอัตราส่วนสัดส่วน (Ratio)
  const totalTheoreticalPM: Record<string, number> = {}
  const totalTheoreticalConcrete = items.reduce((s, i) => s + i.qtyGood * i.concretePerUnit, 0)

  planMaterials.forEach(pm => {
    let sum = 0
    productTheoreticals.forEach(pt => {
      pt.materials.forEach(ptm => {
        if (ptm.bomItem && !ptm.isConcrete) {
          const pmCode = (pm.rawMaterial?.materialCode || '').toLowerCase().trim()
          const bomCode = (ptm.bomItem.materialCode || '').toLowerCase().trim()
          const pmName = (pm.rawMaterial?.name || '').toLowerCase().trim()
          const bomName = (ptm.bomItem.materialName || '').toLowerCase().trim()

          const isMatch = (pmCode && bomCode && pmCode === bomCode) || (pmName && bomName && pmName === bomName)
          if (isMatch) {
            sum += ptm.theoreticalQty
          }
        }
      })
    })
    totalTheoreticalPM[pm.id] = sum
  })

  // 2. คำนวณความต้องการตามทฤษฎีจริงของแต่ละสินค้า (ระบบคำนวณตามจำนวนชิ้นงานดีที่ผลิตได้)
  const productMaterials = productTheoreticals.map(pt => {
    const theoreticalMaterials = pt.materials.map(ptm => {
      let netQty = ptm.theoreticalQty
      let netWeightKg = 0
      let category = ''
      let name = ''
      let bomUnit = ''
      let bomQtyPerUnit = 0

      if (ptm.isConcrete) {
        category = 'คอนกรีต'
        name = 'คอนกรีตผสมเสร็จ (Ready-mixed Concrete)'
        bomUnit = 'คิว'
        bomQtyPerUnit = pt.qtyGood > 0 ? (ptm.theoreticalQty / pt.qtyGood) : 0
        netWeightKg = netQty * 2400
      } else if (ptm.bomItem) {
        const bom = ptm.bomItem
        category = bom.materialCategory
        name = bom.materialName
        bomUnit = bom.materialUnit
        bomQtyPerUnit = bom.qtyPerUnit

        const isWire = category === 'ลวด' || category === 'Wire'
        const isRebar = category === 'เหล็กเส้น'
        const isMesh = category === 'เมช' || category === 'Mesh'
        const wpm = getMaterialWeightPerMeter(bom as any) || 0.154
        const wpsm = getMaterialWeightPerSquareMeter(bom as any) || 1.32

        if (isWire) {
          netWeightKg = netQty
          netQty = wpm > 0 ? netQty / wpm : 0
        } else if (isRebar) {
          netWeightKg = netQty * wpm
        } else if (isMesh) {
          netWeightKg = netQty * wpsm
        } else {
          netWeightKg = netQty
        }
      }

      return {
        name,
        category,
        bomQtyPerUnit,
        bomUnit,
        netQty,
        netWeightKg,
        netLengthOrArea: category === 'ลวด' || category === 'เหล็กเส้น' || category === 'เมช' ? netQty : 0,
      }
    })

    return {
      productName: pt.productName,
      productCode: pt.productCode,
      size: pt.size,
      bed: pt.bed,
      qtyGood: pt.qtyGood,
      materials: theoreticalMaterials,
    }
  })

  // 3. หาส่วนต่างของยอดเบิกจ่ายที่เกินกว่าทฤษฎี หรือเบิกเพิ่มพิเศษ (Surplus / Unallocated Materials)
  const unallocatedMaterials: Array<{
    name: string
    category: string
    qtyDispensed: number
    unit: string
    rawMaterial: any
  }> = []

  // 3.1 ตรวจสอบส่วนต่างของคอนกรีตผสมเสร็จ
  const excessConcrete = totalConcrete - totalTheoreticalConcrete
  if (excessConcrete > 0.001) {
    unallocatedMaterials.push({
      name: 'คอนกรีตผสมเสร็จ (Ready-mixed Concrete)',
      category: 'คอนกรีต',
      qtyDispensed: excessConcrete,
      unit: 'คิว',
      rawMaterial: {
        name: 'คอนกรีตผสมเสร็จ (Ready-mixed Concrete)',
        category: 'คอนกรีต',
        unit: 'คิว',
        material_code: null,
        weight_per_meter: null,
      }
    })
  }

  // 3.2 ตรวจสอบส่วนต่างของวัตถุดิบอื่นๆ ในแผนการผลิต
  planMaterials.forEach(pm => {
    const totalTheo = totalTheoreticalPM[pm.id] || 0
    const excess = pm.qtyDispensed - totalTheo
    if (excess > 0.01) {
      unallocatedMaterials.push({
        name: pm.rawMaterial?.name || 'วัสดุไม่มีชื่อ',
        category: pm.rawMaterial?.category || 'อื่นๆ',
        qtyDispensed: excess,
        unit: pm.rawMaterial?.unit || '',
        rawMaterial: pm.rawMaterial,
      })
    }
  })

  // 4. คำนวณยอดรวมสรุปวัตถุดิบทั้งหมดสำหรับแสดงใน Dashboard Cards (ตรงกับคลัง)
  const totalConcreteVol = totalConcrete
  
  let totalWireWeight = 0
  let totalWireLength = 0
  let totalRebarLength = 0
  let totalRebarWeight = 0
  let totalMeshArea = 0
  let totalMeshWeight = 0

  planMaterials.forEach(pm => {
    const rawMat = pm.rawMaterial || {}
    const category = rawMat.category
    const isWire = category === 'ลวด' || category === 'Wire'
    const isRebar = category === 'เหล็กเส้น'
    const isMesh = category === 'เมช' || category === 'Mesh'
    const qtyDispensed = pm.qtyDispensed

    if (isWire) {
      const wpm = getMaterialWeightPerMeter(rawMat) || 0.154
      totalWireWeight += qtyDispensed
      totalWireLength += wpm > 0 ? qtyDispensed / wpm : 0
    } else if (isRebar) {
      const wpm = getMaterialWeightPerMeter(rawMat) || 0.888
      totalRebarLength += qtyDispensed
      totalRebarWeight += qtyDispensed * wpm
    } else if (isMesh) {
      const wpsm = getMaterialWeightPerSquareMeter(rawMat) || 1.32
      totalMeshArea += qtyDispensed
      totalMeshWeight += qtyDispensed * wpsm
    }
  })

  // ─── การส่งออก PDF & PNG (Multi-Page Capture) ───
  const handleDownloadPDF = async () => {
    const element = printRef.current
    if (!element) return
    setIsExporting('pdf')
    try {
      const pages = element.querySelectorAll('.print-page')
      if (pages.length === 0) return

      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()

      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i] as HTMLElement
        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          scrollY: 0,
          windowHeight: pageEl.scrollHeight
        })
        const imgData = canvas.toDataURL('image/png')
        
        if (i > 0) {
          pdf.addPage()
        }
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      }
      
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
      const pages = element.querySelectorAll('.print-page')
      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i] as HTMLElement
        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          scrollY: 0,
          windowHeight: pageEl.scrollHeight
        })
        const url = canvas.toDataURL('image/png')
        const link = document.createElement('a')
        link.href = url
        link.download = `FG-${orderNumber}-page${i + 1}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    } catch (err: any) {
      console.error('PNG Generation Error:', err)
      alert("เกิดข้อผิดพลาดในการสร้างไฟล์ PNG: " + err?.message)
    } finally {
      setIsExporting(null)
    }
  }

  const handlePrint = () => window.print()

  // จัดกลุ่มแผ่นแรกตามหมวดหมู่
  const groupedItems = items.reduce((acc, item) => {
    const cat = item.category || 'อื่นๆ'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {} as Record<string, FgItem[]>)

  return (
    <>
      {/* Print-only CSS Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          html, body, main, div:not(#fg-print-root):not(#fg-print-root *) {
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            position: static !important;
            display: block !important;
          }
          body { visibility: hidden !important; background: #fff !important; }
          #fg-print-root {
            visibility: visible !important;
            position: relative !important;
            width: 210mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            display: block !important;
            height: auto !important;
            overflow: visible !important;
            background: #fff !important;
          }
          #fg-print-root * { visibility: visible !important; }
          .print-page {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            box-shadow: none !important;
            border: none !important;
            padding: 16mm 20mm 20mm 20mm !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            background: #fff !important;
          }
          .print-page:not(:last-of-type) {
            page-break-after: always !important;
            break-after: page !important;
          }
          #fg-toolbar { display: none !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}} />

      {/* Screen Layout Container */}
      <div
        id="fg-print-root"
        ref={printRef}
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
          gap: 40, // ระยะห่างเสมือนระหว่างหน้า A4 บนหน้าจอ
        }}
      >
        {/* 📄 หน้า 1: ใบรายงานผลการผลิตสินค้าสำเร็จรูป */}
        <div
          className="print-page"
          style={{
            background: '#fff',
            width: '210mm',
            minHeight: '297mm',
            boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
            borderRadius: 4,
            padding: '16mm 20mm 20mm 20mm',
            position: 'relative',
            color: '#1A1B23',
            fontFamily: "'IBM Plex Sans Thai', 'Sarabun', sans-serif",
            boxSizing: 'border-box',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2.5px solid #111827', paddingBottom: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ background: '#2563EB', borderRadius: 10, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <img 
                  src="/logo.png" 
                  alt="PCC Logo" 
                  style={{ width: '28px', height: '28px', objectFit: 'contain', alignSelf: 'center' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    e.currentTarget.parentElement?.insertAdjacentHTML('beforeend', '<i class="fas fa-industry" style="color: #fff; font-size: 20px; margin: auto;"></i>');
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

          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <h1 style={{ fontSize: 17, fontWeight: 800, color: '#111827', letterSpacing: '0.02em', margin: 0 }}>
              ใบรายงานผลการผลิตสินค้าสำเร็จรูป (FINISHED GOODS REPORT)
            </h1>
          </div>

          {/* Meta Info Bar */}
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

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 12 }}>
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
                          โรง {item.bed}
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
                <td style={{ border: '1px solid #E5E7EB', padding: '10px', textAlign: 'center', fontSize: 14, color: totalDefect > 0 ? '#DC2626' : '#9CA3AF' }}>
                  {totalDefect.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #E5E7EB', padding: '10px', fontSize: 11, color: '#9CA3AF', fontWeight: 400 }}>
                  ชิ้นดีรวม {((totalGood / Math.max(totalTarget, 1)) * 100).toFixed(1)}% | ชิ้นเสียรวม {((totalDefect / Math.max(totalTarget, 1)) * 100).toFixed(1)}%
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Remarks */}
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '12px 16px', background: '#FAFAFA', fontSize: 11, color: '#6B7280', lineHeight: 1.5, marginBottom: 100 }}>
            <strong>หมายเหตุ:</strong>
            <ol style={{ margin: '4px 0 0 16px', padding: 0 }}>
              <li>ปริมาณสินค้าสำเร็จรูป (งานดี) ข้างต้น ได้รับการตรวจสอบและยืนยันสถานะคุณภาพจากฝ่ายควบคุมคุณภาพ (QC) เรียบร้อยแล้ว</li>
              <li>เจ้าหน้าที่คลังสินค้าตรวจนับสินค้าจริงเปรียบเทียบกับเอกสารนี้ ก่อนเซ็นรับสินค้าเข้าสู่คลังสินค้าสำเร็จรูป (FG Inventory)</li>
              <li>เมื่อตรวจสอบและเซ็นเอกสารครบถ้วนแล้ว ให้นำเลขที่อ้างอิง ERP ไปบันทึกอัปเดตลงในระบบ ERP เครือข่ายส่วนกลาง</li>
            </ol>
          </div>

          {/* Footer Signature */}
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
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 140, borderBottom: '1px dashed #9CA3AF', marginBottom: 8, height: 35 }}></div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{confirmedBy}</div>
                <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>ผู้อนุมัติแผนและสั่งผลิต</div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 160, borderBottom: '1px dashed #9CA3AF', marginBottom: 8, height: 35 }}></div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>(....................................................)</div>
                <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2, fontWeight: 700 }}>พนักงานคลังสินค้า (Warehouse Staff)</div>
                <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 4 }}>วันที่ ......../......../........</div>
              </div>
            </div>
          </div>
        </div>

        {/* 📄 หน้า 2: ใบสรุปรายการวัตถุดิบที่ใช้จริง */}
        <div
          className="print-page"
          style={{
            background: '#fff',
            width: '210mm',
            minHeight: '297mm',
            boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
            borderRadius: 4,
            padding: '16mm 20mm 20mm 20mm',
            position: 'relative',
            color: '#1A1B23',
            fontFamily: "'IBM Plex Sans Thai', 'Sarabun', sans-serif",
            boxSizing: 'border-box',
            breakBefore: 'page',
          }}
        >
          {/* Header หน้า 2 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2.5px solid #111827', paddingBottom: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ background: '#2563EB', borderRadius: 10, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <img 
                  src="/logo.png" 
                  alt="PCC Logo" 
                  style={{ width: '28px', height: '28px', objectFit: 'contain', alignSelf: 'center' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    e.currentTarget.parentElement?.insertAdjacentHTML('beforeend', '<i class="fas fa-industry" style="color: #fff; font-size: 20px; margin: auto;"></i>');
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

          {/* Title หน้า 2 */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <h1 style={{ fontSize: 16, fontWeight: 800, color: '#111827', letterSpacing: '0.02em', margin: 0 }}>
              ใบสรุปรายการวัตถุดิบ (RAW MATERIAL SUMMARY REPORT)
            </h1>
            <p style={{ fontSize: 10, color: '#6B7280', margin: '4px 0 0' }}>
              สรุปการใช้วัตถุดิบสุทธิในการผลิตจริงสำหรับสินค้าสำเร็จรูป (งานดี)
            </p>
          </div>

          {/* Dashboard สรุปวัตถุดิบภาพรวม */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
            {/* 1. คอนกรีต */}
            <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#0369A1', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="fas fa-fill-drip" style={{ fontSize: 10 }}></i> คอนกรีตรวม
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0284C7', lineHeight: 1.1 }}>
                {totalConcreteVol.toFixed(3)} <span style={{ fontSize: 10, fontWeight: 600 }}>ม.³</span>
              </div>
              <div style={{ fontSize: 9, color: '#0369A1', marginTop: 3 }}>
                ≈ {(totalConcreteVol * 2.4).toFixed(2)} ตัน
              </div>
            </div>

            {/* 2. ลวดเหล็ก */}
            <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#B45309', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="fas fa-ring" style={{ fontSize: 10 }}></i> ลวดเหล็กรวม
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#D97706', lineHeight: 1.1 }}>
                {totalWireWeight.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span style={{ fontSize: 10, fontWeight: 600 }}>กก.</span>
              </div>
              <div style={{ fontSize: 9, color: '#B45309', marginTop: 3 }}>
                ≈ {totalWireLength.toLocaleString(undefined, { maximumFractionDigits: 1 })} เมตร
              </div>
            </div>

            {/* 3. เหล็กเส้น */}
            <div style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#475569', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="fas fa-bars-staggered" style={{ fontSize: 10 }}></i> เหล็กเส้นรวม
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#475569', lineHeight: 1.1 }}>
                {totalRebarLength.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span style={{ fontSize: 10, fontWeight: 600 }}>เมตร</span>
              </div>
              <div style={{ fontSize: 9, color: '#475569', marginTop: 3 }}>
                ≈ {totalRebarWeight.toLocaleString(undefined, { maximumFractionDigits: 2 })} กก.
              </div>
            </div>

            {/* 4. ตะแกรง Mesh */}
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#16A34A', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="fas fa-table-cells" style={{ fontSize: 10 }}></i> ตะแกรง Mesh รวม
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#16A34A', lineHeight: 1.1 }}>
                {totalMeshArea.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span style={{ fontSize: 10, fontWeight: 600 }}>ตร.ม.</span>
              </div>
              <div style={{ fontSize: 9, color: '#16A34A', marginTop: 3 }}>
                ≈ {totalMeshWeight.toLocaleString(undefined, { maximumFractionDigits: 2 })} กก.
              </div>
            </div>
          </div>

          {/* ตารางรายละเอียด แยกตามรายการสินค้า */}
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: '#475569', fontWeight: 700, width: '50%' }}>สินค้าสำเร็จรูป / วัตถุดิบประกอบ (BOM)</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', color: '#475569', fontWeight: 700, width: '15%' }}>จำนวนดี</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', color: '#475569', fontWeight: 700, width: '18%' }}>จำนวนรวม</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', color: '#475569', fontWeight: 700, width: '17%' }}>น้ำหนักรวม</th>
                </tr>
              </thead>
              <tbody>
                {productMaterials.map((pm, pmIdx) => (
                  <React.Fragment key={pmIdx}>
                    {/* แถวหลัก: สินค้าสำเร็จรูป */}
                    <tr style={{ background: '#F1F5F9', borderTop: pmIdx > 0 ? '1.5px solid #CBD5E1' : 'none' }}>
                      <td colSpan={2} style={{ padding: '6px 10px', fontWeight: 800, color: '#1E293B', fontSize: 11.5 }}>
                        {pmIdx + 1}. {pm.productName} {pm.size && pm.size !== '-' ? ` (${pm.size})` : ''}
                        <span style={{ fontSize: 9.5, color: '#64748B', fontFamily: 'monospace', marginLeft: 8 }}>[{pm.productCode}]</span>
                      </td>
                      <td style={{ padding: '6px 10px', fontWeight: 800, color: '#1E293B', textAlign: 'center' }}>
                        {pm.qtyGood.toLocaleString()} ชิ้น
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 9.5, color: '#64748B', fontWeight: 600 }}>
                        โรงผลิต {pm.bed}
                      </td>
                    </tr>

                    {/* รายการวัตถุดิบย่อยของสินค้านั้นๆ */}
                    {pm.materials.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: '8px 10px', textAlign: 'center', color: '#94A3B8', fontStyle: 'italic' }}>
                          ไม่มีข้อมูลสูตรวัตถุดิบ BOM ในระบบ
                        </td>
                      </tr>
                    ) : (
                      pm.materials.map((m, mIdx) => (
                        <tr key={mIdx} style={{ background: '#fff', borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '6px 10px 6px 20px', color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              display: 'inline-block',
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: m.category === 'คอนกรีต' ? '#3B82F6' : m.category === 'ลวด' ? '#F59E0B' : m.category === 'เหล็กเส้น' ? '#64748B' : '#10B981'
                            }}></span>
                            {m.name}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', color: '#64748B' }}>
                            -
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#475569', fontWeight: 500 }}>
                            {m.category === 'คอนกรีต'
                              ? `${m.netQty.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} คิว`
                              : m.category === 'ลวด'
                                ? `${m.netLengthOrArea.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} เมตร`
                                : m.category === 'เหล็กเส้น'
                                  ? `${m.netQty.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} เมตร`
                                  : m.category === 'เมช'
                                    ? `${m.netQty.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ตรม.`
                                    : `${m.netQty.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ${m.bomUnit}`
                            }
                          </td>
                          {/* น้ำหนักรวม */}
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#0F172A', fontWeight: 700 }}>
                            {m.category === 'คอนกรีต'
                              ? `${(m.netWeightKg / 1000).toFixed(2)} ตัน`
                              : m.category === 'ลวด'
                                ? `${m.netWeightKg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} กก.`
                                : m.category === 'เหล็กเส้น'
                                  ? `${m.netWeightKg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} กก.`
                                  : m.category === 'เมช'
                                    ? 'ไม่ระบุ'
                                    : `${m.netWeightKg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} กก.`
                            }
                          </td>
                        </tr>
                      ))
                    )}
                  </React.Fragment>
                ))}

                {unallocatedMaterials.length > 0 && (
                  <>
                    <tr style={{ background: '#FFF5F5', borderTop: '1.5px solid #FCA5A5' }}>
                      <td colSpan={2} style={{ padding: '6px 10px', fontWeight: 800, color: '#991B1B', fontSize: 11.5 }}>
                        รายการส่วนเกิน / วัสดุอื่นๆ (Extra / Other Materials)
                      </td>
                      <td style={{ padding: '6px 10px', fontWeight: 800, color: '#991B1B', textAlign: 'center' }}>
                        -
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 9.5, color: '#991B1B', fontWeight: 600 }}>
                        เบิกจ่ายพิเศษ
                      </td>
                    </tr>
                    {unallocatedMaterials.map((m, mIdx) => {
                      const isWire = m.category === 'ลวด' || m.category === 'Wire'
                      const isRebar = m.category === 'เหล็กเส้น'
                      const isMesh = m.category === 'เมช' || m.category === 'Mesh'
                      const isConcrete = m.category === 'คอนกรีต'
                      const wpm = getMaterialWeightPerMeter(m.rawMaterial) || 0.154

                      let displayQtyStr = ''
                      let displayWeightStr = ''

                      if (isConcrete) {
                        displayQtyStr = `${m.qtyDispensed.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} คิว`
                        displayWeightStr = `${(m.qtyDispensed * 2.4).toFixed(2)} ตัน`
                      } else if (isWire) {
                        const len = wpm > 0 ? m.qtyDispensed / wpm : 0
                        displayQtyStr = `${len.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} เมตร`
                        displayWeightStr = `${m.qtyDispensed.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} กก.`
                      } else if (isRebar) {
                        const wt = m.qtyDispensed * wpm
                        displayQtyStr = `${m.qtyDispensed.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} เมตร`
                        displayWeightStr = `${wt.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} กก.`
                      } else if (isMesh) {
                        displayQtyStr = `${m.qtyDispensed.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ตรม.`
                        displayWeightStr = 'ไม่ระบุ'
                      } else {
                        displayQtyStr = `${m.qtyDispensed.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ${m.unit}`
                        const wt = wpm > 0 ? m.qtyDispensed * wpm : m.qtyDispensed
                        displayWeightStr = `${wt.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} กก.`
                      }

                      let bulletColor = '#EF4444'
                      if (isConcrete) bulletColor = '#3B82F6'
                      else if (isWire) bulletColor = '#F59E0B'
                      else if (isRebar) bulletColor = '#64748B'
                      else if (isMesh) bulletColor = '#10B981'

                      return (
                        <tr key={mIdx} style={{ background: '#fff', borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '6px 10px 6px 20px', color: '#7F1D1D', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              display: 'inline-block',
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: bulletColor
                            }}></span>
                            {m.name}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', color: '#991B1B' }}>
                            -
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#991B1B', fontWeight: 500 }}>
                            {displayQtyStr}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#7F1D1D', fontWeight: 700 }}>
                            {displayWeightStr}
                          </td>
                        </tr>
                      )
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* สรุปข้อมูลการแปลงหน่วยท้ายกระดาษ */}
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 14px', background: '#FAFAFA', fontSize: 10, color: '#6B7280', lineHeight: 1.5, marginBottom: 80 }}>
            <strong>หมายเหตุการคำนวณ:</strong>
            <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
              <li><strong>คอนกรีต:</strong> แปลงปริมาตร (ลบ.ม.) เป็นน้ำหนักโดยใช้อัตราความหนาแน่นเหล็กเสริมเสมือน 2.4 ตัน/ลบ.ม. (2,400 กก./ลบ.ม.)</li>
              <li><strong>ลวด (PC Wire/Strand):</strong> คำนวณจากน้ำหนักสูตรผลิต และแปลงกลับเป็นความยาวตามน้ำหนักจำเพาะต่อเมตรของลวดแต่ละขนาด</li>
              <li><strong>เหล็กเส้น (RB/DB):</strong> คำนวณความยาวรวมจากสูตร และแปลงเป็นน้ำหนักตามสัมประสิทธิ์ขนาดหน้าตัดเหล็กมาตรฐาน มอก.</li>
              <li><strong>ยอดรวมสุทธิ:</strong> คำนวณสรุปเฉพาะวัตถุดิบที่ใช้ในสินค้าที่ผ่านการตรวจรับคุณภาพเป็นชิ้นดี (Good Qty) เรียบร้อยแล้ว</li>
            </ul>
          </div>

          {/* Footer หน้า 2 */}
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
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 140, borderBottom: '1px dashed #9CA3AF', marginBottom: 8, height: 35 }}></div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{confirmedBy}</div>
                <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>ผู้อนุมัติแผนและสั่งผลิต</div>
              </div>

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
            zIndex: 9999,
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
            onClick={() => onClose ? onClose() : (window.history.length > 1 ? window.history.back() : router.push('/inventory/fg'))}
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
