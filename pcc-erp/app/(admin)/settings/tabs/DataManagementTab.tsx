'use client'

import { useState, useEffect } from 'react'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import ResetConfirmModal, { type ResetConfig } from '../components/ResetConfirmModal'
import {
  resetPlansAction,
  resetJobOrdersAction,
  resetQcAction,
  resetInventoryAction,
  clearActivityLogsAction,
  resetAllProductionAction,
  nuclearResetAction,
  purgeOldPhotosAction,
} from '@/app/actions/settings'

interface ResetResult {
  success: boolean
  error?: string
  summary?: Record<string, string | number>
}

interface SuccessResult {
  title: string
  summary: Record<string, string | number>
}

export default function DataManagementTab() {
  const [activeModal, setActiveModal] = useState<ResetConfig | null>(null)
  const [successResult, setSuccessResult] = useState<SuccessResult | null>(null)

  // ─── States สำหรับ Storage Backup & Purge ──────────────────────────────────────
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [isCalculating, setIsCalculating] = useState<boolean>(false)
  const [calculatedMeta, setCalculatedMeta] = useState<any>(null)
  const [backupProgress, setBackupProgress] = useState<{ active: boolean; percent: number; text: string }>({
    active: false,
    percent: 0,
    text: ''
  })
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState<boolean>(false)
  const [purgeInput, setPurgeInput] = useState<string>('')
  const [isPurging, setIsPurging] = useState<boolean>(false)
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false)

  // ─── กำหนดค่าช่วงวันที่เริ่มต้นอัตโนมัติ (ย้อนหลัง 3 เดือน ถึง 1 เดือนก่อน) ───────────
  useEffect(() => {
    const today = new Date()
    
    // วันสิ้นสุด (ย้อนหลัง 1 เดือนจากวันนี้)
    const end = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
    const endStr = end.toISOString().split('T')[0]
    setEndDate(endStr)

    // วันเริ่มต้น (ย้อนหลัง 3 เดือนจากวันนี้)
    const start = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate())
    const startStr = start.toISOString().split('T')[0]
    setStartDate(startStr)
  }, [])

  // ─── ฟังก์ชันสำหรับดึงจำนวนรูปภาพและรายละเอียดเพื่อแสดงสถิติ ──────────────────────
  const handleCalculateData = async () => {
    if (!startDate || !endDate) {
      toast.error('กรุณาระบุวันที่เริ่มต้นและสิ้นสุดให้ครบถ้วน')
      return
    }

    if (new Date(startDate) > new Date(endDate)) {
      toast.error('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด')
      return
    }

    setIsCalculating(true)
    setCalculatedMeta(null)
    setDownloadSuccess(false)

    try {
      const res = await fetch(`/api/admin/backup/calculate?startDate=${startDate}&endDate=${endDate}`)
      if (!res.ok) {
        throw new Error('ไม่สามารถเชื่อมต่อ API สำหรับคำนวณข้อมูลได้')
      }
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || 'เกิดข้อผิดพลาดในการคำนวณข้อมูล')
      }

      setCalculatedMeta(data)
      toast.success('คำนวณปริมาณข้อมูลเสร็จสิ้น')
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'เกิดข้อผิดพลาดในการคำนวณข้อมูล')
    } finally {
      setIsCalculating(false)
    }
  }

  // ─── ฟังก์ชันสำหรับดาวน์โหลดไฟล์ ZIP และรูปภาพแบบ Client-side ────────────────────
  const handleDownloadBackup = async () => {
    if (!startDate || !endDate || !calculatedMeta) return
    
    const photos = calculatedMeta.photos || []
    setBackupProgress({ active: true, percent: 5, text: 'กำลังเริ่มการจัดเตรียมไฟล์และดึงข้อมูลจากฐานข้อมูล...' })
    setDownloadSuccess(false)

    try {
      // 1. ดึงข้อมูลดิบการผลิต JSON ทั้งหมด
      setBackupProgress({ active: true, percent: 12, text: 'กำลังดาวน์โหลดข้อมูลการผลิตในระบบ...' })
      const res = await fetch(`/api/admin/backup/export-data?startDate=${startDate}&endDate=${endDate}`)
      
      if (!res.ok) {
        throw new Error('เกิดข้อผิดพลาดในการดาวน์โหลดตารางข้อมูล')
      }
      
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || 'ล้มเหลวในการจัดเตรียมตารางข้อมูล')
      }

      // 2. เริ่มสร้าง ZIP Archive และเขียนตาราง Excel
      setBackupProgress({ active: true, percent: 25, text: 'กำลังประกอบตารางรายงานลงไฟล์ Excel (.xlsx)...' })
      const zip = new JSZip()
      const wb = XLSX.utils.book_new()

      const addSheetToWorkbook = (rawData: any[], sheetName: string) => {
        // กรองคีย์ที่เป็นวัตถุและ nested parameters ออกเพื่อให้ตารางสะอาดอ่านง่าย
        const cleanRows = rawData.map(({ plan_item, worker, qc_profile, requested_by_profile, supplied_by_profile, warehouse_profile, ...rest }) => rest)
        const ws = XLSX.utils.json_to_sheet(cleanRows)
        XLSX.utils.book_append_sheet(wb, ws, sheetName)
      }

      addSheetToWorkbook(data.plans || [], 'Production Plans')
      addSheetToWorkbook(data.planItems || [], 'Production Items')
      addSheetToWorkbook(data.productionOrders || [], 'Production Orders')
      addSheetToWorkbook(data.jobOrders || [], 'Job Orders')
      addSheetToWorkbook(data.demoldingRecords || [], 'Demolding Records')
      addSheetToWorkbook(data.qcInspections || [], 'QC Inspections')
      addSheetToWorkbook(data.concreteOrders || [], 'Concrete Orders')
      addSheetToWorkbook(data.concreteRounds || [], 'Concrete Rounds')
      addSheetToWorkbook(data.fgReceipts || [], 'FG Receipts')

      // เขียน Excel Buffer
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      zip.file('production_data.xlsx', excelBuffer)

      // 3. ทยอยดาวน์โหลดรูปภาพจาก Supabase Storage ทีละไฟล์
      const totalPhotos = photos.length
      const supabase = createClient()

      if (totalPhotos > 0) {
        setBackupProgress({ active: true, percent: 35, text: `กำลังดึงรูปภาพจาก Storage 0/${totalPhotos} ไฟล์...` })

        // ดาวน์โหลดรูปทีละไฟล์แบบวนลูป
        for (let i = 0; i < totalPhotos; i++) {
          const photo = photos[i]
          setBackupProgress({
            active: true,
            percent: 35 + Math.floor((i / totalPhotos) * 55),
            text: `ดาวน์โหลดรูปภาพ (${i + 1}/${totalPhotos}): [${photo.bed}] ${photo.photo_type} ...`
          })

          try {
            // โหลด Blob ตรงจาก storage เพื่อเลี่ยง CORS
            const { data: blob, error } = await supabase.storage
              .from('job_photos')
              .download(photo.storage_path)

            if (error) {
              console.warn(`ล้มเหลวในการดาวน์โหลด: ${photo.storage_path}`, error)
              continue
            }

            if (blob) {
              // จัดเรียงเข้าโฟลเดอร์ตามวันที่แผน และโรงผลิต
              const folderPath = `photos/${photo.plan_date}/${photo.bed}`
              const filename = `${photo.job_order_id}_${photo.photo_type}.jpg`
              zip.file(`${folderPath}/${filename}`, blob)
            }
          } catch (err) {
            console.error('Fetch image blob error:', err)
          }
        }
      }

      // 4. สร้างและดาวน์โหลดไฟล์ ZIP
      setBackupProgress({ active: true, percent: 95, text: 'กำลังบีบอัดเป็นไฟล์ ZIP และดาวน์โหลด...' })
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      
      const fileUrl = URL.createObjectURL(zipBlob)
      const downloadLink = document.createElement('a')
      downloadLink.href = fileUrl
      downloadLink.download = `pcc_erp_backup_${startDate}_to_${endDate}.zip`
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
      URL.revokeObjectURL(fileUrl)

      setBackupProgress({ active: false, percent: 0, text: '' })
      setDownloadSuccess(true)
      toast.success('ดาวน์โหลดไฟล์สำรองสำเร็จเรียบร้อย! 🥳')

    } catch (err: any) {
      console.error(err)
      setBackupProgress({ active: false, percent: 0, text: '' })
      toast.error(err.message || 'เกิดข้อผิดพลาดในขณะสำรองข้อมูล')
    }
  }

  // ─── ฟังก์ชันสำหรับลบไฟล์รูปใน Storage และอัปเดต DB เป็น NULL ───────────────────
  const handlePurgePhotos = async () => {
    const targetCode = `PURGE_PHOTOS_${calculatedMeta?.counts?.total}`
    if (purgeInput !== targetCode) {
      toast.error('รหัสยืนยันไม่ถูกต้อง กรุณาระบุรหัสใหม่อีกครั้ง')
      return
    }

    setIsPurging(true)
    try {
      const res = await purgeOldPhotosAction(startDate, endDate)
      if (res.success) {
        setPurgeConfirmOpen(false)
        setCalculatedMeta(null)
        setDownloadSuccess(false)
        setPurgeInput('')
        
        handleSuccess(
          'ลบรูปภาพใน Storage และเคลียร์ลิงก์เรียบร้อย',
          res.summary || {}
        )
        toast.success('ล้างเนื้อที่เก็บข้อมูลเรียบร้อยแล้ว!')
      } else {
        toast.error(res.error || 'ล้มเหลวในการเคลียร์ข้อมูล')
      }
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'เกิดข้อผิดพลาดในการเคลียร์ข้อมูล')
    } finally {
      setIsPurging(false)
    }
  }

  const handleSuccess = (title: string, summary: Record<string, string | number>) => {
    setActiveModal(null)
    setSuccessResult({ title, summary })
  }

  const resetConfigs: Array<{
    level: 1 | 2 | 3
    title: string
    subtitle: string
    description: string
    confirmText: string
    danger: 'medium' | 'high' | 'critical'
    icon: string
    color: string
    bg: string
    tables: string[]
    action: () => Promise<ResetResult>
  }> = [
    // Level 1
    {
      level: 1,
      title: 'รีเซ็ตแผนการผลิต',
      subtitle: 'ลบแผน + ใบสั่งผลิต + แผนวัตถุดิบ',
      description: 'ลบข้อมูลแผนการผลิต, รายการแผน, ใบสั่งผลิต และแผนจ่ายวัตถุดิบทั้งหมด แต่คงข้อมูล Job Orders, Products และ Raw Materials ไว้',
      confirmText: 'RESET PLANS',
      danger: 'medium',
      icon: 'fa-calendar-times',
      color: 'var(--amber)',
      bg: 'var(--amber-light)',
      tables: ['production_plans', 'production_plan_items', 'production_orders', 'plan_materials'],
      action: resetPlansAction,
    },
    {
      level: 1,
      title: 'รีเซ็ต Job Orders',
      subtitle: 'ลบงานหล่อ + คอนกรีต + ถอดแบบ + QC',
      description: 'ลบข้อมูล Job Orders, คำสั่งผสมคอนกรีต, บันทึกถอดแบบ, QC Inspections และ FG Receipts ทั้งหมด แผนการผลิตและ Master Data ยังคงอยู่',
      confirmText: 'RESET JOBS',
      danger: 'medium',
      icon: 'fa-clipboard-list',
      color: 'var(--amber)',
      bg: 'var(--amber-light)',
      tables: ['job_orders', 'concrete_orders', 'concrete_rounds', 'demolding_records', 'job_order_defects', 'qc_inspections', 'fg_receipts'],
      action: resetJobOrdersAction,
    },
    {
      level: 1,
      title: 'รีเซ็ต QC Inspection',
      subtitle: 'ลบข้อมูลการตรวจสอบ + Defects',
      description: 'ลบข้อมูล QC Inspections และ Job Order Defects ทั้งหมด เหมาะสำหรับล้างข้อมูล QC ระหว่าง Testing โดยไม่กระทบ Job Orders',
      confirmText: 'RESET QC',
      danger: 'medium',
      icon: 'fa-microscope',
      color: 'var(--amber)',
      bg: 'var(--amber-light)',
      tables: ['qc_inspections', 'job_order_defects'],
      action: resetQcAction,
    },
    {
      level: 1,
      title: 'รีเซ็ต Inventory',
      subtitle: 'ตั้งยอดคลัง FG + WIP กลับเป็น 0',
      description: 'Reset ยอดคงเหลือ FG Inventory และ WIP Inventory ให้เป็น 0 โดยไม่ลบ record (ข้อมูล product ยังคงอยู่) เหมาะสำหรับเริ่มนับสต็อกใหม่',
      confirmText: 'RESET INVENTORY',
      danger: 'medium',
      icon: 'fa-cubes',
      color: 'var(--amber)',
      bg: 'var(--amber-light)',
      tables: ['fg_inventory (qty→0)', 'wip_inventory (qty→0)'],
      action: resetInventoryAction,
    },
    {
      level: 1,
      title: 'ล้าง Activity Logs',
      subtitle: 'ลบประวัติการทำงานทั้งหมด',
      description: 'ลบ Activity Logs ทั้งหมดออกจากระบบ ข้อมูลอื่นไม่ได้รับผลกระทบ เหมาะสำหรับล้าง log ก่อนเปิดระบบ production จริง',
      confirmText: 'CLEAR LOGS',
      danger: 'medium',
      icon: 'fa-history',
      color: 'var(--amber)',
      bg: 'var(--amber-light)',
      tables: ['activity_logs'],
      action: clearActivityLogsAction,
    },
    // Level 2
    {
      level: 2,
      title: 'รีเซ็ตข้อมูลการผลิตทั้งหมด',
      subtitle: 'ล้าง Transaction ทั้งหมด — คงไว้ Products + Raw Materials + Users',
      description: 'ลบข้อมูล Transaction ทั้งหมด ได้แก่ แผนการผลิต, ใบสั่งผลิต, Job Orders, QC, คอนกรีต, ถอดแบบ และ FG Receipts พร้อม Reset Inventory เป็น 0 ข้อมูลที่คงไว้: Products, Raw Materials, Profiles',
      confirmText: 'RESET PRODUCTION',
      danger: 'high',
      icon: 'fa-industry',
      color: 'var(--red)',
      bg: 'var(--red-light)',
      tables: ['production_plans', 'production_plan_items', 'production_orders', 'plan_materials', 'job_orders', 'concrete_orders', 'concrete_rounds', 'demolding_records', 'qc_inspections', 'job_order_defects', 'fg_receipts', 'fg_inventory (qty→0)', 'wip_inventory (qty→0)'],
      action: resetAllProductionAction,
    },
    // Level 3
    {
      level: 3,
      title: 'Nuclear Reset',
      subtitle: '⚠️ ล้างทุกอย่างยกเว้น Profiles — ไม่สามารถกู้คืนได้',
      description: 'ลบข้อมูลทั้งหมดในระบบ รวมถึง Raw Materials qty, Activity Logs และข้อมูล Transaction ทั้งหมด เหลือไว้เพียง Profiles (บัญชีผู้ใช้) เพราะผูกกับ Supabase Auth ไม่สามารถกู้คืนได้ — ใช้เฉพาะก่อนเริ่มใช้งานจริงครั้งแรกเท่านั้น',
      confirmText: 'NUCLEAR RESET',
      danger: 'critical',
      icon: 'fa-radiation',
      color: '#DC2626',
      bg: '#FFF1F2',
      tables: ['production_plans', 'production_plan_items', 'production_orders', 'plan_materials', 'job_orders', 'concrete_orders', 'concrete_rounds', 'demolding_records', 'qc_inspections', 'job_order_defects', 'fg_receipts', 'fg_inventory (qty→0)', 'wip_inventory (qty→0)', 'raw_materials (qty→0)', 'activity_logs'],
      action: nuclearResetAction,
    },
  ]

  const level1 = resetConfigs.filter(c => c.level === 1)
  const level2 = resetConfigs.filter(c => c.level === 2)
  const level3 = resetConfigs.filter(c => c.level === 3)

  const openModal = (config: typeof resetConfigs[0]) => {
    setActiveModal({
      id: config.title,
      title: config.title,
      description: config.description,
      confirmText: config.confirmText,
      danger: config.danger,
      tables: config.tables,
      onConfirm: config.action,
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Success Result */}
      {successResult && (
        <div style={{
          padding: '16px 20px',
          background: 'var(--green-light)',
          border: '1px solid #A7F3D0',
          borderRadius: 12,
          animation: 'fadeIn 0.3s ease-out',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-check-circle" style={{ fontSize: 18, color: 'var(--green)' }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: '#065F46' }}>✅ {successResult.title} — สำเร็จ!</div>
            </div>
            <button
              onClick={() => setSuccessResult(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065F46', fontSize: 14 }}
            >✕</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(successResult.summary).map(([k, v]) => (
              <span key={k} style={{
                padding: '3px 10px', background: 'white',
                borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#065F46',
                border: '1px solid #A7F3D0',
              }}>
                {k}: <strong>{v}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ─── 📸 Section: Storage Backup & Purge ────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              padding: '2px 10px',
              background: '#EFF6FF',
              color: '#2563EB',
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 800,
              border: '1px solid #BFDBFE',
            }}>
              สำรองและล้างรูปภาพ
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>แนะนำสำหรับเพิ่มพื้นที่จัดเก็บ</span>
          </div>
          <i className="fas fa-hdd" style={{ fontSize: 16, color: '#2563EB' }} />
        </div>
        
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            สำรองตารางข้อมูลการผลิตเป็นไฟล์ Excel และรวบรวมไฟล์รูปภาพทั้งหมดในช่วงเวลาที่ระบุดาวน์โหลดลงเครื่องคอมพิวเตอร์ของคุณเป็นไฟล์ ZIP 
            และกดยืนยันเคลียร์รูปภาพเพื่อลบไฟล์ออกจาก Supabase Storage และตั้งลิงก์ในฐานข้อมูลเป็น NULL ช่วยประหยัดพื้นที่จัดเก็บข้อมูลให้ไม่เต็มลิมิต
          </div>

          {/* Form เลือกช่วงวันที่ */}
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap',
            gap: 16, 
            alignItems: 'flex-end', 
            background: 'rgba(0, 0, 0, 0.02)', 
            padding: 16, 
            borderRadius: 8, 
            border: '1px solid var(--border)' 
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 200px' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>วันที่เริ่มต้น (Start Date)</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setCalculatedMeta(null)
                  setDownloadSuccess(false)
                }}
                style={{
                  width: '100%',
                  padding: '7px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                  outline: 'none',
                  color: 'var(--text-primary)',
                  background: 'white',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 200px' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>วันที่สิ้นสุด (End Date)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setCalculatedMeta(null)
                  setDownloadSuccess(false)
                }}
                style={{
                  width: '100%',
                  padding: '7px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                  outline: 'none',
                  color: 'var(--text-primary)',
                  background: 'white',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              onClick={handleCalculateData}
              disabled={isCalculating || backupProgress.active || !startDate || !endDate}
              style={{
                padding: '9px 20px',
                background: '#2563EB',
                color: 'white',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s',
                opacity: (isCalculating || backupProgress.active || !startDate || !endDate) ? 0.5 : 1,
                pointerEvents: (isCalculating || backupProgress.active || !startDate || !endDate) ? 'none' : 'auto',
              }}
            >
              {isCalculating ? (
                <>
                  <i className="fas fa-spinner fa-spin" />
                  กำลังคำนวณ...
                </>
              ) : (
                <>
                  <i className="fas fa-calculator" />
                  คำนวณจำนวนไฟล์
                </>
              )}
            </button>
          </div>

          {/* แสดงผลการคำนวณ */}
          {calculatedMeta && (
            <div style={{
              border: '1px solid #BFDBFE',
              background: '#F0F9FF',
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#1E3A8A', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fas fa-chart-pie" />
                สรุปข้อมูลที่สำรองได้ในช่วงเวลาที่เลือก
              </div>
              
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
              }}>
                {[
                  { label: 'เตรียมแบบ', count: calculatedMeta.counts.ready },
                  { label: 'หล่อปูน', count: calculatedMeta.counts.cast },
                  { label: 'ถอดแบบ', count: calculatedMeta.counts.demold },
                  { label: 'ภาพตรวจ QC', count: calculatedMeta.counts.qc },
                  { label: 'ขนาดโดยประมาณ', count: `${calculatedMeta.estimatedSizeMB} MB`, isHighlight: true }
                ].map((item, idx) => (
                  <div 
                    key={idx} 
                    style={{
                      background: 'white',
                      border: '1px solid #E5E7EB',
                      borderRadius: 8,
                      padding: '10px 14px',
                      flex: '1 1 120px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.label}</div>
                    <div style={{ 
                      fontSize: 16, 
                      fontWeight: 900, 
                      color: item.isHighlight ? '#16A34A' : '#1E293B',
                      marginTop: 4 
                    }}>{item.count}</div>
                  </div>
                ))}
              </div>

              {/* ปุ่มการกระทำ */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
                <button
                  onClick={handleDownloadBackup}
                  disabled={backupProgress.active || calculatedMeta.counts.total === 0}
                  style={{
                    flex: '1 1 200px',
                    padding: '10px 20px',
                    background: '#16A34A',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all 0.15s',
                    opacity: (backupProgress.active || calculatedMeta.counts.total === 0) ? 0.5 : 1,
                    pointerEvents: (backupProgress.active || calculatedMeta.counts.total === 0) ? 'none' : 'auto',
                  }}
                >
                  <i className="fas fa-download" />
                  ดาวน์โหลดไฟล์ Backup (ZIP)
                </button>

                <button
                  onClick={() => setPurgeConfirmOpen(true)}
                  disabled={!downloadSuccess || isPurging || calculatedMeta.counts.total === 0}
                  style={{
                    padding: '10px 20px',
                    background: '#FEF2F2',
                    color: '#DC2626',
                    border: '1px solid #FECACA',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all 0.15s',
                    opacity: (!downloadSuccess || isPurging || calculatedMeta.counts.total === 0) ? 0.5 : 1,
                    pointerEvents: (!downloadSuccess || isPurging || calculatedMeta.counts.total === 0) ? 'none' : 'auto',
                  }}
                >
                  <i className="fas fa-trash-alt" />
                  เคลียร์ไฟล์ใน Storage
                </button>
              </div>
            </div>
          )}

          {/* แถบ Progress ดาวน์โหลด */}
          {backupProgress.active && (
            <div style={{
              background: 'rgba(0, 0, 0, 0.02)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{backupProgress.text}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#2563EB' }}>{backupProgress.percent}%</span>
              </div>
              <div style={{ width: '100%', height: 8, background: '#E5E7EB', borderRadius: 99, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${backupProgress.percent}%`,
                    background: '#2563EB',
                    borderRadius: 99,
                    transition: 'width 0.3s ease-in-out',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Warning Banner */}
      <div style={{
        padding: '14px 18px',
        background: '#FEF2F2',
        border: '2px solid #FECACA',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}>
        <i className="fas fa-shield-alt" style={{ fontSize: 20, color: '#DC2626', marginTop: 1, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', marginBottom: 4 }}>
            ⚠️ DANGER ZONE — เขตความเสี่ยงสูง
          </div>
          <div style={{ fontSize: 12, color: '#7F1D1D', lineHeight: 1.6 }}>
            การดำเนินการในหน้านี้จะ<strong>ลบข้อมูลจริงออกจากฐานข้อมูล</strong>ทันที โดยไม่สามารถกู้คืนได้
            กรุณาตรวจสอบให้แน่ใจว่าได้สำรองข้อมูลแล้ว หรืออยู่ในสภาวะที่พร้อม Reset จริงๆ
            ทุกการกระทำจะถูกบันทึกใน Activity Log
          </div>
        </div>
      </div>

      {/* Level 1 */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{
            padding: '2px 10px',
            background: 'var(--amber-light)',
            color: 'var(--amber)',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 800,
          }}>
            ระดับ 1 — เลือกล้างเฉพาะส่วน
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ความเสี่ยงปานกลาง</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {level1.map((config, i) => (
            <div
              key={config.title}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 20px',
                borderBottom: i < level1.length - 1 ? '1px solid var(--border)' : undefined,
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: config.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <i className={`fas ${config.icon}`} style={{ fontSize: 16, color: config.color }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{config.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{config.subtitle}</div>
              </div>
              <button
                onClick={() => openModal(config)}
                style={{
                  padding: '7px 16px',
                  border: '1px solid #FDE68A',
                  borderRadius: 8,
                  background: 'var(--amber-light)',
                  color: '#B45309',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <i className="fas fa-redo-alt" />
                รีเซ็ต
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Level 2 */}
      <div style={{
        background: 'var(--surface)',
        border: '2px solid #FECACA',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid #FECACA',
          background: '#FEF2F2',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{
            padding: '2px 10px',
            background: 'var(--red-light)',
            color: 'var(--red)',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 800,
            border: '1px solid #FECACA',
          }}>
            ระดับ 2 — Full Production Reset
          </span>
          <span style={{ fontSize: 11, color: '#B91C1C' }}>ความเสี่ยงสูง</span>
        </div>
        {level2.map((config) => (
          <div key={config.title} style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: '#FEF2F2',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <i className={`fas ${config.icon}`} style={{ fontSize: 18, color: 'var(--red)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#DC2626' }}>{config.title}</div>
                <div style={{ fontSize: 12, color: '#7F1D1D', marginTop: 3, lineHeight: 1.5 }}>{config.description}</div>
                <button
                  onClick={() => openModal(config)}
                  style={{
                    marginTop: 12,
                    padding: '9px 20px',
                    border: '1px solid #FECACA',
                    borderRadius: 8,
                    background: 'var(--red-light)',
                    color: '#DC2626',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                  }}
                >
                  <i className="fas fa-exclamation-triangle" />
                  รีเซ็ตการผลิตทั้งหมด
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Level 3 - Nuclear */}
      <div style={{
        background: '#0F0F1A',
        border: '2px solid #DC2626',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid #3F0000',
          background: '#1A0000',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <i className="fas fa-radiation" style={{ fontSize: 14, color: '#EF4444' }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            ระดับ 3 — Nuclear Reset — อันตรายสูงสุด
          </span>
        </div>
        {level3.map((config) => (
          <div key={config.title} style={{ padding: '20px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{
                width: 50, height: 50, borderRadius: 14,
                background: '#3F0000',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <i className="fas fa-radiation" style={{ fontSize: 22, color: '#EF4444' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#EF4444', marginBottom: 4 }}>
                  {config.title}
                </div>
                <div style={{ fontSize: 12, color: '#FCA5A5', lineHeight: 1.6, marginBottom: 12 }}>
                  {config.description}
                </div>
                <div style={{
                  padding: '10px 14px',
                  background: '#1A0000',
                  borderRadius: 8,
                  border: '1px solid #3F0000',
                  fontSize: 11,
                  color: '#FCA5A5',
                  marginBottom: 14,
                }}>
                  <i className="fas fa-lock" style={{ marginRight: 6 }} />
                  ต้องพิมพ์ <code style={{ color: '#EF4444', fontWeight: 800 }}>NUCLEAR RESET</code> เพื่อยืนยัน
                </div>
                <button
                  onClick={() => openModal(config)}
                  style={{
                    padding: '10px 24px',
                    border: '1px solid #DC2626',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #7F0000 0%, #DC2626 100%)',
                    color: 'white',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <i className="fas fa-radiation" />
                  เริ่ม Nuclear Reset
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal ยืนยันการเคลียร์ข้อมูล Storage */}
      {purgeConfirmOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          backdropFilter: 'blur(2px)',
        }}>
          <div style={{
            background: 'white',
            borderRadius: 16,
            border: '1px solid var(--border)',
            maxWidth: 400,
            width: '100%',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
          }}>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: '#FEF2F2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
                fontSize: 18,
              }}>
                <i className="fas fa-exclamation-triangle" />
              </div>
              
              <div style={{
                fontSize: 14,
                fontWeight: 800,
                color: 'var(--text-primary)',
                textAlign: 'center'
              }}>
                ยืนยันการเคลียร์รูปภาพใน Storage?
              </div>
              
              <p style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                textAlign: 'center',
                lineHeight: 1.6,
                margin: 0,
              }}>
                การดำเนินการนี้จะ <strong>ลบรูปภาพจริงทั้งหมด</strong> ในช่วงวันที่ที่กำหนดออกจาก Supabase Storage 
                และตั้งลิงก์ในฐานข้อมูลเป็น NULL ข้อมูลการผลิตจะยังคงอยู่ครบถ้วน 
                กรุณาตรวจสอบให้แน่ใจว่าคุณได้ดาวน์โหลดและตรวจเช็คไฟล์ ZIP เรียบร้อยแล้ว
              </p>

              <div style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 8,
                padding: 12,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  กรุณาพิมพ์ข้อความเพื่อยืนยัน
                </div>
                <code style={{ fontSize: 13, fontWeight: 900, color: '#B91C1C', userSelect: 'all', display: 'block', marginTop: 4 }}>
                  PURGE_PHOTOS_{calculatedMeta?.counts?.total}
                </code>
              </div>

              <input
                type="text"
                value={purgeInput}
                onChange={(e) => setPurgeInput(e.target.value)}
                placeholder="พิมพ์รหัสยืนยันเพื่อลบ..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 13,
                  outline: 'none',
                  textAlign: 'center',
                  boxSizing: 'border-box',
                }}
              />

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setPurgeConfirmOpen(false)}
                  disabled={isPurging}
                  style={{
                    flex: 1,
                    padding: '8px 16px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'white',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handlePurgePhotos}
                  disabled={isPurging || purgeInput !== `PURGE_PHOTOS_${calculatedMeta?.counts?.total}`}
                  style={{
                    flex: 2,
                    padding: '8px 16px',
                    background: '#DC2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity: (isPurging || purgeInput !== `PURGE_PHOTOS_${calculatedMeta?.counts?.total}`) ? 0.5 : 1,
                    pointerEvents: (isPurging || purgeInput !== `PURGE_PHOTOS_${calculatedMeta?.counts?.total}`) ? 'none' : 'auto',
                  }}
                >
                  {isPurging ? (
                    <>
                      <i className="fas fa-spinner fa-spin" />
                      กำลังลบ...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-trash" />
                      เคลียร์ Storage
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {activeModal && (
        <ResetConfirmModal
          config={activeModal}
          onClose={() => setActiveModal(null)}
          onSuccess={(summary) => handleSuccess(activeModal.title, summary)}
        />
      )}
    </div>
  )
}
