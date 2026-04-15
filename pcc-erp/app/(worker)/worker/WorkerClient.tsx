'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

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
    <div className="bg-slate-100 h-[100dvh] w-screen overflow-hidden flex justify-center text-sm">
      <div className="w-full h-full max-w-md bg-slate-100 flex flex-col relative sm:shadow-2xl sm:border-x border-gray-200 overflow-hidden">
        
        {/* App Header */}
        <header className="bg-white px-5 pt-8 pb-4 flex items-center gap-3 shadow-sm border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => router.push('/')}>
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <i className="fas fa-industry text-white text-xs"></i>
            </div>
            <span className="font-bold text-xs text-blue-900">PCC<span className="text-blue-500">ERP</span></span>
          </div>
          <div className="flex-1"></div>
          <button className="w-11 h-11 rounded-[12px] bg-slate-50 border border-gray-200 flex items-center justify-center relative flex-shrink-0">
            <i className="far fa-bell text-gray-500 text-lg"></i>
            <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
          </button>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-11 h-11 rounded-full border-2 border-blue-100 p-[2px]">
              <img src="https://ui-avatars.com/api/?name=Worker&background=random" alt="Profile" className="w-full h-full rounded-full object-cover" />
            </div>
            <div>
              <div className="font-bold text-base text-gray-900 leading-tight">{userProfile?.full_name || 'Worker'}</div>
              <div className="text-xs text-gray-400 font-medium mt-0.5">{userProfile?.role === 'worker' ? 'พนักงานผลิต' : userProfile?.role}</div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-slate-100" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
          
          {/* Active Tab: SCANNER */}
          {activeTab === 'scanner' && activeSection === 'scanner' && (
            <div className="p-5 h-full flex flex-col justify-center">
              <div className="text-center mb-6">
                <h2 className="font-bold text-xl text-gray-800 mb-1">สแกนใบสั่งผลิต</h2>
                <p className="text-sm text-gray-500">นำกล้องสแกน QR Code เพื่อดึงข้อมูลงาน</p>
              </div>
              <div className="relative w-full aspect-square max-w-[260px] mx-auto bg-slate-900 rounded-3xl overflow-hidden shadow-xl mb-8 border-4 border-slate-200">
                <div className="absolute inset-0 bg-black/40"></div>
                <div className="absolute top-6 left-6 w-10 h-10 border-t-4 border-l-4 border-blue-400 rounded-tl-xl"></div>
                <div className="absolute top-6 right-6 w-10 h-10 border-t-4 border-r-4 border-blue-400 rounded-tr-xl"></div>
                <div className="absolute bottom-6 left-6 w-10 h-10 border-b-4 border-l-4 border-blue-400 rounded-bl-xl"></div>
                <div className="absolute bottom-6 right-6 w-10 h-10 border-b-4 border-r-4 border-blue-400 rounded-br-xl"></div>
                <div className="absolute left-6 right-6 h-0.5 bg-emerald-400 shadow-[0_0_10px_#34d399] animate-scan z-10"></div>
                <div className="absolute inset-0 flex items-center justify-center opacity-20">
                  <i className="fas fa-qrcode text-6xl text-white"></i>
                </div>
              </div>
              
              <div className="flex flex-col gap-3 max-w-[260px] mx-auto w-full">
                <p className="text-[10px] text-center font-bold text-gray-400 uppercase tracking-widest">จำลองการสแกน</p>
                <button onClick={() => simulateScan('casting')}
                  className="w-full bg-blue-600 text-white py-3.5 rounded-2xl font-bold shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition text-sm active:scale-95 flex items-center justify-center gap-2">
                  <i className="fas fa-play-circle"></i> สแกนเริ่มงาน (ขั้น 1-2)
                </button>
                <button onClick={() => simulateScan('demolding')}
                  className="w-full bg-emerald-600 text-white py-3.5 rounded-2xl font-bold shadow-lg shadow-emerald-600/30 hover:bg-emerald-700 transition text-sm active:scale-95 flex items-center justify-center gap-2">
                  <i className="fas fa-hammer"></i> สแกนถอดแบบ (ขั้น 3)
                </button>
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

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4 relative overflow-hidden fade-in">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500 rounded-l-2xl"></div>
                <div className="pl-3">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">แท่น: {currentJob.bed}</p>
                  <h2 className="text-xl font-bold text-gray-900 mt-0.5">{currentJob.plan_item?.product?.name}</h2>
                  <div className="bg-blue-50 rounded-xl p-3 mt-3 flex justify-between items-center border border-blue-100">
                    <span className="text-sm font-semibold text-blue-800">เป้าหมายวันนี้</span>
                    <span className="text-xl font-bold text-blue-700">{currentJob.qty_target} <span className="text-sm font-normal text-blue-500">{currentJob.plan_item?.product?.unit}</span></span>
                  </div>
                </div>
              </div>

              <h3 className="font-bold text-gray-600 mb-2 text-xs uppercase tracking-wide px-1 mt-4">ตรวจสอบความพร้อม</h3>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 mb-4 fade-in">
                <label className="flex items-start p-3 hover:bg-gray-50 rounded-xl cursor-pointer border-b border-gray-100">
                  <input type="checkbox" className="custom-checkbox mt-0.5 mr-3 flex-shrink-0" checked={phase1Checks.clean} onChange={e => setPhase1Checks(p => ({...p, clean: e.target.checked}))} />
                  <div>
                    <p className="font-bold text-gray-800 text-sm">ทำความสะอาดและทาน้ำยาแม่พิมพ์</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">ตรวจสอบความสะอาดของแท่นเทปูน</p>
                  </div>
                </label>
                <label className="flex items-start p-3 hover:bg-gray-50 rounded-xl cursor-pointer">
                  <input type="checkbox" className="custom-checkbox mt-0.5 mr-3 flex-shrink-0" checked={phase1Checks.wip} onChange={e => setPhase1Checks(p => ({...p, wip: e.target.checked}))} />
                  <div>
                    <p className="font-bold text-gray-800 text-sm">จัดวางโครงเหล็ก (WIP) ครบถ้วน</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">ตรงตามรหัสเป้าหมาย</p>
                  </div>
                </label>
              </div>

              <h3 className="font-bold text-gray-600 mb-2 text-xs uppercase tracking-wide px-1">รายการสั่งคอนกรีต</h3>
              <div className="bg-slate-800 rounded-2xl p-4 mb-4 fade-in text-white">
                <div className="flex justify-between items-center border-b border-slate-600 pb-3 mb-3">
                  <p className="text-sm text-slate-300">ปริมาณ {currentJob.plan_item?.product?.unit}</p>
                  <p className="font-bold text-white">{currentJob.qty_target}</p>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-slate-300">ปริมาณคอนกรีต</p>
                  <p className="font-bold text-2xl text-blue-400">{((currentJob.plan_item?.product?.concrete_per_unit || 0) * currentJob.qty_target).toFixed(2)} <span className="text-sm font-normal text-slate-300">คิว</span></p>
                </div>
              </div>

              <h3 className="font-bold text-gray-600 mb-2 text-xs uppercase tracking-wide px-1">ถ่ายภาพยืนยัน <span className="text-red-500">*</span></h3>
              <div className="bg-white rounded-2xl border border-gray-100 p-2 mb-5 relative fade-in">
                <input type="file" accept="image/*" capture="environment" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={e => handlePhotoSelect(e, `phase1-${currentJob.id}`)} />
                <div className={`w-full h-24 rounded-xl border-2 flex flex-col items-center justify-center ${photos[`phase1-${currentJob.id}`] ? 'border-emerald-300 text-emerald-500 overflow-hidden relative' : 'border-dashed border-gray-200 text-gray-400 bg-gray-50'}`}>
                  {photos[`phase1-${currentJob.id}`] ? (
                    <img src={photos[`phase1-${currentJob.id}`].preview} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <><i className="fas fa-camera text-2xl mb-1"></i><span className="text-[10px] font-bold">แตะเพื่อถ่ายภาพ</span></>
                  )}
                  {photos[`phase1-${currentJob.id}`] && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><i className="fas fa-check-circle text-white text-2xl drop-shadow-md"></i></div>}
                </div>
              </div>

              <button disabled={!isPhase1Ready} onClick={handlePhase1Next} 
                className={`w-full py-4 rounded-2xl font-bold text-base flex justify-center items-center gap-2 transition ${isPhase1Ready ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/30 active:scale-95' : 'bg-blue-100 text-blue-300 cursor-not-allowed'}`}>
                {currentIndex < selectedJobs.length - 1 ? `ถัดไป (คิวที่ ${currentIndex + 2}/${selectedJobs.length})` : 'สรุปเพื่อสั่งคอนกรีต'} <i className="fas fa-arrow-right ml-1"></i>
              </button>
            </div>
          )}

          {/* SECTION: Phase 1.5 Concrete Summary */}
          {activeSection === 'concreteSummary' && (
            <div className="p-4 pb-10">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 relative overflow-hidden fade-in">
                <div className="absolute top-0 left-0 w-full h-2 bg-blue-600 rounded-t-2xl"></div>
                <div className="text-center mb-5 mt-2">
                  <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3"><i className="fas fa-receipt text-2xl text-blue-500"></i></div>
                  <h2 className="text-lg font-bold text-gray-900">ใบสั่งคอนกรีตผสมเสร็จ</h2>
                  <p className="text-[11px] text-gray-400 mt-1">ส่งให้คนขับรถโม่</p>
                </div>
                <div className="border-t-2 border-dashed border-gray-200 pt-4 mb-4 space-y-3">
                  <div className="space-y-2 mb-3 max-h-32 overflow-y-auto w-full">
                    {selectedJobs.map(j => (
                      <div key={j.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                        <div>
                          <div className="text-[10px] font-bold text-gray-400">แท่น: {j.bed}</div>
                          <div className="text-xs font-bold text-gray-800">{j.plan_item?.product?.name}</div>
                        </div>
                        <div className="text-sm font-bold text-blue-600">{((j.plan_item?.product?.concrete_per_unit || 0) * j.qty_target).toFixed(1)} คิว</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center bg-blue-50 p-3 rounded-xl border border-blue-100 w-full">
                    <span className="text-sm font-bold text-blue-800">ปริมาณสั่งรวม:</span>
                    <span className="text-2xl font-bold text-blue-600">
                      {selectedJobs.reduce((sum, j) => sum + ((j.plan_item?.product?.concrete_per_unit || 0) * j.qty_target), 0).toFixed(1)} <span className="text-sm font-normal text-blue-400">คิว</span>
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => { setCurrentIndex(0); setActiveSection('phase1') }} className="flex-1 bg-white border border-gray-200 text-gray-600 py-3.5 rounded-2xl font-bold shadow-sm text-sm active:scale-95">แก้ไข</button>
                <button onClick={() => setActiveSection('phase2')} className="flex-[2] bg-blue-600 text-white py-3.5 rounded-2xl font-bold shadow-lg shadow-blue-600/30 text-sm flex items-center justify-center gap-2 active:scale-95">ส่งคำสั่งปูน <i className="fas fa-paper-plane"></i></button>
              </div>
            </div>
          )}

          {/* SECTION: Phase 2 Pouring */}
          {activeSection === 'phase2' && (
            <div className="p-4 pb-10">
              <div className="mb-4"><span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-3 py-1 rounded-full border border-indigo-200">ขั้นที่ 2: เทคอนกรีต</span></div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center mb-4 fade-in">
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-blue-100">
                  <i className="fas fa-truck-monster text-3xl text-blue-500 animate-bounce"></i>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">ส่งคำสั่งปูนเรียบร้อยแล้ว</h2>
                <p className="text-sm text-gray-400 mb-4">รถโม่กำลังจัดส่ง {selectedJobs.reduce((sum, j) => sum + ((j.plan_item?.product?.concrete_per_unit || 0) * j.qty_target), 0).toFixed(1)} คิว</p>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-left">
                  <p className="font-bold text-amber-800 text-sm mb-2"><i className="fas fa-exclamation-triangle mr-1"></i> งานที่ต้องทำ:</p>
                  <ul className="text-xs text-amber-700 space-y-1 list-disc pl-4">
                    <li>ควบคุมการเทคอนกรีตลงแบบ</li>
                    <li>ใช้เครื่องจี้ปูน (Vibrator) ไล่ฟองอากาศ</li>
                    <li>ปาดหน้าคอนกรีตให้เรียบ</li>
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
              
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4 relative overflow-hidden fade-in">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500 rounded-l-2xl"></div>
                <div className="pl-3">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">แท่น: {currentJob.bed}</p>
                  <h2 className="text-xl font-bold text-gray-900 mt-0.5">{currentJob.plan_item?.product?.name}</h2>
                  <p className="text-xs text-emerald-600 font-bold mt-2"><i className="fas fa-clock mr-1"></i> พร้อมถอดแบบ (เป้า {currentJob.qty_target})</p>
                </div>
              </div>

              <h3 className="font-bold text-gray-600 mb-3 text-xs uppercase tracking-wide px-1">บันทึกผลการถอดแบบ (QC)</h3>
              
              <div className="bg-white rounded-2xl shadow-sm border-2 border-emerald-100 p-4 mb-3 fade-in">
                <div className="flex justify-between items-center mb-3">
                  <label className="font-bold text-emerald-700 flex items-center gap-2 text-sm"><i className="fas fa-check-circle text-lg"></i> ยอดงานดี (ผ่าน QC)</label>
                  <span className="text-xs text-gray-400 font-semibold">เป้า: {currentJob.qty_target}</span>
                </div>
                <div className="flex items-center justify-between bg-emerald-50 rounded-xl p-2 border border-emerald-100">
                  <button type="button" onClick={() => handlePhase3Adjust(currentJob.id, 'good', -1)} className="w-14 h-14 bg-white rounded-xl shadow-sm text-emerald-600 text-2xl active:bg-emerald-100 active:scale-95 transition-transform flex items-center justify-center"><i className="fas fa-minus"></i></button>
                  <input type="number" readOnly value={demoldingData[currentJob.id]?.good || 0} className="w-20 bg-transparent text-center text-4xl font-bold text-emerald-800 outline-none" />
                  <button type="button" onClick={() => handlePhase3Adjust(currentJob.id, 'good', 1)} className="w-14 h-14 bg-white rounded-xl shadow-sm text-emerald-600 text-2xl active:bg-emerald-100 active:scale-95 transition-transform flex items-center justify-center"><i className="fas fa-plus"></i></button>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border-2 border-red-100 p-4 mb-4 fade-in">
                <label className="font-bold text-red-600 flex items-center gap-2 text-sm mb-3"><i className="fas fa-heart-broken text-lg"></i> ยอดของเสีย (Defect)</label>
                <div className="flex items-center justify-between bg-red-50 rounded-xl p-2 border border-red-100 mb-3">
                  <button type="button" onClick={() => handlePhase3Adjust(currentJob.id, 'defect', -1)} className="w-14 h-14 bg-white rounded-xl shadow-sm text-red-500 text-2xl active:bg-red-100 active:scale-95 transition-transform flex items-center justify-center"><i className="fas fa-minus"></i></button>
                  <input type="number" readOnly value={demoldingData[currentJob.id]?.defect || 0} className="w-20 bg-transparent text-center text-4xl font-bold text-red-700 outline-none" />
                  <button type="button" onClick={() => handlePhase3Adjust(currentJob.id, 'defect', 1)} className="w-14 h-14 bg-white rounded-xl shadow-sm text-red-500 text-2xl active:bg-red-100 active:scale-95 transition-transform flex items-center justify-center"><i className="fas fa-plus"></i></button>
                </div>
                {demoldingData[currentJob.id]?.defect > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-red-800 mb-1.5">ระบุสาเหตุ <span className="text-red-500">*</span></label>
                    <select value={demoldingData[currentJob.id]?.reason} onChange={e => setDemoldingData(p => ({...p, [currentJob.id]: {...p[currentJob.id], reason: e.target.value}}))} className="w-full bg-white border border-red-200 text-gray-800 rounded-xl p-4 outline-none text-base font-semibold appearance-none">
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
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 relative overflow-hidden fade-in">
                <div className="absolute top-0 left-0 w-full h-2 bg-emerald-600 rounded-t-2xl"></div>
                <div className="text-center mb-5 mt-2">
                  <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3"><i className="fas fa-list-check text-2xl text-emerald-500"></i></div>
                  <h2 className="text-lg font-bold text-gray-900">สรุปยอดงานถอดแบบ (QC)</h2>
                  <p className="text-[11px] text-gray-400 mt-1">ยืนยันรายการสินค้าเข้าคลัง FG</p>
                </div>
                
                <div className="border-t-2 border-dashed border-gray-200 pt-4 mb-4 space-y-3">
                  {selectedJobs.map(j => {
                    const entry = demoldingData[j.id];
                    return (
                      <div key={j.id} className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-100 flex justify-between items-center">
                        <div><div className="text-[10px] font-bold text-gray-500">แท่น {j.bed}</div><div className="text-xs font-bold">{j.plan_item?.product?.name}</div></div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-emerald-600"><i className="fas fa-check-circle"></i> {entry.good}</div>
                          {entry.defect > 0 && <div className="text-[10px] font-semibold text-red-500"><i className="fas fa-times-circle"></i> {entry.defect}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                <button disabled={saving} onClick={handlePhase3Submit} className="w-full bg-emerald-600 text-white py-3.5 rounded-2xl font-bold shadow-lg shadow-emerald-600/30 flex justify-center items-center gap-2 active:scale-95 mt-5">
                  {saving ? <i className="fas fa-spinner fa-spin"></i> : <>บันทึกและส่งเข้าคลัง FG <i className="fas fa-paper-plane"></i></>}
                </button>
                <button onClick={() => { setCurrentIndex(0); setActiveSection('phase3'); }} className="w-full mt-3 bg-white border border-gray-200 text-gray-600 py-3.5 rounded-2xl font-bold shadow-sm text-sm active:scale-95">ย้อนกลับ</button>
              </div>
            </div>
          )}

          {/* SECTION: Success */}
          {activeSection === 'success' && (
            <div className="p-5 h-full flex flex-col justify-center items-center text-center pb-20">
              <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6 border-4 border-white shadow-lg fade-in">
                <i className="fas fa-check text-5xl text-emerald-500"></i>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2 fade-in">สำเร็จ!</h2>
              <p className="text-sm text-gray-500 mb-8 fade-in">ระบบบันทึกข้อมูลเรียบร้อยแล้ว {phaseMode === 'casting' && 'ระบบเริ่มนับเวลาบ่มแล้ว'}</p>
              <button onClick={() => window.location.reload()} className="bg-blue-600 text-white py-3.5 px-10 rounded-2xl font-bold shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition active:scale-95 fade-in">
                หน้าหลัก
              </button>
            </div>
          )}

          {/* Active Tab: DAILY JOBS */}
          {activeTab === 'dailyJobs' && (
            <div className="p-4 pb-10 fade-in">
              <div className="mb-5 flex justify-between items-center">
                <div>
                  <h2 className="font-bold text-xl text-gray-800">คิวงานของคุณ</h2>
                  <p className="text-sm text-gray-400">สถานะงานในสายการผลิต</p>
                </div>
                <div className="bg-blue-100 text-blue-700 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm">{jobOrders.length}</div>
              </div>
              
              {jobOrders.length === 0 ? (
                 <div className="text-center p-8 bg-white rounded-xl border border-dashed border-gray-200 text-gray-400">ไม่มีคิวงาน</div>
              ) : jobOrders.map(j => (
                <div key={j.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-3 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-gray-800">{j.plan_item?.product?.name}</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5"><i className="fas fa-map-marker-alt mr-1"></i> แท่น {j.bed} | เป้า: {j.qty_target}</p>
                  </div>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold flex-shrink-0 ${
                    j.status === 'pending' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                    j.status === 'casting' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' :
                    j.status === 'curing' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                    j.status === 'ready_demold' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                    'bg-gray-100 text-gray-500 border border-gray-200'
                  }`}>
                    {j.status === 'pending' && 'รอเทปูน'}
                    {j.status === 'casting' && 'กำลังเทปูน'}
                    {j.status === 'curing' && 'กำลังบ่ม'}
                    {j.status === 'ready_demold' && 'พร้อมถอดแบบ'}
                    {j.status === 'demolded' && 'เสร็จสิ้น'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Bottom Nav */}
        <nav className="absolute bottom-0 left-0 w-full bg-white border-t border-gray-200 flex justify-around items-center pt-3 z-20 shadow-[0_-10px_25px_rgba(0,0,0,0.08)]" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <button onClick={() => { setActiveTab('scanner'); setActiveSection('scanner') }} className={`flex flex-col items-center p-3 flex-1 relative group transition-all ${activeTab === 'scanner' ? 'text-blue-600' : 'text-gray-400'}`}>
            {activeTab === 'scanner' ? (
              <>
                <div className="absolute -top-7 bg-blue-600 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-4 border-slate-100 scale-110"><i className="fas fa-qrcode text-2xl"></i></div>
                <span className="text-xs font-bold mt-7">สแกนงาน</span>
              </>
            ) : (
              <><i className="fas fa-qrcode text-2xl mb-1 mt-2"></i><span className="text-xs font-bold">สแกนงาน</span></>
            )}
          </button>
          
          <button onClick={() => setActiveTab('dailyJobs')} className={`flex flex-col items-center p-3 flex-1 transition-all ${activeTab === 'dailyJobs' ? 'text-blue-600' : 'text-gray-400 mt-1'}`}>
            <i className="fas fa-clipboard-list text-2xl mb-1"></i><span className="text-xs font-bold">งานวันนี้</span>
          </button>
          
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login'; }} className="flex flex-col items-center p-3 text-gray-400 hover:text-slate-700 flex-1 mt-1">
            <i className="fas fa-home text-2xl mb-1"></i><span className="text-xs font-bold">ออก</span>
          </button>
        </nav>
      </div>
    </div>
  )
}
