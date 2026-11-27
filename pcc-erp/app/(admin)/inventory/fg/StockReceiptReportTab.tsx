'use client'

import React, { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import {
  getStockReceiptReportData,
  type StockReceiptReportResult,
  type StockReceiptGroup,
  type StockReceiptItemRow,
} from '@/app/actions/fg-report'

export default function StockReceiptReportTab() {
  // ─── Filter States ──────────────────────────────────────────
  const [criteria, setCriteria] = useState<'realtime' | 'erp_synced' | 'all'>('realtime')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => {
    const now = new Date()
    // First day of current month
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const y1 = firstDay.getFullYear()
    const m1 = String(firstDay.getMonth() + 1).padStart(2, '0')
    const d1 = String(firstDay.getDate()).padStart(2, '0')

    const y2 = now.getFullYear()
    const m2 = String(now.getMonth() + 1).padStart(2, '0')
    const d2 = String(now.getDate()).padStart(2, '0')

    return {
      start: `${y1}-${m1}-${d1}`,
      end: `${y2}-${m2}-${d2}`,
    }
  })
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [reportData, setReportData] = useState<StockReceiptReportResult | null>(null)

  // ─── Fetch Report Data ──────────────────────────────────────
  const loadData = async () => {
    setIsLoading(true)
    try {
      const data = await getStockReceiptReportData({
        startDate: dateRange.start || undefined,
        endDate: dateRange.end || undefined,
        category: selectedCategory,
        criteria,
      })
      setReportData(data)
    } catch (err: any) {
      console.error('Failed to load stock receipt report:', err)
      toast.error('ไม่สามารถโหลดข้อมูลรายงานได้: ' + (err.message || 'เกิดข้อผิดพลาด'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [criteria, selectedCategory, dateRange.start, dateRange.end])

  // ─── Client Filter for Search Text ──────────────────────────
  const filteredGroups = useMemo(() => {
    if (!reportData) return []
    if (!search.trim()) return reportData.groups

    const q = search.trim().toLowerCase()
    const result: StockReceiptGroup[] = []

    for (const grp of reportData.groups) {
      const matchedItems = grp.items.filter(
        i =>
          i.orderNumber.toLowerCase().includes(q) ||
          i.erpReference.toLowerCase().includes(q) ||
          i.recordedBy.toLowerCase().includes(q) ||
          i.confirmedBy.toLowerCase().includes(q) ||
          i.productCode.toLowerCase().includes(q) ||
          i.productName.toLowerCase().includes(q) ||
          i.fullProductText.toLowerCase().includes(q) ||
          i.bed.toLowerCase().includes(q) ||
          i.thaiDate.includes(q)
      )

      if (matchedItems.length > 0) {
        let subGood = 0
        let subDefect = 0
        let subSqmGood = 0
        let subSqmDefect = 0
        matchedItems.forEach(item => {
          subGood += item.qtyGood
          subDefect += item.qtyDefect
          subSqmGood += item.sqmGood
          subSqmDefect += item.sqmDefect
        })

        result.push({
          category: grp.category,
          items: matchedItems,
          subtotal: {
            qtyGood: subGood,
            qtyDefect: subDefect,
            sqmGood: Math.round((subSqmGood + Number.EPSILON) * 100) / 100,
            sqmDefect: Math.round((subSqmDefect + Number.EPSILON) * 100) / 100,
          },
        })
      }
    }

    return result
  }, [reportData, search])

  // Summary computed after client search
  const currentSummary = useMemo(() => {
    let itemsCount = 0
    let good = 0
    let defect = 0
    let sqmG = 0
    let sqmD = 0

    for (const g of filteredGroups) {
      itemsCount += g.items.length
      good += g.subtotal.qtyGood
      defect += g.subtotal.qtyDefect
      sqmG += g.subtotal.sqmGood
      sqmD += g.subtotal.sqmDefect
    }

    return {
      totalItems: itemsCount,
      qtyGood: good,
      qtyDefect: defect,
      sqmGood: Math.round((sqmG + Number.EPSILON) * 100) / 100,
      sqmDefect: Math.round((sqmD + Number.EPSILON) * 100) / 100,
    }
  }, [filteredGroups])

  // ─── Export Excel Function (Report No. IV70007) ─────────────
  const handleExportExcel = async () => {
    if (!reportData || filteredGroups.length === 0) {
      toast.error('ไม่มีข้อมูลสำหรับส่งออก')
      return
    }

    setIsExporting(true)
    const toastId = toast.loading('กำลังจัดทำไฟล์ Excel Report IV70007...')

    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()

      const meta = reportData.meta
      const catStart = selectedCategory === 'all' ? 'A13' : selectedCategory.split(' ')[0]
      const catEnd = selectedCategory === 'all' ? 'A82' : selectedCategory.split(' ')[0]

      // 1. Build Header Block
      const aoa: any[][] = [
        ['Report No. IV70007'],
        ['รายงาน รับเข้าสต็อก แยกกลุ่มสินค้า'],
        [`ตั้งแต่วันที่ ${meta.startDateStr} ถึง ${meta.endDateStr}`],
        [`เลือกกลุ่มสินค้า ตั้งแต่ ${catStart} ถึง ${catEnd}`],
        [`เฉพาะสาขา/โครงการ : ${meta.plantStr}`],
        [
          'No.',
          'เลขที่ใบสั่งผลิต',
          'หมายเลขอ้างอิงระบบกลาง (ERP)',
          'ลงวันที่',
          'โรงงาน',
          'แท่นผลิต',
          'สินค้า',
          'กว้าง',
          'ยาว',
          'รูปร่าง',
          'ดี',
          'เสีย',
          'พื้นที่ ดี',
          'พื้นที่ เสีย',
          'ผู้บันทึกข้อมูล (QC/ตัดยก)',
          'ผู้ยืนยันข้อมูล (ERP Confirmer)',
        ],
      ]

      let excelRowIndex = 1

      // 2. Build Category Groups
      filteredGroups.forEach(group => {
        // Category Group Banner Row
        aoa.push([group.category])

        // Items
        group.items.forEach(item => {
          aoa.push([
            excelRowIndex++,
            item.orderNumber,
            item.erpReference || '-',
            item.thaiDate,
            item.plant,
            item.bed,
            item.fullProductText,
            item.width > 0 ? Number(item.width.toFixed(2)) : 0,
            item.length > 0 ? Number(item.length.toFixed(2)) : 0,
            item.shape,
            Number(item.qtyGood.toFixed(2)),
            Number(item.qtyDefect.toFixed(2)),
            Number(item.sqmGood.toFixed(2)),
            Number(item.sqmDefect.toFixed(2)),
            item.recordedBy || '-',
            item.confirmedBy || '-',
          ])
        })

        // Subtotal per category
        aoa.push([
          '',
          `รวมกลุ่ม ${group.category}`,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          Number(group.subtotal.qtyGood.toFixed(2)),
          Number(group.subtotal.qtyDefect.toFixed(2)),
          Number(group.subtotal.sqmGood.toFixed(2)),
          Number(group.subtotal.sqmDefect.toFixed(2)),
          '',
          '',
        ])
      })

      // 3. Grand Total Row
      aoa.push([
        '',
        'รวมทั้งสิ้น (Grand Total)',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        Number(currentSummary.qtyGood.toFixed(2)),
        Number(currentSummary.qtyDefect.toFixed(2)),
        Number(currentSummary.sqmGood.toFixed(2)),
        Number(currentSummary.sqmDefect.toFixed(2)),
        '',
        '',
      ])

      const ws = XLSX.utils.aoa_to_sheet(aoa)

      // Column widths (wch)
      ws['!cols'] = [
        { wch: 6 },  // No.
        { wch: 18 }, // เลขที่ใบสั่งผลิต
        { wch: 22 }, // หมายเลขอ้างอิงระบบกลาง (ERP)
        { wch: 12 }, // ลงวันที่
        { wch: 10 }, // โรงงาน
        { wch: 10 }, // แท่นผลิต
        { wch: 38 }, // สินค้า
        { wch: 8 },  // กว้าง
        { wch: 8 },  // ยาว
        { wch: 26 }, // รูปร่าง
        { wch: 10 }, // ดี
        { wch: 10 }, // เสีย
        { wch: 12 }, // พื้นที่ ดี
        { wch: 12 }, // พื้นที่ เสีย
        { wch: 20 }, // ผู้บันทึกข้อมูล
        { wch: 20 }, // ผู้ยืนยันข้อมูล
      ]

      XLSX.utils.book_append_sheet(wb, ws, 'IV70007_รับเข้าสต็อก')

      const datePart = `${dateRange.start || 'all'}_to_${dateRange.end || 'all'}`
      const criteriaTag = criteria === 'erp_synced' ? '_ERP' : criteria === 'realtime' ? '_Realtime' : '_All'
      const filename = `รายงานรับเข้าสต็อก_IV70007_${datePart}${criteriaTag}.xlsx`

      XLSX.writeFile(wb, filename)
      toast.success('ดาวน์โหลดไฟล์ Excel สำเร็จ!', { id: toastId })
    } catch (err: any) {
      console.error('Export error:', err)
      toast.error('ไม่สามารถส่งออกไฟล์ Excel ได้: ' + err.message, { id: toastId })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ─── Filter Controls Card ─────────────────────────────────── */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          {/* Criteria Selector (ตัวเลือก A และ ตัวเลือก B) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
              <i className="fas fa-filter" style={{ marginRight: 6, color: 'var(--accent)' }} />
              เกณฑ์การรับเข้า:
            </span>
            <div
              style={{
                display: 'inline-flex',
                background: 'var(--bg)',
                borderRadius: 8,
                padding: 3,
                border: '1px solid var(--border)',
              }}
            >
              <button
                type="button"
                onClick={() => setCriteria('realtime')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: criteria === 'realtime' ? 700 : 500,
                  cursor: 'pointer',
                  background: criteria === 'realtime' ? 'var(--accent)' : 'transparent',
                  color: criteria === 'realtime' ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                <i className="fas fa-hammer" style={{ marginRight: 6 }} />
                ตามการตัดยก/QC (Real-time)
              </button>
              <button
                type="button"
                onClick={() => setCriteria('erp_synced')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: criteria === 'erp_synced' ? 700 : 500,
                  cursor: 'pointer',
                  background: criteria === 'erp_synced' ? 'var(--green)' : 'transparent',
                  color: criteria === 'erp_synced' ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                <i className="fas fa-check-double" style={{ marginRight: 6 }} />
                เฉพาะที่ยืนยัน ERP แล้ว
              </button>
              <button
                type="button"
                onClick={() => setCriteria('all')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: criteria === 'all' ? 700 : 500,
                  cursor: 'pointer',
                  background: criteria === 'all' ? 'var(--surface)' : 'transparent',
                  color: criteria === 'all' ? 'var(--text)' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                ทั้งหมด
              </button>
            </div>
          </div>

          {/* Export Button */}
          <button
            type="button"
            disabled={isExporting || isLoading || filteredGroups.length === 0}
            onClick={handleExportExcel}
            style={{
              padding: '8px 18px',
              background: '#107C41', // Excel Green
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: isExporting || isLoading || filteredGroups.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isExporting || isLoading || filteredGroups.length === 0 ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 4px rgba(16, 124, 65, 0.25)',
              transition: 'background 0.2s',
            }}
          >
            {isExporting ? (
              <>
                <i className="fas fa-spinner fa-spin" />
                กำลังส่งออก Excel...
              </>
            ) : (
              <>
                <i className="fas fa-file-excel" style={{ fontSize: 16 }} />
                Export Excel (Report IV70007)
              </>
            )}
          </button>
        </div>

        {/* Filters Row: Dates + Category + Search */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid var(--border)',
          }}
        >
          {/* Start Date */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              ตั้งแต่วันที่:
            </label>
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: 12,
              }}
            />
          </div>

          {/* End Date */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              ถึงวันที่:
            </label>
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: 12,
              }}
            />
          </div>

          {/* Category Dropdown */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              หมวดหมู่สินค้า:
            </label>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: 12,
              }}
            >
              <option value="all">ทุกหมวดหมู่ (All Categories)</option>
              {reportData?.availableCategories.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              ค้นหารายการ:
            </label>
            <div style={{ position: 'relative' }}>
              <i
                className="fas fa-search"
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  fontSize: 11,
                }}
              />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="เลข PO, อ้างอิง ERP, ผู้บันทึก, ผู้ยืนยัน..."
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 28px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: 12,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── KPI Summary Cards ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>จำนวนรายการทั้งหมด</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', marginTop: 2 }}>
            {currentSummary.totalItems.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 400 }}>รายการ</span>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>จำนวนชิ้นงานดี</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)', marginTop: 2 }}>
            {currentSummary.qtyGood.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 400 }}>แผ่น/ชิ้น</span>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>จำนวนชิ้นงานเสีย</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: currentSummary.qtyDefect > 0 ? '#EF4444' : 'var(--text-muted)', marginTop: 2 }}>
            {currentSummary.qtyDefect.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 400 }}>แผ่น/ชิ้น</span>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>พื้นที่ สินค้าดี (ตร.ม.)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#2563EB', marginTop: 2 }}>
            {currentSummary.sqmGood.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
            <span style={{ fontSize: 12, fontWeight: 400 }}>ตร.ม.</span>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>พื้นที่ สินค้าเสีย (ตร.ม.)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: currentSummary.sqmDefect > 0 ? '#F97316' : 'var(--text-muted)', marginTop: 2 }}>
            {currentSummary.sqmDefect.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
            <span style={{ fontSize: 12, fontWeight: 400 }}>ตร.ม.</span>
          </div>
        </div>
      </div>

      {/* ─── Report Document Preview ───────────────────────────────── */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
        }}
      >
        {/* Document Header Preview */}
        <div
          style={{
            padding: '16px 20px',
            background: 'var(--bg)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.5px' }}>
              Report No. IV70007
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              เฉพาะสาขา/โครงการ : 003 โพสสาขาขอนแก่น
            </span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
            รายงาน รับเข้าสต็อก แยกกลุ่มสินค้า
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            ตั้งแต่วันที่ {reportData?.meta.startDateStr ?? '-'} ถึง {reportData?.meta.endDateStr ?? '-'}
            <span style={{ margin: '0 8px' }}>•</span>
            เลือกกลุ่มสินค้า: {selectedCategory === 'all' ? 'ทุกกลุ่มสินค้า' : selectedCategory}
            <span style={{ margin: '0 8px' }}>•</span>
            เกณฑ์: {criteria === 'erp_synced' ? 'เฉพาะที่ยืนยัน ERP แล้ว' : criteria === 'realtime' ? 'ตามการตัดยก QC (Real-time)' : 'ทั้งหมด'}
          </div>
        </div>

        {/* Table Content */}
        {isLoading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: 24, marginBottom: 12, display: 'block' }} />
            กำลังโหลดข้อมูลรายงานรับเข้าสต็อก...
          </div>
        ) : filteredGroups.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fas fa-box-open" style={{ fontSize: 32, marginBottom: 12, display: 'block', opacity: 0.5 }} />
            ไม่พบข้อมูลการรับเข้าสต็อกสินค้าในช่วงเงื่อนไขที่เลือก
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: 40 }}>No.</th>
                  <th style={{ padding: '10px 10px', textAlign: 'left', minWidth: 125 }}>เลขที่</th>
                  <th style={{ padding: '10px 10px', textAlign: 'left', minWidth: 120 }}>อ้างอิง ERP</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: 90 }}>ลงวันที่</th>
                  <th style={{ padding: '10px 6px', textAlign: 'center', width: 65 }}>โรงงาน</th>
                  <th style={{ padding: '10px 6px', textAlign: 'center', width: 60 }}>แท่นผลิต</th>
                  <th style={{ padding: '10px 10px', textAlign: 'left', minWidth: 200 }}>สินค้า</th>
                  <th style={{ padding: '10px 6px', textAlign: 'right', width: 55 }}>กว้าง</th>
                  <th style={{ padding: '10px 6px', textAlign: 'right', width: 55 }}>ยาว</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', minWidth: 140 }}>รูปร่าง</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', width: 65 }}>ดี</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', width: 65 }}>เสีย</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', width: 75 }}>พื้นที่ ดี</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', width: 75 }}>พื้นที่ เสีย</th>
                  <th style={{ padding: '10px 10px', textAlign: 'left', minWidth: 120 }}>ผู้บันทึกข้อมูล</th>
                  <th style={{ padding: '10px 10px', textAlign: 'left', minWidth: 120 }}>ผู้ยืนยันข้อมูล</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map(group => (
                  <React.Fragment key={group.category}>
                    {/* Category Header Row */}
                    <tr style={{ background: 'rgba(37, 99, 235, 0.08)', borderBottom: '1px solid var(--border)' }}>
                      <td
                        colSpan={16}
                        style={{
                          padding: '8px 12px',
                          fontWeight: 700,
                          color: 'var(--accent)',
                          fontSize: 12,
                        }}
                      >
                        <i className="fas fa-folder-open" style={{ marginRight: 8 }} />
                        {group.category} ({group.items.length} รายการ)
                      </td>
                    </tr>

                    {/* Data Rows */}
                    {group.items.map((item, idx) => (
                      <tr
                        key={`${item.orderNumber}-${item.bed}-${item.productId}-${idx}`}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: idx % 2 === 1 ? 'rgba(0,0,0,0.015)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          {item.no}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {item.orderNumber}
                            {item.isErpSynced && (
                              <span
                                title="ยืนยันเข้าระบบ ERP แล้ว"
                                style={{
                                  fontSize: 9,
                                  color: 'var(--green)',
                                  background: 'rgba(34, 197, 94, 0.1)',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                }}
                              >
                                ERP
                              </span>
                            )}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>
                          {item.erpReference && item.erpReference !== '-' ? (
                            <span
                              style={{
                                background: '#F1F5F9',
                                color: '#1E293B',
                                padding: '2px 7px',
                                borderRadius: 4,
                                border: '1px solid #E2E8F0',
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              {item.erpReference}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          {item.thaiDate}
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>{item.plant}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'center', fontFamily: 'monospace' }}>
                          {item.bed}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: 600 }}>{item.productCode}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.productName}</div>
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {item.width > 0 ? item.width.toFixed(2) : '-'}
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {item.length > 0 ? item.length.toFixed(2) : '-'}
                        </td>
                        <td style={{ padding: '8px', color: 'var(--text-muted)', fontSize: 11 }}>{item.shape}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>
                          {item.qtyGood.toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: item.qtyDefect > 0 ? '#EF4444' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {item.qtyDefect.toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {item.sqmGood.toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: item.sqmDefect > 0 ? '#EF4444' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {item.sqmDefect.toFixed(2)}
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <i className="fas fa-user-edit" style={{ color: '#64748B', fontSize: 10 }} />
                            {item.recordedBy || '-'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <i className="fas fa-user-check" style={{ color: 'var(--green)', fontSize: 10 }} />
                            {item.confirmedBy || '-'}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {/* Subtotal Row */}
                    <tr style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '2px solid var(--border)', fontWeight: 700 }}>
                      <td colSpan={10} style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                        รวมกลุ่ม {group.category} :
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>
                        {group.subtotal.qtyGood.toFixed(2)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: group.subtotal.qtyDefect > 0 ? '#EF4444' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {group.subtotal.qtyDefect.toFixed(2)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                        {group.subtotal.sqmGood.toFixed(2)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: group.subtotal.sqmDefect > 0 ? '#EF4444' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {group.subtotal.sqmDefect.toFixed(2)}
                      </td>
                      <td colSpan={2} style={{ padding: '8px' }} />
                    </tr>
                  </React.Fragment>
                ))}

                {/* Grand Total Row */}
                <tr style={{ background: 'var(--bg)', borderTop: '2px solid var(--accent)', fontWeight: 800, fontSize: 13 }}>
                  <td colSpan={10} style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--accent)' }}>
                    รวมทั้งสิ้น (Grand Total) :
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>
                    {currentSummary.qtyGood.toFixed(2)}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: currentSummary.qtyDefect > 0 ? '#EF4444' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {currentSummary.qtyDefect.toFixed(2)}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>
                    {currentSummary.sqmGood.toFixed(2)}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: currentSummary.sqmDefect > 0 ? '#EF4444' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {currentSummary.sqmDefect.toFixed(2)}
                  </td>
                  <td colSpan={2} style={{ padding: '12px' }} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
