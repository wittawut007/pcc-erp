'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import MobileLogoutButton from '@/components/shared/MobileLogoutButton'

interface Job {
  id: string
  bed: string
  status: string
  qty_target: number
  qty_cast: number
  expected_demold_at: string | null
  plan_item_id?: string
  plan_item: {
    id?: string
    plan_id?: string
    product: { id: string; code: string; name: string; size?: string; category: string; unit: string; concrete_per_unit?: number } | null
  } | null
}

interface PlanMaterial {
  name: string
  qty: number
  unit: string
}

const DEFECT_REASONS = [
  { value: 'crack', label: 'คอนกรีตแตก/ร้าว' },
  { value: 'chip', label: 'บิ่น/มุมหักตอนถอดแบบ' },
  { value: 'honeycomb', label: 'คอนกรีตเป็นโพรง (Honeycomb)' },
  { value: 'other', label: 'อื่นๆ' },
]

export default function WorkerClient({
  jobOrders,
  planMaterialsMap = {},
  planItemToPlanMap = {},
}: {
  jobOrders: Job[]
  planMaterialsMap?: Record<string, PlanMaterial[]>
  planItemToPlanMap?: Record<string, string>
}) {
  const supabase = createClient()
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<'scanner'|'dailyJobs'|'history'>('scanner')
  const [activeSection, setActiveSection] = useState<'scanner'|'phase1'|'concreteSummary'|'phase2'|'phase3'|'phase3Summary'|'success'>('scanner')
  
  const [phaseMode, setPhaseMode] = useState<'casting' | 'demolding' | null>(null)
  const [selectedJobs, setSelectedJobs] = useState<Job[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)

  // Data
  const [phase1Checks, setPhase1Checks] = useState({ clean: false, wip: false })
  const [photos, setPhotos] = useState<Record<string, { file: File, preview: string }>>({})
  const [demoldingData, setDemoldingData] = useState<Record<string, { good: number, defect: number, reason: string }>>({})
  const [scanInput, setScanInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [userProfile, setUserProfile] = useState<{full_name: string, role: string} | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('full_name, role').eq('id', user.id).single()
          .then(({ data }) => {
            if (data) setUserProfile({ full_name: data.full_name, role: data.role })
          })
      }
    })
  }, [supabase])

  const castingJobs = jobOrders.filter(j => j.status === 'pending')
  const demoldingJobs = jobOrders.filter(j => j.status === 'curing' || j.status === 'ready_demold')

  const resetScanner = () => {
    setActiveTab('scanner')
    setActiveSection('scanner')
    setPhaseMode(null)
    setSelectedJobs([])
    setCurrentIndex(0)
    setPhase1Checks({ clean: false, wip: false })
    setPhotos({})
    setDemoldingData({})
    setScanInput('')
  }

  const handleScanInput = () => {
    if (!scanInput.trim()) {
      toast.error('กรุณาระบุเลขที่ PO')
      return
    }
    const foundJobs = jobOrders.filter(j => j.id.toLowerCase().includes(scanInput.toLowerCase().trim()))
    if (foundJobs.length === 0) {
      toast.error('ไม่พบใบสั่งผลิต (PO) นี้ในระบบ หรือไม่มีงานที่พร้อมดำเนินการ')
      return
    }
    
    const firstStatus = foundJobs[0].status
    const mode = (firstStatus === 'pending') ? 'casting' : ((firstStatus === 'curing' || firstStatus === 'ready_demold') ? 'demolding' : null)
    
    if (!mode) {
      toast.error('สถานะของงานนี้ยังไม่สามารถเริ่มหล่อหรือถอดแบบได้')
      return
    }

    setPhaseMode(mode)
    setSelectedJobs(foundJobs)
    setCurrentIndex(0)
    
    if (mode === 'casting') {
      setPhase1Checks({ clean: false, wip: false })
      setActiveSection('phase1')
    } else {
      const initData: Record<string, any> = {}
      foundJobs.forEach(j => {
        initData[j.id] = { good: j.qty_cast || j.qty_target, defect: 0, reason: '' }
      })
      setDemoldingData(initData)
      setActiveSection('phase3')
    }
    setScanInput('')
  }

  const simulateScan = (mode: 'casting' | 'demolding') => {
    const jobs = mode === 'casting' ? castingJobs : demoldingJobs
    if (jobs.length === 0) {
      toast.error('ไม่มีคิวงานสำหรับโหมดนี้ในขณะนี้')
      return
    }
    
    setPhaseMode(mode)
    setSelectedJobs(jobs)
    setCurrentIndex(0)
    
    if (mode === 'casting') {
      setPhase1Checks({ clean: false, wip: false })
      setActiveSection('phase1')
    } else {
      const initData: Record<string, any> = {}
      jobs.forEach(j => {
        initData[j.id] = { good: j.qty_cast || j.qty_target, defect: 0, reason: '' }
      })
      setDemoldingData(initData)
      setActiveSection('phase3')
    }
  }

  const uploadPhoto = async (file: File, folder: string) => {
    const ext = file.name.split('.').pop()
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
    const { error } = await supabase.storage.from('job_photos').upload(fileName, file)
    if (error) {
      toast.error('อัปโหลดรูปไม่สำเร็จ: ' + error.message)
      return null
    }
    const { data: publicUrlData } = supabase.storage.from('job_photos').getPublicUrl(fileName)
    return publicUrlData.publicUrl
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>, phaseKey: string) => {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    setPhotos(prev => ({ ...prev, [phaseKey]: { file, preview } }))
  }

  const currentJob = selectedJobs[currentIndex]

  // Phase 1 Nav
  const handlePhase1Next = () => {
    if (currentIndex < selectedJobs.length - 1) {
      setCurrentIndex(curr => curr + 1)
      setPhase1Checks({ clean: false, wip: false })
    } else {
      setActiveSection('concreteSummary')
    }
  }

  // Phase 2 Submit
  const handlePhase2Submit = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const phase2PhotoUrl = photos['phase2'] ? await uploadPhoto(photos['phase2'].file, 'casting') : null

      for (const job of selectedJobs) {
        const p1PhotoUrl = photos[`phase1-${job.id}`] ? await uploadPhoto(photos[`phase1-${job.id}`].file, 'preparation') : null
        await supabase.from('job_orders').update({
          status: 'casting',
          cast_at: new Date().toISOString(),
          qty_cast: job.qty_target,
          photo_ready_url: p1PhotoUrl,
          photo_cast_url: phase2PhotoUrl
        }).eq('id', job.id)
      }
      setActiveSection('success')
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  // Phase 3 Adjustments
  const handlePhase3Adjust = (jobId: string, field: 'good' | 'defect', change: number) => {
    setDemoldingData(prev => {
      const current = prev[jobId]
      const target = selectedJobs.find(j => j.id === jobId)?.qty_target || 0
      let newGood = current.good
      let newDefect = current.defect

      if (field === 'good') newGood = Math.max(0, newGood + change)
      else newDefect = Math.max(0, newDefect + change)

      if (newGood + newDefect > target) {
        if (field === 'good') newDefect = Math.max(0, target - newGood)
        if (field === 'defect') newGood = Math.max(0, target - newDefect)
      }

      return { ...prev, [jobId]: { ...current, good: newGood, defect: newDefect } }
    })
  }

  // Phase 3 Nav
  const handlePhase3Next = () => {
    if (currentIndex < selectedJobs.length - 1) {
      setCurrentIndex(curr => curr + 1)
    } else {
      setActiveSection('phase3Summary')
    }
  }

  // Phase 3 Submit
  const handlePhase3Submit = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      for (const job of selectedJobs) {
        const entry = demoldingData[job.id]
        const p3PhotoUrl = photos[`phase3-${job.id}`] ? await uploadPhoto(photos[`phase3-${job.id}`].file, 'demolding') : null

        const { data: record, error: recError } = await supabase.from('demolding_records').insert({
          job_order_id: job.id,
          worker_id: user.id,
          qty_good: entry.good,
          qty_defect: entry.defect,
          defect_reason: entry.defect > 0 ? entry.reason || null : null,
          photo_url: p3PhotoUrl
        }).select().single()
        
        if (recError) throw recError

        const totalDemolded = entry.good + entry.defect
        await supabase.from('job_orders').update({
          status: 'demolded',
          demolded_at: new Date().toISOString(),
          qty_cast: totalDemolded,
        }).eq('id', job.id)

        const productId = job.plan_item?.product?.id
        if (productId && entry.good > 0) {
          const { data: existing } = await supabase.from('fg_inventory').select('id, qty').eq('product_id', productId).single()
          if (existing) {
            await supabase.from('fg_inventory').update({ qty: existing.qty + entry.good, updated_at: new Date().toISOString(), last_updated_by: user.id }).eq('id', existing.id)
          } else {
            await supabase.from('fg_inventory').insert({ product_id: productId, qty: entry.good, last_updated_by: user.id })
          }
        }
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action_type: 'ถอดแบบ & QC (Mobile)',
          entity_type: 'demolding_record',
          entity_id: record.id,
          detail: `${job.plan_item?.product?.name} | ดี ${entry.good} / เสีย ${entry.defect}`,
        })
      }
      setActiveSection('success')
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const isPhase1Ready = phase1Checks.clean && phase1Checks.wip && photos[`phase1-${currentJob?.id}`]
  const isPhase3Ready = photos[`phase3-${currentJob?.id}`]
  const isPhase2Ready = photos['phase2']

  return (
    <div className="flex-1 w-full h-[100dvh] flex flex-col relative overflow-hidden text-[13px] text-erp-text-primary" 
      style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)' }}>
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
            }}>
              <i className="fas fa-box" style={{ color: '#fff', fontSize: '14px' }}></i>
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
                  src="https://ui-avatars.com/api/?name=Worker&background=random"
                  alt="Profile"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: '13px', color: '#1E293B', lineHeight: '1.2' }}>
                  {userProfile?.full_name || 'สมชาย ใจดี'}
                </div>
                <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 700, letterSpacing: '0.04em', marginTop: '1px' }}>
                  {userProfile?.role === 'worker' ? 'พนักงานผลิต (Operator)' : userProfile?.role}
                </div>
              </div>
            </div>
            
            <MobileLogoutButton />
          </div>
        </header>

        {/* Main Content */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            paddingTop: '80px',
            paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))',
          }}
        >
          
          {/* Active Tab: SCANNER */}
          {activeTab === 'scanner' && activeSection === 'scanner' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
                maxWidth: '420px',
                margin: '0 auto',
                padding: '8px 24px 0',
                paddingBottom: 'calc(100px + env(safe-area-inset-bottom))',
              }}
            >
              {/* Title */}
              <div style={{ textAlign: 'center', marginBottom: '28px', width: '100%' }}>
                <h2 style={{
                  fontSize: '24px',
                  fontWeight: 900,
                  color: '#0F172A',
                  marginBottom: '6px',
                  letterSpacing: '-0.5px',
                  lineHeight: 1.2,
                }}>สแกนใบสั่งผลิต</h2>
                <p style={{
                  fontSize: '14px',
                  color: '#64748B',
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}>นำกล้องสแกน QR Code เพื่อดึงข้อมูลงาน</p>
              </div>

              {/* Scanner Box */}
              <div style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '1 / 1',
                backgroundColor: '#0D1117',
                borderRadius: '28px',
                overflow: 'hidden',
                marginBottom: '32px',
                boxShadow: '0 20px 60px -10px rgba(15, 23, 42, 0.35)',
              }}>
                {/* Corner — top-left */}
                <div style={{ position: 'absolute', top: '24px', left: '24px', width: '48px', height: '48px',
                  borderTop: '3px solid #3B82F6', borderLeft: '3px solid #3B82F6', borderRadius: '12px 0 0 0' }} />
                {/* Corner — top-right */}
                <div style={{ position: 'absolute', top: '24px', right: '24px', width: '48px', height: '48px',
                  borderTop: '3px solid #3B82F6', borderRight: '3px solid #3B82F6', borderRadius: '0 12px 0 0' }} />
                {/* Corner — bottom-left */}
                <div style={{ position: 'absolute', bottom: '24px', left: '24px', width: '48px', height: '48px',
                  borderBottom: '3px solid #3B82F6', borderLeft: '3px solid #3B82F6', borderRadius: '0 0 0 12px' }} />
                {/* Corner — bottom-right */}
                <div style={{ position: 'absolute', bottom: '24px', right: '24px', width: '48px', height: '48px',
                  borderBottom: '3px solid #3B82F6', borderRight: '3px solid #3B82F6', borderRadius: '0 0 12px 0' }} />

                {/* Scan line */}
                <div className="animate-scan" style={{
                  position: 'absolute',
                  left: '40px',
                  right: '40px',
                  top: '62%',
                  height: '2.5px',
                  borderRadius: '99px',
                  background: 'linear-gradient(90deg, transparent, #10B981, transparent)',
                  boxShadow: '0 0 16px 4px rgba(16,185,129,0.55)',
                  zIndex: 10,
                }} />

                {/* Center QR icon */}
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0.12,
                }}>
                  <i className="fas fa-qrcode" style={{ fontSize: '100px', color: '#ffffff' }}></i>
                </div>
              </div>

              {/* Label above buttons */}
              <p style={{
                fontSize: '11px',
                fontWeight: 800,
                color: '#94A3B8',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: '14px',
                alignSelf: 'center',
              }}>จำลองการสแกน</p>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}>
                <button
                  onClick={() => simulateScan('casting')}
                  style={{
                    width: '100%',
                    height: '56px',
                    backgroundColor: '#2563EB',
                    color: '#ffffff',
                    borderRadius: '99px',
                    border: 'none',
                    fontSize: '15px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 8px 24px -4px rgba(37, 99, 235, 0.45)',
                    cursor: 'pointer',
                    transition: 'transform 0.1s, opacity 0.1s',
                  }}
                  onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                  onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <i className="fas fa-play-circle" style={{ fontSize: '18px' }}></i>
                  สแกนเริ่มงาน (ขั้น 1-2)
                </button>

                <button
                  onClick={() => simulateScan('demolding')}
                  style={{
                    width: '100%',
                    height: '56px',
                    backgroundColor: '#10B981',
                    color: '#ffffff',
                    borderRadius: '99px',
                    border: 'none',
                    fontSize: '15px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 8px 24px -4px rgba(16, 185, 129, 0.40)',
                    cursor: 'pointer',
                    transition: 'transform 0.1s',
                  }}
                  onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                  onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <i className="fas fa-wrench" style={{ fontSize: '16px' }}></i>
                  สแกนถอดแบบ (ขั้น 3)
                </button>
              </div>

              {/* PO manual input */}
              <div style={{ width: '100%', marginTop: '32px', opacity: 0.65 }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="กรอกเลขที่ PO..."
                    style={{
                      flex: 1,
                      height: '44px',
                      padding: '0 18px',
                      borderRadius: '99px',
                      border: '1.5px solid #E2E8F0',
                      background: 'rgba(255,255,255,0.6)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#334155',
                      outline: 'none',
                    }}
                    value={scanInput}
                    onChange={e => setScanInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleScanInput()}
                  />
                  <button
                    onClick={handleScanInput}
                    style={{
                      height: '44px',
                      padding: '0 20px',
                      backgroundColor: '#1E293B',
                      color: '#ffffff',
                      borderRadius: '99px',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    ค้นหา
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SECTION: Phase 1 */}
          {activeSection === 'phase1' && currentJob && (
            <div style={{ padding: '24px 20px', maxWidth: '480px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button 
                  onClick={resetScanner} 
                  style={{ color: '#2563EB', fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', padding: '8px 14px', backgroundColor: '#EFF6FF', borderRadius: '12px', border: 'none', cursor: 'pointer' }}>
                  <i className="fas fa-chevron-left" style={{ marginRight: '6px' }}></i> สแกนใหม่
                </button>
                <span style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8', fontSize: '12px', fontWeight: 700, padding: '6px 14px', borderRadius: '99px', border: '1px solid #BFDBFE' }}>
                  ขั้นที่ 1: เตรียมแบบ ({currentIndex + 1}/{selectedJobs.length})
                </span>
              </div>

              {/* Product Details Card */}
              <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '24px', position: 'relative', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.06)' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '6px', height: '100%', backgroundColor: '#2563EB' }}></div>
                <div style={{ paddingLeft: '8px' }}>
                  <p style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>โรงผลิต: {currentJob.bed}</p>
                  <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', marginTop: '2px', lineHeight: 1.3 }}>
                    {currentJob.plan_item?.product?.name}
                    {currentJob.plan_item?.product?.size && <span style={{ display: 'block', fontSize: '15px', fontWeight: 600, color: '#64748B', marginTop: '4px' }}>ขนาด: {currentJob.plan_item?.product?.size}</span>}
                  </h2>
                  <div style={{ backgroundColor: 'rgba(239, 246, 255, 0.6)', borderRadius: '16px', padding: '16px 20px', marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(219, 234, 254, 0.8)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E3A8A' }}>เป้าหมายผลิตวันนี้</span>
                    <span style={{ fontSize: '26px', fontWeight: 900, color: '#2563EB' }}>{currentJob.qty_target} <span style={{ fontSize: '13px', fontWeight: 800, color: '#60A5FA', textTransform: 'uppercase' }}>{currentJob.plan_item?.product?.unit}</span></span>
                  </div>
                </div>
              </div>

              {/* Checklist */}
              <div>
                <h3 style={{ fontWeight: 800, color: '#475569', marginBottom: '14px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '4px' }}>ตรวจสอบความพร้อม</h3>
                <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '12px', border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.05)' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', padding: '18px', borderRadius: '16px', cursor: 'pointer', borderBottom: '1px solid #F8FAFC' }}>
                    <input type="checkbox" style={{ marginTop: '4px', marginRight: '16px', flexShrink: 0, width: '20px', height: '20px', accentColor: '#2563EB' }} checked={phase1Checks.clean} onChange={e => setPhase1Checks(p => ({...p, clean: e.target.checked}))} />
                    <div>
                      <p style={{ fontWeight: 800, color: '#1E293B', fontSize: '15px' }}>ทำความสะอาดและทาน้ำยาแม่พิมพ์</p>
                      <p style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 500, marginTop: '4px' }}>ตรวจสอบความสะอาดของโรงผลิตก่อนเริ่มงาน</p>
                    </div>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'flex-start', padding: '18px', borderRadius: '16px', cursor: 'pointer' }}>
                    <input type="checkbox" style={{ marginTop: '4px', marginRight: '16px', flexShrink: 0, width: '20px', height: '20px', accentColor: '#2563EB' }} checked={phase1Checks.wip} onChange={e => setPhase1Checks(p => ({...p, wip: e.target.checked}))} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 800, color: '#1E293B', fontSize: '15px' }}>จัดวางโครงเหล็กครบถ้วน</p>
                      {/* Show real material info from dispensed stock */}
                      {(() => {
                        const planId = currentJob.plan_item?.plan_id || planItemToPlanMap[currentJob.plan_item_id || ''] || ''
                        const mats = planMaterialsMap[planId] || []
                        // Filter only wire/steel categories
                        const steelMats = mats.filter(m =>
                          !m.name.toLowerCase().includes('คอน') &&
                          !m.name.toLowerCase().includes('concrete')
                        )
                        if (steelMats.length > 0) {
                          return (
                            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {steelMats.map((m, i) => (
                                <p key={i} style={{ fontSize: '12px', color: '#2563EB', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <i className="fas fa-check" style={{ fontSize: '9px', color: '#93C5FD' }} />
                                  {m.name}
                                </p>
                              ))}
                            </div>
                          )
                        }
                        return <p style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 500, marginTop: '4px' }}>ตรวจสอบรหัสและจำนวนโครงเหล็กให้ตรงตามแผน</p>
                      })()}
                    </div>
                  </label>
                </div>
              </div>

              {/* Concrete Summary Box */}
              <div>
                <h3 style={{ fontWeight: 800, color: '#475569', marginBottom: '14px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '4px' }}>รายการสั่งคอนกรีต</h3>
                <div style={{ backgroundColor: '#0F172A', borderRadius: '24px', padding: '24px 28px', color: '#ffffff', position: 'relative', overflow: 'hidden', boxShadow: '0 15px 35px -5px rgba(15,23,42,0.4)' }}>
                  <div style={{ position: 'absolute', top: 0, right: 0, width: '150px', height: '150px', backgroundColor: 'rgba(59, 130, 246, 0.15)', borderRadius: '50%', marginRight: '-60px', marginTop: '-60px', filter: 'blur(35px)' }}></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(51, 65, 85, 0.6)', paddingBottom: '20px', marginBottom: '20px' }}>
                    <p style={{ fontSize: '14px', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ปริมาณสินค้าทั้งหมด</p>
                    <p style={{ fontWeight: 900, color: '#ffffff', fontSize: '20px' }}>{currentJob.qty_target} {currentJob.plan_item?.product?.unit}</p>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ fontSize: '14px', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>คอนกรีตที่ต้องใช้</p>
                    <p style={{ fontWeight: 900, fontSize: '36px', color: '#60A5FA' }}>{((currentJob.plan_item?.product?.concrete_per_unit || 0) * currentJob.qty_target).toFixed(2)} <span style={{ fontSize: '16px', fontWeight: 800, color: '#64748B', marginLeft: '6px', textTransform: 'uppercase' }}>คิว</span></p>
                  </div>
                </div>
              </div>

              {/* Camera */}
              <div>
                <h3 style={{ fontWeight: 800, color: '#475569', marginBottom: '14px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '4px' }}>ถ่ายภาพยืนยัน <span style={{ color: '#EF4444' }}>*</span></h3>
                <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', border: '1px solid rgba(0,0,0,0.05)', padding: '10px', position: 'relative', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.05)' }}>
                  {!photos[`phase1-${currentJob.id}`] && <input type="file" accept="image/*" capture="environment" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 }} onChange={e => handlePhotoSelect(e, `phase1-${currentJob.id}`)} />}
                  <div style={{ 
                    width: '100%', height: '140px', borderRadius: '16px', border: photos[`phase1-${currentJob.id}`] ? '2px solid #34D399' : '2px dashed #CBD5E1', 
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                    color: photos[`phase1-${currentJob.id}`] ? '#10B981' : '#94A3B8', backgroundColor: photos[`phase1-${currentJob.id}`] ? 'transparent' : '#F8FAFC',
                    position: 'relative', overflow: 'hidden'
                  }}>
                    {photos[`phase1-${currentJob.id}`] ? (
                      <>
                        <img src={photos[`phase1-${currentJob.id}`].preview} alt="preview" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <button onClick={(e) => { e.stopPropagation(); setPhotos(p => { const newP = {...p}; delete newP[`phase1-${currentJob.id}`]; return newP; }) }} 
                            style={{ width: '44px', height: '44px', backgroundColor: 'rgba(239, 68, 68, 0.95)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 20px -3px rgba(0,0,0,0.2)', position: 'absolute', top: '12px', right: '12px', border: 'none', cursor: 'pointer', zIndex: 20 }}>
                            <i className="fas fa-trash" style={{ color: '#ffffff', fontSize: '16px' }}></i>
                          </button>
                          <i className="fas fa-check-circle" style={{ color: '#ffffff', fontSize: '42px', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))' }}></i>
                        </div>
                      </>
                    ) : (
                      <><i className="fas fa-camera" style={{ fontSize: '36px', marginBottom: '10px' }}></i><span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>แตะเพื่อถ่ายภาพยืนยัน</span></>
                    )}
                  </div>
                </div>
              </div>

              <button disabled={!isPhase1Ready} onClick={handlePhase1Next} 
                style={{
                  width: '100%', padding: '18px', borderRadius: '99px', fontWeight: 900, fontSize: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                  backgroundColor: isPhase1Ready ? '#2563EB' : '#E2E8F0',
                  color: isPhase1Ready ? '#ffffff' : '#94A3B8',
                  border: 'none',
                  boxShadow: isPhase1Ready ? '0 12px 30px -6px rgba(37,99,235,0.5)' : 'none',
                  cursor: isPhase1Ready ? 'pointer' : 'not-allowed',
                  marginTop: '12px'
                }}>
                {currentIndex < selectedJobs.length - 1 ? `ถัดไป (คิวที่ ${currentIndex + 2}/${selectedJobs.length})` : 'สรุปเพื่อสั่งคอนกรีต'} <i className="fas fa-arrow-right" style={{ marginLeft: '4px' }}></i>
              </button>
            </div>
          )}

          {/* SECTION: Phase 1.5 Concrete Summary */}
          {activeSection === 'concreteSummary' && (
            <div style={{ padding: '24px 20px', maxWidth: '480px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', border: '1px solid rgba(0,0,0,0.04)', padding: '32px', position: 'relative', overflow: 'hidden', boxShadow: '0 15px 35px -5px rgba(0,0,0,0.08)' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '8px', backgroundColor: '#2563EB' }}></div>
                <div style={{ textAlign: 'center', marginBottom: '32px', marginTop: '8px' }}>
                  <div style={{ width: '72px', height: '72px', backgroundColor: '#EFF6FF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid #DBEAFE', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                    <i className="fas fa-receipt" style={{ fontSize: '32px', color: '#3B82F6' }}></i>
                  </div>
                  <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.3px' }}>สรุปใบสั่งคอนกรีต</h2>
                  <p style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '4px' }}>Ready-Mixed Concrete Order</p>
                </div>
                
                <div style={{ borderTop: '2px dashed #F1F5F9', paddingTop: '24px', marginBottom: '24px' }}>
                  <div style={{ marginBottom: '24px', maxHeight: '200px', overflowY: 'auto', paddingRight: '8px' }} className="custom-scrollbar">
                    {selectedJobs.map(j => (
                      <div key={j.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #F8FAFC' }}>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 900, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>โรงผลิต: {j.bed}</div>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>
                            {j.plan_item?.product?.name}
                            {j.plan_item?.product?.size && <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', marginLeft: '6px' }}>(ขนาด: {j.plan_item?.product?.size})</span>}
                          </div>
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: '#2563EB' }}>{((j.plan_item?.product?.concrete_per_unit || 0) * j.qty_target).toFixed(1)} <span style={{ fontSize: '12px', textTransform: 'uppercase', marginLeft: '2px', color: '#60A5FA', fontWeight: 800 }}>คิว</span></div>
                      </div>
                    ))}
                  </div>
                  
                  <div style={{ backgroundColor: '#0F172A', padding: '24px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.4)' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ปริมาณสั่งรวม</span>
                    <span style={{ fontSize: '36px', fontWeight: 900, color: '#60A5FA' }}>
                      {selectedJobs.reduce((sum, j) => sum + ((j.plan_item?.product?.concrete_per_unit || 0) * j.qty_target), 0).toFixed(1)} <span style={{ fontSize: '16px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginLeft: '6px' }}>คิว</span>
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button onClick={() => { setCurrentIndex(0); setActiveSection('phase1') }} 
                  style={{ flex: 1, backgroundColor: '#ffffff', border: '1px solid #E2E8F0', color: '#64748B', padding: '16px', borderRadius: '16px', fontWeight: 800, fontSize: '15px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  แก้ไข
                </button>
                <button onClick={() => setActiveSection('phase2')} 
                  style={{ flex: 2, backgroundColor: '#2563EB', color: '#ffffff', padding: '16px', borderRadius: '16px', fontWeight: 900, fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer', boxShadow: '0 10px 20px -5px rgba(37,99,235,0.4)', border: 'none' }}>
                  ส่งคำสั่งปูน <i className="fas fa-paper-plane" style={{ marginLeft: '4px' }}></i>
                </button>
              </div>
            </div>
          )}

          {/* SECTION: Phase 2 Pouring */}
          {activeSection === 'phase2' && (
            <div style={{ padding: '24px 20px', maxWidth: '480px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: '16px' }}>
                <span style={{ backgroundColor: '#E0E7FF', color: '#4338CA', fontSize: '11px', fontWeight: 800, padding: '6px 14px', borderRadius: '99px', border: '1px solid #C7D2FE' }}>
                  ขั้นที่ 2: เทคอนกรีต
                </span>
              </div>
              
              <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', border: '1px solid rgba(0,0,0,0.04)', padding: '32px', textAlign: 'center', marginBottom: '24px', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.06)' }}>
                <div style={{ width: '96px', height: '96px', backgroundColor: '#EEF2FF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', border: '4px solid #E0E7FF', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                  <i className="fas fa-truck-monster" style={{ fontSize: '36px', color: '#6366F1' }}></i>
                </div>
                <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', marginBottom: '8px' }}>ส่งคำสั่งปูนเรียบร้อยแล้ว</h2>
                <p style={{ fontSize: '14px', color: '#64748B', fontWeight: 600, marginBottom: '24px' }}>
                  รถโม่กำลังจัดส่ง {selectedJobs.reduce((sum, j) => sum + ((j.plan_item?.product?.concrete_per_unit || 0) * j.qty_target), 0).toFixed(1)} คิว
                </p>
                <div style={{ backgroundColor: 'rgba(254, 252, 232, 0.6)', border: '1px solid #FEF08A', borderRadius: '16px', padding: '20px', textAlign: 'left' }}>
                  <p style={{ fontWeight: 900, color: '#92400E', fontSize: '13px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-exclamation-triangle" style={{ color: '#D97706' }}></i> ข้อควรปฏิบัติ:
                  </p>
                  <ul style={{ fontSize: '12px', color: '#B45309', margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontWeight: 600 }}>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><i className="fas fa-check" style={{ fontSize: '10px', marginTop: '4px' }}></i> ควบคุมการเทคอนกรีตลงแบบให้ทั่วถึง</li>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><i className="fas fa-check" style={{ fontSize: '10px', marginTop: '4px' }}></i> ใช้เครื่องจี้ปูนไล่ฟองอากาศให้หมด</li>
                    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><i className="fas fa-check" style={{ fontSize: '10px', marginTop: '4px' }}></i> ปาดหน้าคอนกรีตให้เรียบสม่ำเสมอ</li>
                  </ul>
                </div>
              </div>
              
              <h3 style={{ fontWeight: 800, color: '#475569', marginBottom: '12px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '4px' }}>ถ่ายภาพยืนยันการเท <span style={{ color: '#EF4444' }}>*</span></h3>
              <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', border: '1px solid rgba(0,0,0,0.05)', padding: '10px', position: 'relative', marginBottom: '24px', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.05)' }}>
                {!photos['phase2'] && <input type="file" accept="image/*" capture="environment" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 }} onChange={e => handlePhotoSelect(e, 'phase2')} />}
                <div style={{ 
                  width: '100%', height: '120px', borderRadius: '16px', border: photos['phase2'] ? '2px solid #818CF8' : '2px dashed #E2E8F0', 
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                  color: photos['phase2'] ? '#6366F1' : '#94A3B8', backgroundColor: photos['phase2'] ? 'transparent' : '#F8FAFC',
                  position: 'relative', overflow: 'hidden'
                }}>
                  {photos['phase2'] ? (
                    <>
                      <img src={photos['phase2'].preview} alt="preview" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <button onClick={(e) => { e.stopPropagation(); setPhotos(p => { const newP = {...p}; delete newP['phase2']; return newP; }) }} 
                          style={{ width: '40px', height: '40px', backgroundColor: 'rgba(239, 68, 68, 0.95)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 20px -3px rgba(0,0,0,0.2)', position: 'absolute', top: '12px', right: '12px', border: 'none', cursor: 'pointer', zIndex: 20 }}>
                          <i className="fas fa-trash" style={{ color: '#ffffff', fontSize: '14px' }}></i>
                        </button>
                        <i className="fas fa-check-double" style={{ color: '#ffffff', fontSize: '36px', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))' }}></i>
                      </div>
                    </>
                  ) : (
                    <><i className="fas fa-camera" style={{ fontSize: '28px', marginBottom: '8px' }}></i><span style={{ fontSize: '11px', fontWeight: 800 }}>แตะเพื่อถ่ายภาพหน้างาน</span></>
                  )}
                </div>
              </div>

              <button disabled={!isPhase2Ready || saving} onClick={handlePhase2Submit} 
                style={{ 
                  width: '100%', padding: '18px', borderRadius: '99px', fontWeight: 900, fontSize: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px',
                  backgroundColor: isPhase2Ready ? '#4F46E5' : '#E2E8F0',
                  color: isPhase2Ready ? '#ffffff' : '#94A3B8',
                  border: 'none',
                  boxShadow: isPhase2Ready ? '0 12px 30px -6px rgba(79,70,229,0.5)' : 'none',
                  cursor: isPhase2Ready ? 'pointer' : 'not-allowed',
                }}>
                {saving ? <i className="fas fa-spinner fa-spin" style={{ fontSize: '20px' }}></i> : <><i className="fas fa-check-double" style={{ fontSize: '18px' }}></i> ยืนยันการเทคอนกรีตเสร็จสิ้น</>}
              </button>
            </div>
          )}

          {/* SECTION: Phase 3 */}
          {activeSection === 'phase3' && currentJob && (
            <div style={{ padding: '24px 20px', maxWidth: '480px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <button onClick={resetScanner} style={{ color: '#2563EB', fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', padding: '8px 14px', backgroundColor: '#EFF6FF', borderRadius: '12px', border: 'none', cursor: 'pointer' }}>
                  <i className="fas fa-chevron-left" style={{ marginRight: '6px' }}></i> สแกนใหม่
                </button>
                <span style={{ backgroundColor: '#D1FAE5', color: '#047857', fontSize: '12px', fontWeight: 700, padding: '6px 14px', borderRadius: '99px', border: '1px solid #A7F3D0' }}>
                  ขั้นที่ 3: ถอดแบบ ({currentIndex + 1}/{selectedJobs.length})
                </span>
              </div>
              
              <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '24px', position: 'relative', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.06)' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '6px', height: '100%', backgroundColor: '#10B981' }}></div>
                <div style={{ paddingLeft: '8px' }}>
                  <p style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>โรงผลิต: {currentJob.bed}</p>
                  <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', marginTop: '2px', lineHeight: 1.3 }}>
                    {currentJob.plan_item?.product?.name}
                    {currentJob.plan_item?.product?.size && <span style={{ display: 'block', fontSize: '15px', fontWeight: 600, color: '#64748B', marginTop: '4px' }}>ขนาด: {currentJob.plan_item?.product?.size}</span>}
                  </h2>
                  <div style={{ backgroundColor: 'rgba(209, 250, 229, 0.5)', borderRadius: '16px', padding: '16px', marginTop: '20px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(167, 243, 208, 0.5)' }}>
                    <i className="fas fa-clock" style={{ color: '#10B981', fontSize: '14px' }}></i>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.05em' }}>พร้อมถอดแบบ (เป้าหมาย {currentJob.qty_target} {currentJob.plan_item?.product?.unit})</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 style={{ fontWeight: 800, color: '#475569', marginBottom: '14px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '4px' }}>บันทึกผลการถอดแบบ (QC)</h3>
                
                <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '24px', border: '1px solid rgba(16, 185, 129, 0.2)', boxShadow: '0 10px 25px -5px rgba(16,185,129,0.08)', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <label style={{ fontWeight: 900, color: '#047857', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <i className="fas fa-check-circle" style={{ fontSize: '20px' }}></i> ยอดงานดี (QC PASS)
                    </label>
                    <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>เป้า: {currentJob.qty_target}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(209, 250, 229, 0.3)', borderRadius: '20px', padding: '12px', border: '1px solid rgba(167, 243, 208, 0.5)' }}>
                    <button type="button" onClick={() => handlePhase3Adjust(currentJob.id, 'good', -1)} style={{ width: '56px', height: '56px', backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', color: '#059669', fontSize: '24px', border: '1px solid #D1FAE5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fas fa-minus"></i></button>
                    <input type="number" readOnly value={demoldingData[currentJob.id]?.good || 0} style={{ width: '96px', backgroundColor: 'transparent', textAlign: 'center', fontSize: '48px', fontWeight: 900, color: '#065F46', outline: 'none', border: 'none' }} />
                    <button type="button" onClick={() => handlePhase3Adjust(currentJob.id, 'good', 1)} style={{ width: '56px', height: '56px', backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', color: '#059669', fontSize: '24px', border: '1px solid #D1FAE5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fas fa-plus"></i></button>
                  </div>
                </div>

                <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '24px', border: '1px solid rgba(239, 68, 68, 0.2)', boxShadow: '0 10px 25px -5px rgba(239,68,68,0.08)' }}>
                  <label style={{ fontWeight: 900, color: '#DC2626', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px' }}>
                    <i className="fas fa-heart-broken" style={{ fontSize: '20px' }}></i> ยอดของเสีย (DEFECT)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(254, 226, 226, 0.3)', borderRadius: '20px', padding: '12px', border: '1px solid rgba(254, 202, 202, 0.5)', marginBottom: demoldingData[currentJob.id]?.defect > 0 ? '20px' : '0' }}>
                    <button type="button" onClick={() => handlePhase3Adjust(currentJob.id, 'defect', -1)} style={{ width: '56px', height: '56px', backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', color: '#EF4444', fontSize: '24px', border: '1px solid #FEE2E2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fas fa-minus"></i></button>
                    <input type="number" readOnly value={demoldingData[currentJob.id]?.defect || 0} style={{ width: '96px', backgroundColor: 'transparent', textAlign: 'center', fontSize: '48px', fontWeight: 900, color: '#B91C1C', outline: 'none', border: 'none' }} />
                    <button type="button" onClick={() => handlePhase3Adjust(currentJob.id, 'defect', 1)} style={{ width: '56px', height: '56px', backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', color: '#EF4444', fontSize: '24px', border: '1px solid #FEE2E2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fas fa-plus"></i></button>
                  </div>
                  {demoldingData[currentJob.id]?.defect > 0 && (
                    <div style={{ marginTop: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#991B1B', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ระบุสาเหตุความเสียหาย <span style={{ color: '#EF4444' }}>*</span></label>
                      <select value={demoldingData[currentJob.id]?.reason} onChange={e => setDemoldingData(p => ({...p, [currentJob.id]: {...p[currentJob.id], reason: e.target.value}}))} 
                        style={{ width: '100%', backgroundColor: '#F8FAFC', border: '1px solid #FECACA', color: '#0F172A', borderRadius: '16px', padding: '16px', outline: 'none', fontSize: '16px', fontWeight: 700, appearance: 'none' }}>
                        <option value="" disabled>-- เลือกสาเหตุ --</option>
                        {DEFECT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 style={{ fontWeight: 800, color: '#475569', marginBottom: '14px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '4px' }}>ถ่ายภาพยืนยัน <span style={{ color: '#EF4444' }}>*</span></h3>
                <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', border: '1px solid rgba(0,0,0,0.05)', padding: '10px', position: 'relative', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.05)' }}>
                  {!photos[`phase3-${currentJob.id}`] && <input type="file" accept="image/*" capture="environment" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 }} onChange={e => handlePhotoSelect(e, `phase3-${currentJob.id}`)} />}
                  <div style={{ 
                    width: '100%', height: '140px', borderRadius: '16px', border: photos[`phase3-${currentJob.id}`] ? '2px solid #34D399' : '2px dashed #CBD5E1', 
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                    color: photos[`phase3-${currentJob.id}`] ? '#10B981' : '#94A3B8', backgroundColor: photos[`phase3-${currentJob.id}`] ? 'transparent' : '#F8FAFC',
                    position: 'relative', overflow: 'hidden'
                  }}>
                    {photos[`phase3-${currentJob.id}`] ? (
                      <>
                        <img src={photos[`phase3-${currentJob.id}`].preview} alt="preview" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <button onClick={(e) => { e.stopPropagation(); setPhotos(p => { const newP = {...p}; delete newP[`phase3-${currentJob.id}`]; return newP; }) }} 
                            style={{ width: '44px', height: '44px', backgroundColor: 'rgba(239, 68, 68, 0.95)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 20px -3px rgba(0,0,0,0.2)', position: 'absolute', top: '12px', right: '12px', border: 'none', cursor: 'pointer', zIndex: 20 }}>
                            <i className="fas fa-trash" style={{ color: '#ffffff', fontSize: '16px' }}></i>
                          </button>
                          <i className="fas fa-check-circle" style={{ color: '#ffffff', fontSize: '42px', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))' }}></i>
                        </div>
                      </>
                    ) : (
                      <><i className="fas fa-camera" style={{ fontSize: '36px', marginBottom: '10px' }}></i><span style={{ fontSize: '12px', fontWeight: 800 }}>แตะเพื่อถ่ายภาพสินค้า (FG / Defect)</span></>
                    )}
                  </div>
                </div>
              </div>

              <button disabled={!isPhase3Ready} onClick={handlePhase3Next} 
                style={{ 
                  width: '100%', padding: '18px', borderRadius: '99px', fontWeight: 900, fontSize: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                  backgroundColor: isPhase3Ready ? '#059669' : '#E2E8F0',
                  color: isPhase3Ready ? '#ffffff' : '#94A3B8',
                  border: 'none',
                  boxShadow: isPhase3Ready ? '0 12px 30px -6px rgba(5,150,105,0.5)' : 'none',
                  cursor: isPhase3Ready ? 'pointer' : 'not-allowed',
                  marginTop: '12px'
                }}>
                {currentIndex < selectedJobs.length - 1 ? 'ถัดไป' : 'สรุปยืนยันข้อมูลทั้งหมด'} <i className="fas fa-save" style={{ marginLeft: '4px' }}></i>
              </button>
            </div>
          )}

          {/* SECTION: Phase 3 Summary */}
          {activeSection === 'phase3Summary' && (
            <div style={{ padding: '24px 20px', maxWidth: '480px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', border: '1px solid rgba(0,0,0,0.04)', padding: '32px', position: 'relative', overflow: 'hidden', boxShadow: '0 15px 35px -5px rgba(0,0,0,0.08)' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '8px', backgroundColor: '#059669' }}></div>
                <div style={{ textAlign: 'center', marginBottom: '32px', marginTop: '8px' }}>
                  <div style={{ width: '72px', height: '72px', backgroundColor: '#ECFDF5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid #D1FAE5', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                    <i className="fas fa-list-check" style={{ fontSize: '32px', color: '#10B981' }}></i>
                  </div>
                  <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.3px' }}>สรุปยอดถอดแบบ</h2>
                  <p style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '4px' }}>Demolding & QC Summary</p>
                </div>
                
                <div style={{ borderTop: '2px dashed #F1F5F9', paddingTop: '24px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {selectedJobs.map(j => {
                    const entry = demoldingData[j.id];
                    return (
                      <div key={j.id} style={{ backgroundColor: '#F8FAFC', borderRadius: '16px', padding: '16px 20px', border: '1px solid rgba(226, 232, 240, 0.6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 900, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>โรงผลิต {j.bed}</div>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>
                            {j.plan_item?.product?.name}
                            {j.plan_item?.product?.size && <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', marginLeft: '6px' }}>(ขนาด: {j.plan_item?.product?.size})</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '18px', fontWeight: 900, color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}><i className="fas fa-check-circle"></i>{entry.good}</div>
                          {entry.defect > 0 && <div style={{ fontSize: '13px', fontWeight: 800, color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '4px' }}><i className="fas fa-times-circle"></i>{entry.defect}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                <button disabled={saving} onClick={handlePhase3Submit} 
                  style={{ 
                    width: '100%', backgroundColor: '#059669', color: '#ffffff', padding: '18px', borderRadius: '16px', fontWeight: 900, fontSize: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 10px 25px -5px rgba(5,150,105,0.4)', border: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' 
                  }}>
                  {saving ? <i className="fas fa-spinner fa-spin" style={{ fontSize: '20px' }}></i> : <>บันทึกและเข้าคลัง FG <i className="fas fa-paper-plane" style={{ marginLeft: '4px' }}></i></>}
                </button>
                <button onClick={() => { setCurrentIndex(0); setActiveSection('phase3'); }} 
                  style={{ width: '100%', marginTop: '16px', backgroundColor: '#ffffff', border: '1px solid #E2E8F0', color: '#64748B', padding: '18px', borderRadius: '16px', fontWeight: 800, fontSize: '15px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ย้อนกลับ
                </button>
              </div>
            </div>
          )}

          {/* SECTION: Success */}
          {activeSection === 'success' && (
            <div style={{
              padding: '32px 24px',
              display: 'flex', flexDirection: 'column',
              justifyContent: 'center', alignItems: 'center',
              textAlign: 'center',
              minHeight: '60vh',
            }}>
              <div style={{
                width: '112px', height: '112px',
                backgroundColor: '#F0FDF4',
                borderRadius: '99px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '28px',
                border: '4px solid #ffffff',
                boxShadow: '0 12px 40px rgba(16,185,129,0.15)',
              }}>
                <i className="fas fa-check" style={{ fontSize: '48px', color: '#10B981' }}></i>
              </div>
              <h2 style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', marginBottom: '8px', letterSpacing: '-0.5px' }}>ทำรายการสำเร็จ!</h2>
              <p style={{ fontSize: '15px', color: '#64748B', fontWeight: 500, marginBottom: '36px', lineHeight: 1.6 }}>
                ระบบบันทึกข้อมูลเรียบร้อยแล้ว<br/>
                {phaseMode === 'casting' ? 'เริ่มนับเวลาการบ่มสินค้า...' : 'สินค้าถูกส่งเข้าคลัง FG แล้ว'}
              </p>
              <button
                onClick={() => window.location.reload()}
                style={{
                  backgroundColor: '#2563EB', color: '#ffffff',
                  padding: '16px 48px', borderRadius: '99px', border: 'none',
                  fontSize: '14px', fontWeight: 800, letterSpacing: '0.08em',
                  textTransform: 'uppercase', cursor: 'pointer',
                  boxShadow: '0 8px 24px rgba(37,99,235,0.4)',
                }}
              >
                กลับหน้าหลัก
              </button>
            </div>
          )}

          {/* Active Tab: DAILY JOBS */}
          {activeTab === 'dailyJobs' && (
            <div style={{ padding: '24px 20px', maxWidth: '480px', margin: '0 auto', width: '100%' }}>
              {/* Section Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <div style={{
                      width: '7px', height: '7px', borderRadius: '99px',
                      backgroundColor: '#2563EB',
                      animation: 'pulse 2s infinite',
                    }} />
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#2563EB', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Live Updates</span>
                  </div>
                  <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.3px', margin: 0 }}>คิวงานวันนี้</h2>
                  <p style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 500, marginTop: '4px' }}>รายการงานผลิตในความรับผิดชอบ</p>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  backgroundColor: '#EFF6FF', color: '#2563EB',
                  padding: '8px 14px', borderRadius: '12px',
                  border: '1px solid #BFDBFE',
                  fontSize: '13px', fontWeight: 800,
                  boxShadow: '0 2px 6px rgba(37,99,235,0.08)',
                }}>
                  <i className="fas fa-layer-group"></i> {jobOrders.length}
                </div>
              </div>

              {/* Empty State */}
              {jobOrders.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '48px 24px',
                  backgroundColor: 'rgba(255,255,255,0.5)',
                  borderRadius: '24px', border: '2px dashed #CBD5E1',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
                }}>
                  <i className="fas fa-folder-open" style={{ fontSize: '32px', color: '#CBD5E1' }}></i>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#94A3B8' }}>ยังไม่มีคิวงานที่ได้รับมอบหมาย</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {jobOrders.map(j => {
                    const statusMap: Record<string, { label: string; bg: string; color: string; border: string }> = {
                      pending:      { label: 'รอเทปูน',       bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
                      casting:      { label: 'กำลังเทปูน',   bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE' },
                      curing:       { label: 'กำลังบ่ม',     bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
                      ready_demold: { label: 'พร้อมถอดแบบ',  bg: '#F0FDF4', color: '#059669', border: '#A7F3D0' },
                      demolded:     { label: 'เสร็จสิ้น',    bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
                    }
                    const s = statusMap[j.status] || statusMap['demolded']
                    return (
                      <div
                        key={j.id}
                        style={{
                          backgroundColor: '#ffffff',
                          borderRadius: '20px',
                          padding: '18px 20px',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          border: '1px solid rgba(0,0,0,0.04)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                          gap: '12px',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#1E293B', margin: '0 0 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {j.plan_item?.product?.name}
                            {j.plan_item?.product?.size && <div style={{ fontSize: '12px', fontWeight: 500, color: '#64748B', marginTop: '2px' }}>ขนาด: {j.plan_item?.product?.size}</div>}
                          </h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <i className="fas fa-map-marker-alt" style={{ color: '#3B82F6' }}></i> โรงผลิต {j.bed}
                            </span>
                            <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <i className="fas fa-bullseye" style={{ color: '#10B981' }}></i> เป้า: {j.qty_target}
                            </span>
                          </div>
                        </div>
                        <span style={{
                          fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em',
                          padding: '6px 12px', borderRadius: '10px', flexShrink: 0,
                          backgroundColor: s.bg, color: s.color,
                          border: `1px solid ${s.border}`,
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                        }}>
                          {s.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </main>

        <nav style={{
          position: 'fixed',
          bottom: 0, left: 0,
          width: '100%',
          backgroundColor: '#ffffff',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'flex-end',
          paddingTop: '10px',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
          zIndex: 20,
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -4px 30px rgba(0,0,0,0.06)',
        }}>
          {/* Tab: สแกนงาน */}
          <button
            onClick={() => { setActiveTab('scanner'); setActiveSection('scanner') }}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', position: 'relative',
              background: 'none', border: 'none', cursor: 'pointer',
              paddingBottom: 0,
            }}
          >
            {activeTab === 'scanner' ? (
              <>
                <div style={{
                  position: 'absolute',
                  top: '-44px',
                  width: '64px', height: '64px',
                  backgroundColor: '#2563EB',
                  borderRadius: '99px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 8px 20px rgba(37,99,235,0.45)',
                  border: '5px solid #ffffff',
                  zIndex: 10,
                }}>
                  <i className="fas fa-th-large" style={{ color: '#fff', fontSize: '22px' }}></i>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#2563EB', marginTop: '28px' }}>สแกนงาน</span>
              </>
            ) : (
              <>
                <i className="fas fa-th-large" style={{ fontSize: '22px', color: '#94A3B8', marginBottom: '4px' }}></i>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8' }}>สแกนงาน</span>
              </>
            )}
          </button>

          {/* Tab: งานวันนี้ */}
          <button
            onClick={() => setActiveTab('dailyJobs')}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', position: 'relative',
              background: 'none', border: 'none', cursor: 'pointer',
              paddingBottom: 0,
            }}
          >
            {activeTab === 'dailyJobs' ? (
              <>
                <div style={{
                  position: 'absolute',
                  top: '-44px',
                  width: '64px', height: '64px',
                  backgroundColor: '#2563EB',
                  borderRadius: '99px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 8px 20px rgba(37,99,235,0.45)',
                  border: '5px solid #ffffff',
                  zIndex: 10,
                }}>
                  <i className="fas fa-clipboard-list" style={{ color: '#fff', fontSize: '22px' }}></i>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#2563EB', marginTop: '28px' }}>งานวันนี้</span>
              </>
            ) : (
              <>
                <i className="fas fa-clipboard-list" style={{ fontSize: '22px', color: '#94A3B8', marginBottom: '4px' }}></i>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8' }}>งานวันนี้</span>
              </>
            )}
          </button>

          {/* Tab: ประวัติ */}
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login'; }}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center',
              background: 'none', border: 'none', cursor: 'pointer',
              paddingTop: '4px',
            }}
          >
            <i className="fas fa-history" style={{ fontSize: '22px', color: '#94A3B8', marginBottom: '4px' }}></i>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8' }}>ประวัติ</span>
          </button>
        </nav>
    </div>
  )
}
