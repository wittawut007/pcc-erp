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
  plan_item: { product: { id: string; code: string; name: string; category: string; unit: string; concrete_per_unit?: number } | null } | null
}

const DEFECT_REASONS = [
  { value: 'crack', label: 'คอนกรีตแตก/ร้าว' },
  { value: 'chip', label: 'บิ่น/มุมหักตอนถอดแบบ' },
  { value: 'honeycomb', label: 'คอนกรีตเป็นโพรง (Honeycomb)' },
  { value: 'other', label: 'อื่นๆ' },
]

export default function WorkerClient({ jobOrders }: { jobOrders: Job[] }) {
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
            <div className="p-4 pb-10">
              <div className="flex items-center justify-between mb-4">
                <button onClick={resetScanner} className="text-blue-600 font-semibold text-sm flex items-center px-3 py-1.5 bg-blue-50 rounded-xl active:bg-blue-100">
                  <i className="fas fa-chevron-left mr-1"></i> สแกนใหม่
                </button>
                <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-3 py-1 rounded-full border border-blue-200">
                  ขั้นที่ 1: เตรียมแบบ ({currentIndex + 1}/{selectedJobs.length})
                </span>
              </div>

              <div className="bg-white rounded-[20px] p-5 mb-4 relative overflow-hidden fade-in border border-black/[0.03]" 
                style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07), 0 15px 30px -5px rgba(0,0,0,0.05)' }}>
                <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600"></div>
                <div className="pl-3">
                  <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mb-1">แท่นผลิต: {currentJob.bed}</p>
                  <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">{currentJob.plan_item?.product?.name}</h2>
                  <div className="bg-blue-50/50 rounded-xl p-4 mt-4 flex justify-between items-center border border-blue-100/50">
                    <span className="text-[13px] font-bold text-blue-900">เป้าหมายผลิตวันนี้</span>
                    <span className="text-2xl font-black text-blue-600">{currentJob.qty_target} <span className="text-[13px] font-bold text-blue-400 uppercase">{currentJob.plan_item?.product?.unit}</span></span>
                  </div>
                </div>
              </div>

              <h3 className="font-bold text-gray-600 mb-2 text-xs uppercase tracking-wide px-1 mt-4">ตรวจสอบความพร้อม</h3>
              <div className="bg-white rounded-[20px] p-2 mb-4 fade-in border border-black/[0.03]" 
                style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07), 0 15px 30px -5px rgba(0,0,0,0.05)' }}>
                <label className="flex items-start p-4 hover:bg-slate-50/50 rounded-xl cursor-pointer border-b border-slate-50 transition-colors">
                  <input type="checkbox" className="custom-checkbox mt-1 mr-4 flex-shrink-0" checked={phase1Checks.clean} onChange={e => setPhase1Checks(p => ({...p, clean: e.target.checked}))} />
                  <div>
                    <p className="font-extrabold text-slate-800 text-[14px]">ทำความสะอาดและทาน้ำยาแม่พิมพ์</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">ตรวจสอบความสะอาดของแท่นเทปูนก่อนเริ่มงาน</p>
                  </div>
                </label>
                <label className="flex items-start p-4 hover:bg-slate-50/50 rounded-xl cursor-pointer transition-colors">
                  <input type="checkbox" className="custom-checkbox mt-1 mr-4 flex-shrink-0" checked={phase1Checks.wip} onChange={e => setPhase1Checks(p => ({...p, wip: e.target.checked}))} />
                  <div>
                    <p className="font-extrabold text-slate-800 text-[14px]">จัดวางโครงเหล็ก (WIP) ครบถ้วน</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">ตรวจสอบรหัสและจำนวนโครงเหล็กให้ตรงตามแผน</p>
                  </div>
                </label>
              </div>

              <h3 className="font-bold text-gray-600 mb-2 text-xs uppercase tracking-wide px-1">รายการสั่งคอนกรีต</h3>
              <div className="bg-[#0F172A] rounded-[20px] p-6 mb-5 fade-in text-white relative overflow-hidden" 
                style={{ boxShadow: '0 10px 25px -5px rgba(15,23,42,0.3)' }}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                <div className="flex justify-between items-center border-b border-slate-700/50 pb-4 mb-4">
                  <p className="text-[13px] text-slate-400 font-bold uppercase tracking-wider">ปริมาณสินค้าทั้งหมด</p>
                  <p className="font-black text-white text-lg">{currentJob.qty_target} {currentJob.plan_item?.product?.unit}</p>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-[13px] text-slate-400 font-bold uppercase tracking-wider">ปริมาณคอนกรีตที่ต้องใช้</p>
                  <p className="font-black text-3xl text-blue-400">{((currentJob.plan_item?.product?.concrete_per_unit || 0) * currentJob.qty_target).toFixed(2)} <span className="text-sm font-bold text-slate-500 ml-1 uppercase">คิว</span></p>
                </div>
              </div>

              <h3 className="font-bold text-gray-600 mb-2 text-xs uppercase tracking-wide px-1">ถ่ายภาพยืนยัน <span className="text-red-500">*</span></h3>
              <div className="bg-white rounded-[20px] border border-slate-100 p-2 mb-6 relative fade-in" 
                style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07), 0 10px 20px -5px rgba(0,0,0,0.04)' }}>
                <input type="file" accept="image/*" capture="environment" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={e => handlePhotoSelect(e, `phase1-${currentJob.id}`)} />
                <div className={`w-full h-32 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${photos[`phase1-${currentJob.id}`] ? 'border-emerald-300 text-emerald-500 overflow-hidden relative' : 'border-dashed border-slate-200 text-slate-400 bg-slate-50/50'}`}>
                  {photos[`phase1-${currentJob.id}`] ? (
                    <img src={photos[`phase1-${currentJob.id}`].preview} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <><i className="fas fa-camera text-3xl mb-2"></i><span className="text-[11px] font-extrabold uppercase tracking-widest">แตะเพื่อถ่ายภาพยืนยัน</span></>
                  )}
                  {photos[`phase1-${currentJob.id}`] && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><i className="fas fa-check-circle text-white text-3xl drop-shadow-lg"></i></div>}
                </div>
              </div>

              <button disabled={!isPhase1Ready} onClick={handlePhase1Next} 
                className={`w-full py-4 rounded-2xl font-black text-base flex justify-center items-center gap-2 transition-all ${isPhase1Ready ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/30 active:scale-95' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                {currentIndex < selectedJobs.length - 1 ? `ถัดไป (คิวที่ ${currentIndex + 2}/${selectedJobs.length})` : 'สรุปเพื่อสั่งคอนกรีต'} <i className="fas fa-arrow-right ml-1"></i>
              </button>
            </div>
          )}

          {/* SECTION: Phase 1.5 Concrete Summary */}
          {activeSection === 'concreteSummary' && (
            <div className="p-4 pb-10">
              <div className="bg-white rounded-[24px] border border-black/[0.03] p-8 relative overflow-hidden fade-in"
                style={{ boxShadow: '0 10px 30px -5px rgba(0,0,0,0.08)' }}>
                <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
                <div className="text-center mb-8 mt-2">
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100 shadow-sm">
                    <i className="fas fa-receipt text-3xl text-blue-500"></i>
                  </div>
                  <h2 className="text-xl font-black text-slate-900">สรุปใบสั่งคอนกรีต</h2>
                  <p className="text-[12px] text-slate-400 font-bold uppercase tracking-wider mt-1">Ready-Mixed Concrete Order</p>
                </div>
                
                <div className="border-t-2 border-dashed border-slate-100 pt-6 mb-6 space-y-4">
                  <div className="space-y-3 mb-6 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {selectedJobs.map(j => (
                      <div key={j.id} className="flex justify-between items-center py-3 border-b border-slate-50 last:border-0">
                        <div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">แท่น: {j.bed}</div>
                          <div className="text-sm font-extrabold text-slate-800">{j.plan_item?.product?.name}</div>
                        </div>
                        <div className="text-base font-black text-blue-600">{((j.plan_item?.product?.concrete_per_unit || 0) * j.qty_target).toFixed(1)} <span className="text-[10px] uppercase ml-0.5 text-blue-400">คิว</span></div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="bg-[#0F172A] p-5 rounded-2xl flex justify-between items-center w-full shadow-lg shadow-slate-900/10">
                    <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">ปริมาณสั่งรวม</span>
                    <span className="text-3xl font-black text-blue-400">
                      {selectedJobs.reduce((sum, j) => sum + ((j.plan_item?.product?.concrete_per_unit || 0) * j.qty_target), 0).toFixed(1)} <span className="text-sm font-bold text-slate-500 uppercase ml-1">คิว</span>
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => { setCurrentIndex(0); setActiveSection('phase1') }} 
                  className="flex-1 bg-white border border-slate-200 text-slate-500 py-4 rounded-2xl font-black text-sm shadow-sm active:scale-95 transition-all">แก้ไข</button>
                <button onClick={() => setActiveSection('phase2')} 
                  className="flex-[2] bg-blue-600 text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-blue-600/30 flex items-center justify-center gap-2 active:scale-95 transition-all">
                  ส่งคำสั่งปูน <i className="fas fa-paper-plane"></i>
                </button>
              </div>
            </div>
          )}

          {/* SECTION: Phase 2 Pouring */}
          {activeSection === 'phase2' && (
            <div className="p-4 pb-10">
              <div className="mb-4"><span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-3 py-1 rounded-full border border-indigo-200">ขั้นที่ 2: เทคอนกรีต</span></div>
              <div className="bg-white rounded-[24px] border border-black/[0.03] p-8 text-center mb-6 fade-in"
                style={{ boxShadow: '0 10px 30px -5px rgba(0,0,0,0.08)' }}>
                <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-blue-100 shadow-sm">
                  <i className="fas fa-truck-monster text-4xl text-blue-500 animate-bounce"></i>
                </div>
                <h2 className="text-xl font-black text-slate-900 mb-2">ส่งคำสั่งปูนเรียบร้อยแล้ว</h2>
                <p className="text-sm text-slate-500 font-medium mb-6">รถโม่กำลังจัดส่ง {selectedJobs.reduce((sum, j) => sum + ((j.plan_item?.product?.concrete_per_unit || 0) * j.qty_target), 0).toFixed(1)} คิว</p>
                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-5 text-left">
                  <p className="font-black text-amber-800 text-[13px] mb-3 uppercase tracking-wider flex items-center gap-2"><i className="fas fa-exclamation-triangle text-amber-600"></i> ข้อควรปฏิบัติ:</p>
                  <ul className="text-xs text-amber-700 space-y-2 list-none">
                    <li className="flex items-start gap-2"><i className="fas fa-check text-[10px] mt-1"></i> ควบคุมการเทคอนกรีตลงแบบให้ทั่วถึง</li>
                    <li className="flex items-start gap-2"><i className="fas fa-check text-[10px] mt-1"></i> ใช้เครื่องจี้ปูนไล่ฟองอากาศให้หมด</li>
                    <li className="flex items-start gap-2"><i className="fas fa-check text-[10px] mt-1"></i> ปาดหน้าคอนกรีตให้เรียบสม่ำเสมอ</li>
                  </ul>
                </div>
              </div>
              
              <h3 className="font-bold text-gray-600 mb-2 text-xs uppercase tracking-wide px-1">ถ่ายภาพยืนยันการเท <span className="text-red-500">*</span></h3>
              <div className="bg-white rounded-2xl border border-gray-100 p-2 mb-5 relative fade-in">
                <input type="file" accept="image/*" capture="environment" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={e => handlePhotoSelect(e, 'phase2')} />
                <div className={`w-full h-24 rounded-xl border-2 flex flex-col items-center justify-center ${photos['phase2'] ? 'border-indigo-300 text-indigo-500 overflow-hidden relative' : 'border-dashed border-gray-200 text-gray-400 bg-gray-50'}`}>
                  {photos['phase2'] ? (
                    <img src={photos['phase2'].preview} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <><i className="fas fa-camera text-2xl mb-1"></i><span className="text-[10px] font-bold">แตะเพื่อถ่ายภาพหน้างาน</span></>
                  )}
                  {photos['phase2'] && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><i className="fas fa-check-double text-white text-2xl drop-shadow-md"></i></div>}
                </div>
              </div>

              <button disabled={!isPhase2Ready || saving} onClick={handlePhase2Submit} className={`w-full py-4 rounded-2xl font-bold text-base flex justify-center items-center gap-2 transition ${isPhase2Ready ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 active:scale-95' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}>
                {saving ? <i className="fas fa-spinner fa-spin text-xl"></i> : <><i className="fas fa-check-double text-lg"></i> ยืนยันการเทคอนกรีตเสร็จสิ้น</>}
              </button>
            </div>
          )}

          {/* SECTION: Phase 3 */}
          {activeSection === 'phase3' && currentJob && (
            <div className="p-4 pb-10">
              <div className="flex items-center justify-between mb-4">
                <button onClick={resetScanner} className="text-blue-600 font-semibold text-sm flex items-center px-3 py-1.5 bg-blue-50 rounded-xl active:bg-blue-100"><i className="fas fa-chevron-left mr-1"></i> สแกนใหม่</button>
                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-3 py-1 rounded-full border border-emerald-200">ขั้นที่ 3: ถอดแบบ ({currentIndex + 1}/{selectedJobs.length})</span>
              </div>
              
              <div className="bg-white rounded-[20px] p-5 mb-6 relative overflow-hidden fade-in border border-black/[0.03]" 
                style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07), 0 15px 30px -5px rgba(0,0,0,0.05)' }}>
                <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500"></div>
                <div className="pl-3">
                  <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mb-1">แท่นผลิต: {currentJob.bed}</p>
                  <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">{currentJob.plan_item?.product?.name}</h2>
                  <div className="bg-emerald-50/50 rounded-xl p-3 mt-4 flex items-center gap-2 border border-emerald-100/50">
                    <i className="fas fa-clock text-emerald-500 text-xs"></i>
                    <span className="text-[11px] font-black text-emerald-700 uppercase tracking-wider">พร้อมถอดแบบ (เป้าหมาย {currentJob.qty_target} {currentJob.plan_item?.product?.unit})</span>
                  </div>
                </div>
              </div>

              <h3 className="font-bold text-gray-600 mb-3 text-xs uppercase tracking-wide px-1">บันทึกผลการถอดแบบ (QC)</h3>
              
              <div className="bg-white rounded-[20px] p-5 mb-4 fade-in border border-emerald-100/50" 
                style={{ boxShadow: '0 4px 10px rgba(16,185,129,0.05)' }}>
                <div className="flex justify-between items-center mb-4">
                  <label className="font-black text-emerald-700 flex items-center gap-2 text-[13px] uppercase tracking-wider"><i className="fas fa-check-circle text-lg"></i> ยอดงานดี (QC PASS)</label>
                  <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">เป้า: {currentJob.qty_target}</span>
                </div>
                <div className="flex items-center justify-between bg-emerald-50/50 rounded-2xl p-3 border border-emerald-100/50">
                  <button type="button" onClick={() => handlePhase3Adjust(currentJob.id, 'good', -1)} className="w-14 h-14 bg-white rounded-xl shadow-sm text-emerald-600 text-2xl active:bg-emerald-100 active:scale-90 transition-all flex items-center justify-center border border-emerald-100"><i className="fas fa-minus"></i></button>
                  <input type="number" readOnly value={demoldingData[currentJob.id]?.good || 0} className="w-24 bg-transparent text-center text-5xl font-black text-emerald-800 outline-none" />
                  <button type="button" onClick={() => handlePhase3Adjust(currentJob.id, 'good', 1)} className="w-14 h-14 bg-white rounded-xl shadow-sm text-emerald-600 text-2xl active:bg-emerald-100 active:scale-90 transition-all flex items-center justify-center border border-emerald-100"><i className="fas fa-plus"></i></button>
                </div>
              </div>

              <div className="bg-white rounded-[20px] p-5 mb-5 fade-in border border-red-100/50" 
                style={{ boxShadow: '0 4px 10px rgba(239,68,68,0.05)' }}>
                <label className="font-black text-red-600 flex items-center gap-2 text-[13px] mb-4 uppercase tracking-wider"><i className="fas fa-heart-broken text-lg"></i> ยอดของเสีย (DEFECT)</label>
                <div className="flex items-center justify-between bg-red-50/50 rounded-2xl p-3 border border-red-100/50 mb-4">
                  <button type="button" onClick={() => handlePhase3Adjust(currentJob.id, 'defect', -1)} className="w-14 h-14 bg-white rounded-xl shadow-sm text-red-500 text-2xl active:bg-red-100 active:scale-90 transition-all flex items-center justify-center border border-red-100"><i className="fas fa-minus"></i></button>
                  <input type="number" readOnly value={demoldingData[currentJob.id]?.defect || 0} className="w-24 bg-transparent text-center text-5xl font-black text-red-700 outline-none" />
                  <button type="button" onClick={() => handlePhase3Adjust(currentJob.id, 'defect', 1)} className="w-14 h-14 bg-white rounded-xl shadow-sm text-red-500 text-2xl active:bg-red-100 active:scale-90 transition-all flex items-center justify-center border border-red-100"><i className="fas fa-plus"></i></button>
                </div>
                {demoldingData[currentJob.id]?.defect > 0 && (
                  <div>
                    <label className="block text-[11px] font-black text-red-800 mb-2 uppercase tracking-widest">ระบุสาเหตุความเสียหาย <span className="text-red-500">*</span></label>
                    <select value={demoldingData[currentJob.id]?.reason} onChange={e => setDemoldingData(p => ({...p, [currentJob.id]: {...p[currentJob.id], reason: e.target.value}}))} 
                      className="w-full bg-slate-50 border border-red-100 text-slate-900 rounded-xl p-4 outline-none text-base font-bold appearance-none transition-all focus:border-red-300">
                      <option value="" disabled>-- เลือกสาเหตุ --</option>
                      {DEFECT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <h3 className="font-bold text-gray-600 mb-2 text-xs uppercase tracking-wide px-1">ถ่ายภาพยืนยัน <span className="text-red-500">*</span></h3>
              <div className="bg-white rounded-2xl border border-gray-100 p-2 mb-5 relative fade-in">
                <input type="file" accept="image/*" capture="environment" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={e => handlePhotoSelect(e, `phase3-${currentJob.id}`)} />
                <div className={`w-full h-24 rounded-xl border-2 flex flex-col items-center justify-center ${photos[`phase3-${currentJob.id}`] ? 'border-emerald-300 text-emerald-500 overflow-hidden relative' : 'border-dashed border-gray-200 text-gray-400 bg-gray-50'}`}>
                  {photos[`phase3-${currentJob.id}`] ? (
                    <img src={photos[`phase3-${currentJob.id}`].preview} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <><i className="fas fa-camera text-2xl mb-1"></i><span className="text-[10px] font-bold">แตะเพื่อถ่ายภาพสินค้า (FG / Defect)</span></>
                  )}
                  {photos[`phase3-${currentJob.id}`] && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><i className="fas fa-check-circle text-white text-2xl drop-shadow-md"></i></div>}
                </div>
              </div>

              <button disabled={!isPhase3Ready} onClick={handlePhase3Next} className={`w-full py-4 rounded-2xl font-bold text-base flex justify-center items-center gap-2 transition ${isPhase3Ready ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-600/30 active:scale-95' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}>
                {currentIndex < selectedJobs.length - 1 ? 'ถัดไป' : 'สรุปยืนยันข้อมูลทั้งหมด'} <i className="fas fa-save ml-1"></i>
              </button>
            </div>
          )}

          {/* SECTION: Phase 3 Summary */}
          {activeSection === 'phase3Summary' && (
            <div className="p-4 pb-10">
              <div className="bg-white rounded-[24px] border border-black/[0.03] p-8 relative overflow-hidden fade-in"
                style={{ boxShadow: '0 10px 30px -5px rgba(0,0,0,0.08)' }}>
                <div className="absolute top-0 left-0 w-full h-2 bg-emerald-600"></div>
                <div className="text-center mb-8 mt-2">
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-sm">
                    <i className="fas fa-list-check text-3xl text-emerald-500"></i>
                  </div>
                  <h2 className="text-xl font-black text-slate-900">สรุปยอดถอดแบบ</h2>
                  <p className="text-[12px] text-slate-400 font-bold uppercase tracking-wider mt-1">Demolding & QC Summary</p>
                </div>
                
                <div className="border-t-2 border-dashed border-slate-100 pt-6 mb-6 space-y-3">
                  {selectedJobs.map(j => {
                    const entry = demoldingData[j.id];
                    return (
                      <div key={j.id} className="bg-slate-50/50 rounded-2xl p-4 mb-3 border border-slate-100/50 flex justify-between items-center transition-all">
                        <div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">แท่น {j.bed}</div>
                          <div className="text-sm font-extrabold text-slate-800">{j.plan_item?.product?.name}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-base font-black text-emerald-600"><i className="fas fa-check-circle mr-1"></i>{entry.good}</div>
                          {entry.defect > 0 && <div className="text-[11px] font-bold text-red-500"><i className="fas fa-times-circle mr-1"></i>{entry.defect}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                <button disabled={saving} onClick={handlePhase3Submit} 
                  className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-emerald-600/30 flex justify-center items-center gap-2 active:scale-95 transition-all text-sm uppercase tracking-wider">
                  {saving ? <i className="fas fa-spinner fa-spin text-xl"></i> : <>บันทึกและเข้าคลัง FG <i className="fas fa-paper-plane ml-1"></i></>}
                </button>
                <button onClick={() => { setCurrentIndex(0); setActiveSection('phase3'); }} 
                  className="w-full mt-4 bg-white border border-slate-200 text-slate-500 py-4 rounded-2xl font-black text-sm active:scale-95 transition-all uppercase tracking-wider">ย้อนกลับ</button>
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
                          </h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <i className="fas fa-map-marker-alt" style={{ color: '#3B82F6' }}></i> แท่น {j.bed}
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
