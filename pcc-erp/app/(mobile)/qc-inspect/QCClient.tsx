'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'
import { startCuring, recordDemoldInspection, fastForwardCuring } from '@/app/actions/qc'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/utils/compress-image'

const DEFECT_REASONS = [
  { value: 'crack', label: 'แตก/ร้าว' },
  { value: 'chip', label: 'บิ่น/มุมหัก' },
  { value: 'honeycomb', label: 'รอยโพรง (Honeycomb)' },
  { value: 'other', label: 'อื่นๆ' },
]

export default function QCClient({ initialData, qcName, avatarUrl }: { initialData: any[], qcName: string, avatarUrl?: string | null }) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'casting' | 'demolding' | 'history'>('casting')
  const [jobs, setJobs] = useState(initialData)
  const [now, setNow] = useState(new Date())


  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  
  // Forms State
  const [photos, setPhotos] = useState<Record<string, { file: File, preview: string }>>({})
  const [demoldingData, setDemoldingData] = useState<Record<string, {
    good: number;
    defects: { reason: 'crack' | 'chip' | 'honeycomb' | 'other' | ''; qty: number }[];
  }>>({})
  const [saving, setSaving] = useState(false)

  // Timer for curing countdown
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Sync data
  useEffect(() => {
    setJobs(initialData)
  }, [initialData])

  const castingJobs = jobs.filter(j => j.status === 'concrete_ordered')
  const demoldingJobs = jobs.filter(j => ['curing', 'ready_demold'].includes(j.status))

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>, key: string) => {
    const file = e.target.files?.[0]
    if (file) {
      const preview = URL.createObjectURL(file)
      setPhotos(prev => ({ ...prev, [key]: { file, preview } }))
    }
  }

  const removePhoto = (key: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setPhotos(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const uploadPhoto = async (file: File, folder: string): Promise<string> => {
    const supabase = createClient()
    const compressed = await compressImage(file, 1280, 0.75)
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2)}.jpg`
    const { error } = await supabase.storage
      .from('job_photos')
      .upload(fileName, compressed, { contentType: 'image/jpeg' })
    if (error) throw error
    const { data: publicUrlData } = supabase.storage.from('job_photos').getPublicUrl(fileName)
    return publicUrlData.publicUrl
  }

  const handleStartCuring = async (jobId: string) => {
    const photo = photos[`casting-${jobId}`]
    if (!photo) {
      toast.error('กรุณาถ่ายภาพยืนยันก่อนเริ่มบ่ม')
      return
    }
    setSaving(true)
    try {
      const photoUrl = await uploadPhoto(photo.file, 'casting')
      await startCuring(jobId, photoUrl)
      setExpandedJobId(null)
      // Optimistic update
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'curing', cast_at: new Date().toISOString() } : j))
      setPhotos(p => { const newP = {...p}; delete newP[`casting-${jobId}`]; return newP; })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDemoldingAdjust = (jobId: string, field: 'good', change: number, target: number) => {
    setDemoldingData(prev => {
      const current = prev[jobId] || { good: 0, defects: [] }
      const totalDefects = (current.defects || []).reduce((s, d) => s + d.qty, 0)
      const maxGood = target - totalDefects

      let newGood = current.good
      if (change > 0 && current.good + totalDefects >= target) {
        return prev;
      }

      newGood = Math.max(0, Math.min(maxGood, newGood + change))
      return { ...prev, [jobId]: { ...current, good: newGood } }
    })
  }

  const handleDemoldingDirectSet = (jobId: string, val: number, target: number) => {
    setDemoldingData(prev => {
      const current = prev[jobId] || { good: 0, defects: [] }
      const totalDefects = (current.defects || []).reduce((s, d) => s + d.qty, 0)
      const maxGood = target - totalDefects
      const newGood = Math.max(0, Math.min(maxGood, val))
      return { ...prev, [jobId]: { ...current, good: newGood } }
    })
  }

  const handleAddDefectReason = (jobId: string) => {
    setDemoldingData(prev => {
      const current = prev[jobId] || { good: 0, defects: [] }
      const newDefects = [...(current.defects || [])]
      const totalDefects = newDefects.reduce((s, d) => s + d.qty, 0)
      
      const job = jobs.find(j => j.id === jobId)
      const target = job?.qty_target || 0
      
      if (current.good + totalDefects >= target) {
        toast.error('จำนวนสินค้าถึงเป้าหมายแล้ว')
        return prev
      }

      newDefects.push({ reason: '', qty: 1 })
      return { ...prev, [jobId]: { ...current, defects: newDefects } }
    })
  }

  const handleUpdateDefectReason = (jobId: string, index: number, reason: 'crack' | 'chip' | 'honeycomb' | 'other' | '') => {
    setDemoldingData(prev => {
      const current = prev[jobId] || { good: 0, defects: [] }
      const newDefects = [...(current.defects || [])]
      if (newDefects[index]) {
        newDefects[index] = { ...newDefects[index], reason }
      }
      return { ...prev, [jobId]: { ...current, defects: newDefects } }
    })
  }

  const handleUpdateDefectQty = (jobId: string, index: number, change: number, target: number) => {
    setDemoldingData(prev => {
      const current = prev[jobId] || { good: 0, defects: [] }
      const newDefects = [...(current.defects || [])]
      const item = newDefects[index]
      if (!item) return prev

      const totalDefectsBefore = newDefects.reduce((s, d) => s + d.qty, 0)
      const currentItemQty = item.qty
      const newQty = Math.max(1, currentItemQty + change)
      const qtyDiff = newQty - currentItemQty

      if (qtyDiff > 0 && current.good + totalDefectsBefore + qtyDiff > target) {
        toast.error('จำนวนสินค้าเกินเป้าหมาย')
        return prev
      }

      newDefects[index] = { ...item, qty: newQty }
      return { ...prev, [jobId]: { ...current, defects: newDefects } }
    })
  }

  const handleRemoveDefectReason = (jobId: string, index: number) => {
    setDemoldingData(prev => {
      const current = prev[jobId] || { good: 0, defects: [] }
      const newDefects = (current.defects || []).filter((_, i) => i !== index)
      return { ...prev, [jobId]: { ...current, defects: newDefects } }
    })
  }

  const handleDemoldSubmit = async (jobId: string, target: number) => {
    const data = demoldingData[jobId] || { good: 0, defects: [] }
    const totalDefects = (data.defects || []).reduce((s, d) => s + d.qty, 0)
    
    if (data.good + totalDefects === 0) {
      toast.error('กรุณาระบุยอดงานดีหรืองานเสีย')
      return
    }
    
    const hasEmptyReason = (data.defects || []).some(d => !d.reason)
    if (totalDefects > 0 && hasEmptyReason) {
      toast.error('กรุณาระบุสาเหตุของเสียให้ครบถ้วน')
      return
    }

    const photo = photos[`demold-${jobId}`]
    if (!photo) {
      toast.error('กรุณาถ่ายภาพยืนยันการถอดแบบ')
      return
    }
    
    setSaving(true)
    try {
      const photoUrl = await uploadPhoto(photo.file, 'demolding')
      
      const breakdown = (data.defects || []).map(d => ({
        reason: d.reason as string,
        qty: d.qty
      }))

      await recordDemoldInspection(
        jobId, 
        data.good, 
        totalDefects, 
        breakdown[0]?.reason || undefined, 
        undefined, 
        photoUrl, 
        breakdown
      )
      
      setExpandedJobId(null)
      setJobs(prev => prev.filter(j => j.id !== jobId))
      setPhotos(p => { const newP = {...p}; delete newP[`demold-${jobId}`]; return newP; })
      setDemoldingData(p => { const newP = {...p}; delete newP[jobId]; return newP; })
      toast.success('บันทึกผลการตรวจสอบสำเร็จ')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleFastForward = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSaving(true)
    try {
      await fastForwardCuring(jobId)
      toast.success('เร่งเวลาสำเร็จ')
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, cast_at: new Date(Date.now() - 21 * 60 * 60 * 1000).toISOString() } : j))
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const getCuringTimeLeft = (castAt: string) => {
    const castDate = new Date(castAt)
    const expected = new Date(castDate.getTime() + 20 * 60 * 60 * 1000)
    const diff = expected.getTime() - now.getTime()
    if (diff <= 0) return { ready: true, text: 'พร้อมถอดแบบ' }
    
    const h = Math.floor(diff / (1000 * 60 * 60))
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return { ready: false, text: `เหลือ ${h} ชม. ${m} นาที` }
  }

  return (
    <div className="flex-1 w-full h-[100dvh] flex flex-col relative overflow-hidden text-[13px] text-erp-text-primary" 
      style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)' }}>
      <Toaster position="top-center" toastOptions={{ style: { borderRadius: '16px', fontWeight: 600, fontSize: '14px', padding: '16px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' } }} />

      {/* App Header — Fixed */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        padding: '20px 20px 16px',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
      }}>
        {/* Logo */}
        <div
          onClick={() => router.push('/')}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
        >
          <div style={{
            width: '36px', height: '36px',
            backgroundColor: '#2563EB',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
            overflow: 'hidden',
          }}>
            <img
              src="/logo.png"
              alt="PCC Logo"
              width={24}
              height={24}
              style={{ objectFit: 'contain' }}
            />
          </div>
          <span style={{ fontWeight: 900, fontSize: '16px', color: '#1E3A8A', letterSpacing: '-0.3px' }}>
            PCC<span style={{ color: '#3B82F6' }}>ERP</span>
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* User Pill & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            background: 'rgba(255,255,255,0.55)',
            borderRadius: '99px',
            border: '1px solid rgba(255,255,255,0.7)',
            padding: '5px 14px 5px 5px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            <div style={{
              width: '38px', height: '38px',
              borderRadius: '99px',
              overflow: 'hidden',
              border: '2px solid #ffffff',
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
              flexShrink: 0,
            }}>
               <img
                 src={avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(qcName)}&background=2563EB&color=fff`}
                alt="Profile"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: '13px', color: '#1E293B', lineHeight: '1.2' }}>
                {qcName}
              </div>
              <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 700, letterSpacing: '0.04em', marginTop: '1px' }}>
                พนักงาน QC
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', paddingTop: '100px', paddingBottom: '100px' }}>
        
        {/* CASTING TAB */}
        {activeTab === 'casting' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: 0 }}>งานรอเทคอนกรีต</h2>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0' }}>รับคอนกรีตครบแล้ว รอถ่ายภาพและเริ่มบ่ม</p>
              </div>
              <span style={{ backgroundColor: '#DBEAFE', color: '#1E40AF', padding: '4px 10px', borderRadius: '99px', fontSize: '12px', fontWeight: 800 }}>
                {castingJobs.length} งาน
              </span>
            </div>

            {castingJobs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', backgroundColor: '#ffffff', borderRadius: '24px', border: '1px dashed #CBD5E1', marginTop: '20px' }}>
                <div style={{ width: '64px', height: '64px', backgroundColor: '#F1F5F9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <i className="fas fa-check-circle" style={{ fontSize: '28px', color: '#94A3B8' }}></i>
                </div>
                <p style={{ fontSize: '15px', fontWeight: 800, color: '#475569', margin: '0 0 4px' }}>ไม่มีงานรอเทคอนกรีต</p>
                <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>ตรวจสอบงานถอดแบบในแถบถัดไป</p>
              </div>
            ) : (
              castingJobs.map(job => (
                <div key={job.id} 
                  onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                  style={{ 
                    backgroundColor: '#ffffff', borderRadius: '20px', padding: '20px', 
                    boxShadow: expandedJobId === job.id ? '0 10px 25px -5px rgba(0,0,0,0.1)' : '0 4px 6px -1px rgba(0,0,0,0.05)', 
                    border: expandedJobId === job.id ? '2px solid #3B82F6' : '1px solid #E2E8F0',
                    transition: 'all 0.2s', cursor: 'pointer'
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>โรงผลิต {job.plan_item?.bed || job.bed}</span>
                      <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '4px 0', lineHeight: 1.3, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                        {job.plan_item?.product?.name}
                        {job.plan_item?.product?.size && <span style={{ fontSize: '12px', fontWeight: 700, color: '#3B82F6', backgroundColor: '#EFF6FF', padding: '2px 8px', borderRadius: '6px', border: '1px solid #BFDBFE' }}>{job.plan_item?.product?.size}</span>}
                      </h3>
                      <p style={{ fontSize: '12px', color: '#64748B', margin: 0, fontWeight: 500 }}>เป้าหมาย: <span style={{ color: '#0F172A', fontWeight: 800 }}>{job.qty_target} {job.plan_item?.product?.unit || 'ชิ้น'}</span></p>
                    </div>
                    <span style={{ backgroundColor: '#FEF3C7', color: '#D97706', padding: '6px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 800, border: '1px solid #FDE68A' }}>
                      รอเทคอนกรีต
                    </span>
                  </div>

                  {expandedJobId === job.id && (
                    <div style={{ marginTop: '20px', borderTop: '1px solid #F1F5F9', paddingTop: '20px' }} onClick={e => e.stopPropagation()}>
                      <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#475569', marginBottom: '12px' }}>ถ่ายภาพยืนยันการเท <span style={{ color: '#EF4444' }}>*</span></h4>
                      <div style={{ backgroundColor: '#F8FAFC', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '10px', position: 'relative', marginBottom: '16px' }}>
                        {!photos[`casting-${job.id}`] && <input type="file" accept="image/*" capture="environment" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 }} onChange={e => handlePhotoSelect(e, `casting-${job.id}`)} />}
                        <div style={{ 
                          width: '100%', height: '120px', borderRadius: '12px', border: photos[`casting-${job.id}`] ? 'none' : '2px dashed #CBD5E1', 
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                          color: '#94A3B8', position: 'relative', overflow: 'hidden'
                        }}>
                          {photos[`casting-${job.id}`] ? (
                            <>
                              <img src={photos[`casting-${job.id}`].preview} alt="preview" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                              <button onClick={(e) => removePhoto(`casting-${job.id}`, e)} 
                                style={{ width: '36px', height: '36px', backgroundColor: 'rgba(239, 68, 68, 0.9)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', top: '8px', right: '8px', border: 'none', cursor: 'pointer', zIndex: 20 }}>
                                <i className="fas fa-trash" style={{ color: '#ffffff', fontSize: '14px' }}></i>
                              </button>
                            </>
                          ) : (
                            <><i className="fas fa-camera" style={{ fontSize: '28px', marginBottom: '8px' }}></i><span style={{ fontSize: '11px', fontWeight: 800 }}>แตะเพื่อถ่ายภาพหน้างาน</span></>
                          )}
                        </div>
                      </div>

                      <button disabled={!photos[`casting-${job.id}`] || saving} onClick={() => handleStartCuring(job.id)} 
                        style={{ 
                          width: '100%', padding: '16px', borderRadius: '16px', fontWeight: 900, fontSize: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                          backgroundColor: photos[`casting-${job.id}`] ? '#3B82F6' : '#E2E8F0',
                          color: photos[`casting-${job.id}`] ? '#ffffff' : '#94A3B8',
                          border: 'none', cursor: photos[`casting-${job.id}`] ? 'pointer' : 'not-allowed',
                          boxShadow: photos[`casting-${job.id}`] ? '0 10px 20px -5px rgba(59,130,246,0.4)' : 'none',
                        }}>
                        {saving ? <i className="fas fa-spinner fa-spin" style={{ fontSize: '20px' }}></i> : <><i className="fas fa-play" style={{ fontSize: '14px' }}></i> ยืนยันการบ่มคอนกรีต</>}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* DEMOLDING TAB */}
        {activeTab === 'demolding' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: 0 }}>งานรอถอดแบบ (QC)</h2>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0' }}>งานที่เทคอนกรีตและกำลังบ่ม</p>
              </div>
              <span style={{ backgroundColor: '#F0FDF4', color: '#16A34A', padding: '4px 10px', borderRadius: '99px', fontSize: '12px', fontWeight: 800 }}>
                {demoldingJobs.length} งาน
              </span>
            </div>

            {demoldingJobs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', backgroundColor: '#ffffff', borderRadius: '24px', border: '1px dashed #CBD5E1', marginTop: '20px' }}>
                <div style={{ width: '64px', height: '64px', backgroundColor: '#F1F5F9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <i className="fas fa-box-open" style={{ fontSize: '28px', color: '#94A3B8' }}></i>
                </div>
                <p style={{ fontSize: '15px', fontWeight: 800, color: '#475569', margin: '0 0 4px' }}>ไม่มีงานรอถอดแบบ</p>
              </div>
            ) : (
              demoldingJobs.map(job => {
                const timer = job.cast_at ? getCuringTimeLeft(job.cast_at) : { ready: true, text: 'พร้อมถอดแบบ' };
                const entry = demoldingData[job.id] || { good: 0, defects: [] };
                const isExpanded = expandedJobId === job.id;
                const totalDefect = (entry.defects || []).reduce((s, d) => s + d.qty, 0);
                const isMaxedOut = entry.good + totalDefect >= job.qty_target;

                return (
                  <div key={job.id} 
                    onClick={() => { if (timer.ready) setExpandedJobId(isExpanded ? null : job.id) }}
                    style={{ 
                      backgroundColor: '#ffffff', borderRadius: '20px', padding: '20px', 
                      boxShadow: isExpanded ? '0 10px 25px -5px rgba(0,0,0,0.1)' : '0 4px 6px -1px rgba(0,0,0,0.05)', 
                      border: isExpanded ? '2px solid #10B981' : '1px solid #E2E8F0',
                      transition: 'all 0.2s', cursor: timer.ready ? 'pointer' : 'default',
                      opacity: timer.ready ? 1 : 0.8
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>โรงผลิต {job.plan_item?.bed || job.bed}</span>
                        <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '4px 0', lineHeight: 1.3, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                          {job.plan_item?.product?.name}
                          {job.plan_item?.product?.size && <span style={{ fontSize: '12px', fontWeight: 700, color: '#3B82F6', backgroundColor: '#EFF6FF', padding: '2px 8px', borderRadius: '6px', border: '1px solid #BFDBFE' }}>{job.plan_item?.product?.size}</span>}
                        </h3>
                        <p style={{ fontSize: '12px', color: '#64748B', margin: 0, fontWeight: 500 }}>เป้าหมาย: <span style={{ color: '#0F172A', fontWeight: 800 }}>{job.qty_target} {job.plan_item?.product?.unit || 'ชิ้น'}</span></p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        {timer.ready ? (
                          <span style={{ backgroundColor: '#D1FAE5', color: '#047857', padding: '6px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 800, border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <i className="fas fa-check-circle"></i> พร้อมถอดแบบ
                          </span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button onClick={(e) => handleFastForward(job.id, e)} style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', padding: '6px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 800, color: '#475569', cursor: 'pointer', zIndex: 10 }}>
                              <i className="fas fa-forward"></i> เร่งเวลา
                            </button>
                            <span style={{ backgroundColor: '#FEF3C7', color: '#D97706', padding: '6px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 800, border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <i className="fas fa-clock"></i> {timer.text}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {isExpanded && timer.ready && (
                      <div style={{ marginTop: '20px', borderTop: '1px solid #F1F5F9', paddingTop: '20px' }} onClick={e => e.stopPropagation()}>
                        
                        {/* Good Counter */}
                        <div style={{ backgroundColor: '#F0FDF4', borderRadius: '16px', padding: '16px', border: '1px solid rgba(16, 185, 129, 0.2)', marginBottom: '16px' }}>
                          <label style={{ fontWeight: 900, color: '#047857', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                            <i className="fas fa-check-circle" style={{ fontSize: '16px' }}></i> ยอดงานดี (QC PASS)
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', borderRadius: '12px', padding: '8px', border: '1px solid #A7F3D0' }}>
                            <button type="button" onClick={() => handleDemoldingAdjust(job.id, 'good', -1, job.qty_target)} style={{ width: '48px', height: '48px', backgroundColor: '#F0FDF4', borderRadius: '10px', color: '#059669', fontSize: '20px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fas fa-minus"></i></button>
                            <input 
                              type="number" 
                              value={entry.good} 
                              onChange={(e) => handleDemoldingDirectSet(job.id, parseInt(e.target.value) || 0, job.qty_target)}
                              style={{ width: '80px', backgroundColor: 'transparent', textAlign: 'center', fontSize: '36px', fontWeight: 900, color: '#065F46', outline: 'none', border: 'none' }} 
                            />
                            <button type="button" disabled={isMaxedOut} onClick={() => handleDemoldingAdjust(job.id, 'good', 1, job.qty_target)} style={{ width: '48px', height: '48px', backgroundColor: '#F0FDF4', borderRadius: '10px', color: isMaxedOut ? '#A7F3D0' : '#059669', fontSize: '20px', border: 'none', cursor: isMaxedOut ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fas fa-plus"></i></button>
                          </div>
                          
                          {/* Fast Counter Buttons */}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <button 
                              type="button" 
                              disabled={isMaxedOut} 
                              onClick={() => handleDemoldingAdjust(job.id, 'good', 25, job.qty_target)} 
                              style={{ 
                                flex: 1, padding: '10px', borderRadius: '10px', background: '#DCFCE7', color: '#15803d', 
                                border: '1px solid #bbf7d0', fontWeight: 'bold', fontSize: '13px', cursor: isMaxedOut ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s' 
                              }}
                            >
                              +25
                            </button>
                            <button 
                              type="button" 
                              disabled={isMaxedOut} 
                              onClick={() => handleDemoldingAdjust(job.id, 'good', 50, job.qty_target)} 
                              style={{ 
                                flex: 1, padding: '10px', borderRadius: '10px', background: '#DCFCE7', color: '#15803d', 
                                border: '1px solid #bbf7d0', fontWeight: 'bold', fontSize: '13px', cursor: isMaxedOut ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s' 
                              }}
                            >
                              +50
                            </button>
                          </div>
                        </div>

                        {/* Defect Counter & List */}
                        <div style={{ backgroundColor: '#FEF2F2', borderRadius: '16px', padding: '16px', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: '20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <label style={{ fontWeight: 900, color: '#DC2626', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              <i className="fas fa-heart-broken" style={{ fontSize: '16px' }}></i> ยอดของเสียรวม: {totalDefect} ชิ้น
                            </label>
                            <button 
                              type="button"
                              disabled={isMaxedOut}
                              onClick={() => handleAddDefectReason(job.id)}
                              style={{ 
                                padding: '6px 12px', borderRadius: '8px', background: '#DC2626', color: '#fff', 
                                border: 'none', fontWeight: 'bold', fontSize: '11px', cursor: isMaxedOut ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px'
                              }}
                            >
                              <i className="fas fa-plus"></i> เพิ่มสาเหตุ
                            </button>
                          </div>

                          {/* Defect List */}
                          {(entry.defects || []).length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '16px', color: '#9CA3AF', background: '#ffffff', borderRadius: '12px', border: '1px dashed #FECACA', fontSize: '12px' }}>
                              ยังไม่มีรายการสินค้าเสีย (คลิก "+ เพิ่มสาเหตุ" เพื่อบันทึก)
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {(entry.defects || []).map((def, idx) => {
                                const isRowMaxed = entry.good + (entry.defects || []).reduce((s, d) => s + d.qty, 0) >= job.qty_target;
                                return (
                                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ffffff', borderRadius: '12px', padding: '8px', border: '1px solid #FECACA' }}>
                                    {/* Reason Selector */}
                                    <select 
                                      value={def.reason} 
                                      onChange={e => handleUpdateDefectReason(job.id, idx, e.target.value as any)}
                                      style={{ flex: 1, backgroundColor: 'transparent', border: 'none', color: '#0F172A', fontSize: '13px', fontWeight: 700, outline: 'none' }}
                                    >
                                      <option value="" disabled>-- เลือกสาเหตุ --</option>
                                      {DEFECT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                    </select>

                                    {/* Qty Adjustment */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#FEF2F2', borderRadius: '8px', padding: '2px 4px' }}>
                                      <button 
                                        type="button" 
                                        onClick={() => handleUpdateDefectQty(job.id, idx, -1, job.qty_target)} 
                                        style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: '#fff', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}
                                      >
                                        -
                                      </button>
                                      <span style={{ minWidth: '24px', textAlign: 'center', fontWeight: 'bold', fontSize: '14px', color: '#B91C1C' }}>
                                        {def.qty}
                                      </span>
                                      <button 
                                        type="button" 
                                        disabled={isRowMaxed}
                                        onClick={() => handleUpdateDefectQty(job.id, idx, 1, job.qty_target)} 
                                        style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: '#fff', color: isRowMaxed ? '#FECACA' : '#EF4444', cursor: isRowMaxed ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}
                                      >
                                        +
                                      </button>
                                    </div>

                                    {/* Delete Button */}
                                    <button 
                                      type="button" 
                                      onClick={() => handleRemoveDefectReason(job.id, idx)}
                                      style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', backgroundColor: '#FEE2E2', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                      <i className="fas fa-trash"></i>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Photo */}
                        <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#475569', marginBottom: '12px' }}>ถ่ายภาพยืนยันการถอดแบบ <span style={{ color: '#EF4444' }}>*</span></h4>
                        <div style={{ backgroundColor: '#F8FAFC', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '10px', position: 'relative', marginBottom: '20px' }}>
                          {!photos[`demold-${job.id}`] && <input type="file" accept="image/*" capture="environment" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 }} onChange={e => handlePhotoSelect(e, `demold-${job.id}`)} />}
                          <div style={{ 
                            width: '100%', height: '120px', borderRadius: '12px', border: photos[`demold-${job.id}`] ? 'none' : '2px dashed #CBD5E1', 
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                            color: '#94A3B8', position: 'relative', overflow: 'hidden'
                          }}>
                            {photos[`demold-${job.id}`] ? (
                              <>
                                <img src={photos[`demold-${job.id}`].preview} alt="preview" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                <button onClick={(e) => removePhoto(`demold-${job.id}`, e)} 
                                  style={{ width: '36px', height: '36px', backgroundColor: 'rgba(239, 68, 68, 0.9)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', top: '8px', right: '8px', border: 'none', cursor: 'pointer', zIndex: 20 }}>
                                  <i className="fas fa-trash" style={{ color: '#ffffff', fontSize: '14px' }}></i>
                                </button>
                              </>
                            ) : (
                              <><i className="fas fa-camera" style={{ fontSize: '28px', marginBottom: '8px' }}></i><span style={{ fontSize: '11px', fontWeight: 800 }}>แตะเพื่อถ่ายภาพสินค้า</span></>
                            )}
                          </div>
                        </div>

                        <button disabled={saving || !photos[`demold-${job.id}`] || (entry.good + totalDefect === 0)} onClick={() => handleDemoldSubmit(job.id, job.qty_target)} 
                          style={{ 
                            width: '100%', padding: '16px', borderRadius: '16px', fontWeight: 900, fontSize: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                            backgroundColor: photos[`demold-${job.id}`] && (entry.good + totalDefect > 0) ? '#10B981' : '#E2E8F0',
                            color: photos[`demold-${job.id}`] && (entry.good + totalDefect > 0) ? '#ffffff' : '#94A3B8',
                            border: 'none', cursor: photos[`demold-${job.id}`] && (entry.good + totalDefect > 0) ? 'pointer' : 'not-allowed',
                            boxShadow: photos[`demold-${job.id}`] && (entry.good + totalDefect > 0) ? '0 10px 20px -5px rgba(16,185,129,0.4)' : 'none',
                          }}>
                          {saving ? <i className="fas fa-spinner fa-spin" style={{ fontSize: '20px' }}></i> : <><i className="fas fa-clipboard-check" style={{ fontSize: '16px' }}></i> สรุปและยืนยันข้อมูล</>}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 35%, rgba(255,255,255,1) 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '30px', paddingLeft: '20px', paddingRight: '20px', paddingBottom: 'max(24px, env(safe-area-inset-bottom))', zIndex: 40 }}>
        {[
          { id: 'casting', label: 'ตรวจการเท', icon: 'fa-truck-monster' },
          { id: 'demolding', label: 'ตรวจถอดแบบ', icon: 'fa-box-open' },
          { id: 'logout', label: 'ออกจากระบบ', icon: 'fa-sign-out-alt' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={async () => {
              if (tab.id === 'logout') {
                const supabase = createClient()
                await supabase.auth.signOut()
                router.push('/login')
              } else {
                setActiveTab(tab.id as any)
                setExpandedJobId(null)
              }
            }}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', background: 'none', border: 'none', cursor: 'pointer', paddingBottom: 0
            }}
          >
            {(activeTab as string) === tab.id && tab.id !== 'logout' ? (
              <>
                <div style={{ position: 'absolute', top: '-40px', width: '54px', height: '54px', backgroundColor: '#3B82F6', borderRadius: '99px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(59,130,246,0.45)', border: '4px solid #ffffff', zIndex: 10 }}>
                  <i className={`fas ${tab.icon}`} style={{ color: '#fff', fontSize: '18px' }}></i>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 800, color: '#3B82F6', marginTop: '22px' }}>{tab.label}</span>
              </>
            ) : (
              <>
                <i className={`fas ${tab.icon}`} style={{ fontSize: '20px', color: tab.id === 'logout' ? '#EF4444' : '#94A3B8', marginBottom: '4px' }}></i>
                <span style={{ fontSize: '10px', fontWeight: 700, color: tab.id === 'logout' ? '#EF4444' : '#94A3B8' }}>{tab.label}</span>
              </>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
