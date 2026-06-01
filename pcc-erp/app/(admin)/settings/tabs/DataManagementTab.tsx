'use client'

import { useState } from 'react'
import ResetConfirmModal, { type ResetConfig } from '../components/ResetConfirmModal'
import {
  resetPlansAction,
  resetJobOrdersAction,
  resetQcAction,
  resetInventoryAction,
  clearActivityLogsAction,
  resetAllProductionAction,
  nuclearResetAction,
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
