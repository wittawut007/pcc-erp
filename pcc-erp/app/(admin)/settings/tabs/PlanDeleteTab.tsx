'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { searchPlanByPoCode, deleteFullPlanByPlanId, type SearchPlanResult, type DeletePlanResult } from '@/app/actions/plan-delete'

export default function PlanDeleteTab() {
  const [poCode, setPoCode] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [planData, setPlanData] = useState<SearchPlanResult['data'] | null>(null)
  
  // States สำหรับการลบและ Modal ยืนยัน
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [confirmPoInput, setConfirmPoInput] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteResult, setDeleteResult] = useState<DeletePlanResult['summary'] | null>(null)

  // ค้นหาข้อมูลแผนการผลิต
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!poCode.trim()) {
      toast.error('กรุณากรอกรหัส PO Code')
      return
    }

    // ล้างผลลัพธ์เก่าก่อนค้นหาใหม่
    setPlanData(null)
    setDeleteResult(null)
    setIsSearching(true)

    try {
      const res = await searchPlanByPoCode(poCode)
      if (res.success && res.data) {
        setPlanData(res.data)
        toast.success('ค้นหาข้อมูลแผนผลิตเรียบร้อย')
      } else {
        toast.error(res.error || 'เกิดข้อผิดพลาดในการค้นหา')
      }
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาดในการค้นหา')
    } finally {
      setIsSearching(false)
    }
  }

  // ดำเนินการลบแผนทั้งหมด
  const handleDeletePlan = async () => {
    if (!planData) return
    if (confirmPoInput !== planData.orderNumber) {
      toast.error('รหัส PO ยืนยันไม่ถูกต้อง')
      return
    }

    setIsDeleting(true)
    try {
      const res = await deleteFullPlanByPlanId(planData.planId, planData.orderNumber)
      if (res.success && res.summary) {
        setDeleteResult(res.summary)
        setPlanData(null)
        setPoCode('')
        setIsDeleteModalOpen(false)
        setConfirmPoInput('')
        toast.success('ลบแผนการผลิตและหักคลังสินค้าเรียบร้อยแล้ว')
      } else {
        toast.error(res.error || 'เกิดข้อผิดพลาดในการลบแผนการผลิต')
      }
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาดในการลบแผนการผลิต')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleOpenDeleteModal = () => {
    setConfirmPoInput('')
    setIsDeleteModalOpen(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Search Section */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '20px 24px',
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
          ค้นหาแผนการผลิตที่ต้องการลบ
        </h3>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <input
              type="text"
              placeholder="กรอกรหัส PO Code (เช่น PO-20260623-008)"
              value={poCode}
              onChange={(e) => setPoCode(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
                outline: 'none',
                background: 'white',
              }}
              disabled={isSearching || isDeleting}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              * ค้นหาได้เฉพาะรูปแบบ PO Code เท่านั้น เพื่อความปลอดภัยของข้อมูล
            </div>
          </div>
          <button
            type="submit"
            disabled={isSearching || isDeleting}
            style={{
              padding: '9px 20px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: (isSearching || isDeleting) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'opacity 0.15s',
              opacity: (isSearching || isDeleting) ? 0.7 : 1,
            }}
          >
            {isSearching ? (
              <>
                <i className="fas fa-spinner fa-spin" />
                กำลังค้นหา...
              </>
            ) : (
              <>
                <i className="fas fa-search" />
                ค้นหา
              </>
            )}
          </button>
        </form>
      </div>

      {/* Success Deletion Summary Section */}
      {deleteResult && (
        <div style={{
          background: '#ECFDF5',
          border: '1px solid #A7F3D0',
          borderRadius: 'var(--radius)',
          padding: '24px',
          color: '#065F46',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: '#D1FAE5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#047857'
            }}>
              <i className="fas fa-check-circle" style={{ fontSize: 18 }} />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>ลบข้อมูลแผนผลิตสำเร็จ</h3>
          </div>
          <p style={{ fontSize: 13, margin: '0 0 16px 0', lineHeight: 1.5 }}>
            ระบบได้ลบข้อมูลแผนการผลิตและใบสั่งผลิต <strong>{deleteResult.poCode}</strong> ออกจากระบบโดยสมบูรณ์เรียบร้อยแล้ว รวมถึงปรับลดคลังสินค้าสำเร็จรูปตามรายการด้านล่าง
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'white', padding: 16, borderRadius: 10, border: '1px solid #D1FAE5' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', borderBottom: '1px solid #E5E7EB', paddingBottom: 6 }}>
              สรุปรายการที่ถูกลบและปรับปรุง:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, fontSize: 12, color: '#4B5563' }}>
              <div>• Job Orders: <strong>{deleteResult.deletedJobOrders} รายการ</strong></div>
              <div>• คำสั่งผสมคอนกรีต: <strong>{deleteResult.deletedConcreteOrders} รายการ</strong></div>
              <div>• บันทึกตรวจ QC: <strong>{deleteResult.deletedQcInspections} รายการ</strong></div>
              <div>• บันทึกถอดแบบ: <strong>{deleteResult.deletedDemoldingRecords} รายการ</strong></div>
              <div>• ไฟล์ภาพถ่ายที่ลบออกจาก Storage: <strong>{deleteResult.deletedPhotos} ไฟล์</strong></div>
            </div>

            {deleteResult.inventoryAdjusted.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F3F4F6' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', marginBottom: 6 }}>
                  ⚠️ ยอดสต็อกสินค้าสำเร็จรูป (FG Inventory) ที่ปรับลด (หักออก):
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {deleteResult.inventoryAdjusted.map((adj, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#374151', background: '#FEF2F2', padding: '6px 12px', borderRadius: 6 }}>
                      <span>{adj.productName}</span>
                      <strong style={{ color: '#DC2626' }}>-{adj.reducedQty} ชิ้น</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Plan Details and Delete Confirmation Section */}
      {planData && (
        <div style={{
          background: 'white',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            background: 'var(--bg)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                ใบสั่งผลิตและแผนงานที่ตรวจพบ
              </span>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: '2px 0 0 0' }}>
                PO Code: {planData.orderNumber}
              </h3>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{
                padding: '4px 10px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
                background: 'var(--accent-light)',
                color: 'var(--accent)',
              }}>
                แผนวันที่: {new Date(planData.planDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <span style={{
                padding: '4px 10px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
                background: planData.planStatus === 'completed' ? '#D1FAE5' : '#FEF3C7',
                color: planData.planStatus === 'completed' ? '#065F46' : '#D97706',
              }}>
                สถานะแผน: {planData.planStatus === 'completed' ? 'เสร็จสมบูรณ์' : planData.planStatus === 'confirmed' ? 'อนุมัติแล้ว' : 'แบบร่าง'}
              </span>
            </div>
          </div>

          {/* Details Content */}
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* statistics cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 12,
            }}>
              {[
                { label: 'รายการชิ้นงาน', value: planData.planItems.length, icon: 'fa-list-ol', color: 'var(--accent)' },
                { label: 'Job Orders', value: planData.jobOrdersCount, icon: 'fa-tasks', color: 'var(--indigo)' },
                { label: 'ใบสั่งคอนกรีต', value: planData.concreteOrdersCount, icon: 'fa-fill-drip', color: '#0EA5E9' },
                { label: 'บันทึก QC', value: planData.qcInspectionsCount, icon: 'fa-clipboard-check', color: '#10B981' },
                { label: 'รูปภาพที่จะลบ', value: planData.photosCount, icon: 'fa-images', color: '#EC4899' },
              ].map((stat, i) => (
                <div key={i} style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: `${stat.color}15`,
                    color: stat.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <i className={`fas ${stat.icon}`} style={{ fontSize: 14 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                      {stat.value}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {stat.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Target Plan Items */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                รายการสินค้าที่ต้องผลิตในแผนงาน:
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-muted)' }}>เตียง</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-muted)' }}>สินค้า</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>จำนวน</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }}>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planData.planItems.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: idx < planData.planItems.length - 1 ? '1px solid var(--border)' : undefined }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>เตียง {item.bed}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.productName}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.productCode}</div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                          {item.qtyTarget} {item.productUnit}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: item.status === 'demolded' ? '#D1FAE5' : '#E5E7EB',
                            color: item.status === 'demolded' ? '#065F46' : '#4B5563',
                          }}>
                            {item.status === 'demolded' ? 'ถอดแบบแล้ว' : item.status === 'casting' ? 'กำลังผลิต' : 'รอดำเนินการ'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Inventory Reduction Alert */}
            <div style={{
              background: '#FFF5F5',
              border: '1px solid #FEB2B2',
              borderRadius: 10,
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#C53030' }}>
                <i className="fas fa-exclamation-triangle" style={{ fontSize: 14 }} />
                <span style={{ fontSize: 13, fontWeight: 800 }}>ผลกระทบต่อสต็อกสินค้าสำเร็จรูป (FG Inventory)</span>
              </div>
              <p style={{ fontSize: 12, color: '#742A2A', margin: 0, lineHeight: 1.4 }}>
                เนื่องจากแผนการผลิตนี้ได้รับการถอดแบบ / QC เรียบร้อยแล้ว ระบบจะทำการหักลบจำนวนสินค้าออกจากคลังสินค้าสำเร็จรูปตามสถิติการผลิตจริงในแผนงานโดยอัตโนมัติ ดังต่อไปนี้:
              </p>

              {planData.inventoryReductions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                  {planData.inventoryReductions.map((item, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 12,
                      background: 'white',
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid #FEE2E2',
                    }}>
                      <div>
                        <span style={{ fontWeight: 700, color: '#2D3748' }}>{item.productName}</span>
                        <span style={{ fontSize: 10, color: '#718096', marginLeft: 6 }}>({item.productCode})</span>
                      </div>
                      <span style={{ fontWeight: 800, color: '#C53030' }}>หักสต็อกออก -{item.qtyToReduce} ชิ้น</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#718096', fontStyle: 'italic', background: 'white', padding: '8px 12px', borderRadius: 6, border: '1px solid #FEE2E2', textAlign: 'center' }}>
                  ไม่มีสินค้าที่ถอดแบบสำเร็จแล้วในแผนนี้ (จะไม่มีการหักยอดสต็อกสินค้าเพิ่ม)
                </div>
              )}
            </div>

            {/* Warning Message */}
            <div style={{
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: 10,
              padding: '14px 16px',
              fontSize: 12,
              color: '#B45309',
              lineHeight: 1.5,
              display: 'flex',
              gap: 10,
            }}>
              <i className="fas fa-info-circle" style={{ fontSize: 16, marginTop: 2, color: '#D97706' }} />
              <div>
                <strong>การดำเนินการที่ไม่สามารถกู้คืนได้:</strong> การลบจะทำลายข้อมูลประวัติการทำงาน Job Orders, รายงานตรวจ QC, บันทึกการส่งสั่งคอนกรีต, และภาพถ่ายทั้งหมดที่เกี่ยวข้อง รวมถึงไฟล์ในระบบจัดเก็บข้อมูล (Supabase Storage)
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setPlanData(null)}
                style={{
                  padding: '9px 16px',
                  background: 'white',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleOpenDeleteModal}
                style={{
                  padding: '9px 20px',
                  background: '#DC2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <i className="fas fa-trash-alt" />
                ลบแผนการผลิตและใบสั่งผลิตนี้
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Type-to-Confirm) */}
      {isDeleteModalOpen && planData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 16,
        }}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            width: '100%',
            maxWidth: 480,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{
              background: '#FEF2F2',
              padding: '16px 20px',
              borderBottom: '1px solid #FEE2E2',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#DC2626',
            }}>
              <i className="fas fa-exclamation-triangle" style={{ fontSize: 18 }} />
              <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>ยืนยันลบแผนการผลิตอย่างถาวร</h3>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 13, color: '#4B5563', margin: 0, lineHeight: 1.5 }}>
                คุณกำลังจะลบแผนการผลิตและใบสั่งผลิต <strong>{planData.orderNumber}</strong> ข้อมูลการผลิตทั้งหมดที่สร้างขึ้นรวมถึงรูปภาพจะถูกลบอย่างสมบูรณ์ และสต็อก FG จะถูกปรับลดทันที
              </p>
              
              <div style={{
                background: '#F9FAFB',
                padding: '12px 14px',
                borderRadius: 8,
                border: '1px solid #E5E7EB',
                fontSize: 12,
                color: '#374151',
              }}>
                <div style={{ marginBottom: 4 }}><strong>โปรดพิมพ์ PO Code เพื่อยืนยันการดำเนินการ:</strong></div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', letterSpacing: '0.04em', userSelect: 'none' }}>
                  {planData.orderNumber}
                </div>
              </div>

              <input
                type="text"
                placeholder="พิมพ์ PO Code ให้ถูกต้อง"
                value={confirmPoInput}
                onChange={(e) => setConfirmPoInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  border: '1px solid #DC2626',
                  borderRadius: 8,
                  fontSize: 13,
                  outline: 'none',
                  background: 'white',
                  textAlign: 'center',
                  fontWeight: 700,
                  color: '#DC2626',
                }}
                disabled={isDeleting}
              />
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid #F3F4F6',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
              background: '#F9FAFB',
            }}>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
                style={{
                  padding: '8px 14px',
                  background: 'white',
                  border: '1px solid #D1D5DB',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#374151',
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleDeletePlan}
                disabled={isDeleting || confirmPoInput !== planData.orderNumber}
                style={{
                  padding: '8px 18px',
                  background: confirmPoInput === planData.orderNumber ? '#DC2626' : '#FCA5A5',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: (isDeleting || confirmPoInput !== planData.orderNumber) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {isDeleting ? (
                  <>
                    <i className="fas fa-spinner fa-spin" />
                    กำลังลบ...
                  </>
                ) : (
                  <>
                    <i className="fas fa-trash-alt" />
                    ยืนยันลบข้อมูล
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
