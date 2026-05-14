'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { receiveConcreteRound } from '@/app/actions/concrete'

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
    product: { 
      id: string; code: string; name: string; size?: string; category: string; unit: string; 
      concrete_per_unit?: number; wire_per_unit?: number; mesh_per_unit?: number; rebar_per_unit?: number;
    } | null
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

  const [activeTab, setActiveTab] = useState<'dailyJobs'|'receiveConcreteTab'|'history'>('dailyJobs')
  const [activeSection, setActiveSection] = useState<'phase1'|'concreteSummary'|'success' | null>(null)
  
  const [phaseMode, setPhaseMode] = useState<'casting' | 'demolding' | null>(null)
  const [selectedJobs, setSelectedJobs] = useState<Job[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentBedIndex, setCurrentBedIndex] = useState(0)

  const jobsByBed = React.useMemo(() => {
    const groups: Record<string, Job[]> = {}
    selectedJobs.forEach(job => {
      if (!groups[job.bed]) groups[job.bed] = []
      groups[job.bed].push(job)
    })
    return Object.keys(groups).sort().map(bed => ({ bed, jobs: groups[bed] }))
  }, [selectedJobs])

  // Data
  const [phase1Checks, setPhase1Checks] = useState({ clean: false, wip: false })
  const [photos, setPhotos] = useState<Record<string, { file: File, preview: string }>>({})
  const [demoldingData, setDemoldingData] = useState<Record<string, { good: number, defect: number, reason: string }>>({})
  const [saving, setSaving] = useState(false)
  const [userProfile, setUserProfile] = useState<{full_name: string, role: string} | null>(null)

  // Daily Jobs — per-item checklist, photo, expand state
  const [jobItemChecks, setJobItemChecks] = useState<Record<string, { clean: boolean; wip: boolean }>>({ })
  const [jobItemPhotos, setJobItemPhotos] = useState<Record<string, { file: File; preview: string }>>({ })
  const [materialsByPlan, setMaterialsByPlan] = useState<Record<string, {name: string}[]>>({})
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)

  // Receive Concrete — DB-driven
  const [concreteSent, setConcreteSent] = useState(false)
  const [concreteRoundsReceived, setConcreteRoundsReceived] = useState(0)
  const [activeConcreteOrders, setActiveConcreteOrders] = useState<{
    id: string; job_order_id: string; bed: string | null; qty_requested: number; round_count: number; requested_at: string;
    job_order?: { bed: string; status: string; plan_item?: { product?: { name: string } | null } | null } | null
    rounds: { id: string; round_number: number; qty_per_round: number; status: string; supplied_at: string | null }[]
  }[]>([])
  const [concreteLoading, setConcreteLoading] = useState(false)

  useEffect(() => {
    async function fetchMaterials() {
      const planIds = Array.from(new Set(jobOrders.map(j => j.plan_item?.plan_id || (j.plan_item_id && planItemToPlanMap ? planItemToPlanMap[j.plan_item_id] : null)).filter(Boolean)))
      if (planIds.length === 0) return
      
      const { data, error } = await supabase.from('plan_materials').select('plan_id, raw_material:raw_materials(name)').in('plan_id', planIds as string[])
      console.log('fetchMaterials data:', data, 'error:', error)
      
      const newMap: Record<string, {name: string}[]> = {}
      data?.forEach((d: any) => {
        if (!newMap[d.plan_id]) newMap[d.plan_id] = []
        if (d.raw_material?.name) newMap[d.plan_id].push({ name: d.raw_material.name })
      })
      setMaterialsByPlan(newMap)
    }
    fetchMaterials()
  }, [jobOrders, planItemToPlanMap])

  useEffect(() => {
    toast.success("✅ ระบบพร้อมใช้งาน (React กำลังทำงาน!)", { id: 'debug-toast' })
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('full_name, role').eq('id', user.id).single()
          .then(({ data }) => {
            if (data) setUserProfile({ full_name: data.full_name, role: data.role })
          })
          .catch((err) => console.error("Profile fetch error:", err))
      }
    }).catch((err) => console.error("Auth error:", err))
  }, [supabase])



  const resetScanner = () => {
    setActiveTab('dailyJobs')
    setActiveSection(null)
    setPhaseMode(null)
    setSelectedJobs([])
    setCurrentIndex(0)
    setCurrentBedIndex(0)
    setPhase1Checks({ clean: false, wip: false })
    setPhotos({})
    setDemoldingData({})
  }

  // ── Computed: คอนกรีตรวม & จำนวนรอบ ──────────────────────────────────
  const totalConcreteQty = jobOrders.reduce(
    (sum, j) => sum + ((j.plan_item?.product?.concrete_per_unit || 0) * j.qty_target), 0
  )
  const totalRounds = Math.ceil(totalConcreteQty)

  // ทุก job มี checklist ครบ + มีรูป
  const allJobsReady = jobOrders.length > 0 && jobOrders.every(j => {
    const checks = jobItemChecks[j.id]
    const photo = jobItemPhotos[j.id]
    return checks?.clean && checks?.wip && !!photo
  })

  const handleJobItemPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>, jobId: string) => {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    setJobItemPhotos(prev => ({ ...prev, [jobId]: { file, preview } }))
  }

  const handleOrderConcrete = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const groups: Record<string, Job[]> = {}
      jobOrders.forEach(job => {
        if (!groups[job.bed]) groups[job.bed] = []
        groups[job.bed].push(job)
      })

      for (const bed of Object.keys(groups)) {
        const bedJobs = groups[bed]
        let totalConcreteQty = 0
        
        for (const job of bedJobs) {
          const photo = jobItemPhotos[job.id]
          const photoUrl = photo ? await uploadPhoto(photo.file, 'preparation') : null
          const jobConcreteQty = (job.plan_item?.product?.concrete_per_unit || 0) * job.qty_target
          totalConcreteQty += jobConcreteQty

          await supabase.from('job_orders').update({
            status: 'concrete_ordered',
            cast_at: new Date().toISOString(),
            qty_cast: job.qty_target,
            photo_ready_url: photoUrl,
          }).eq('id', job.id)
        }

        const bedRounds = Math.ceil(totalConcreteQty)

        if (bedRounds > 0) {
          const { data: order } = await supabase.from('concrete_orders').insert({
            bed,
            requested_by: user.id,
            qty_requested: totalConcreteQty,
            round_count: bedRounds,
            status: 'requested',
          }).select('id').single()

          if (order?.id) {
            const rounds = Array.from({ length: bedRounds }, (_, i) => ({
              concrete_order_id: order.id,
              round_number: i + 1,
              qty_per_round: i < bedRounds - 1 ? 1 : totalConcreteQty - Math.floor(totalConcreteQty) || 1,
              status: 'pending',
            }))
            await supabase.from('concrete_rounds').insert(rounds)
          }
        }
      }

      setConcreteSent(true)
      setConcreteRoundsReceived(0)
      await fetchActiveConcreteOrders()
      setActiveTab('receiveConcreteTab')
      toast.success('ส่งคำสั่งคอนกรีตเรียบร้อย!')
      router.refresh()
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const fetchActiveConcreteOrders = async () => {
    setConcreteLoading(true)
    try {
      const { data } = await supabase
        .from('concrete_orders')
        .select(`id, job_order_id, bed, qty_requested, round_count, requested_at,
          job_order:job_orders(id, bed, status, plan_item:production_plan_items(product:products(name))),
          rounds:concrete_rounds(id, round_number, qty_per_round, status, supplied_at)`)
        .in('status', ['requested', 'supplied'])
        .order('requested_at', { ascending: true })
      if (data) {
        const sorted = data.map((o: any) => ({
          ...o,
          rounds: (o.rounds ?? []).sort((a: any, b: any) => a.round_number - b.round_number),
        })).filter((o: any) => o.rounds.some((r: any) => r.status !== 'received'))
        setActiveConcreteOrders(sorted)
        const allReceived = sorted.reduce((s: number, o: any) => s + o.rounds.filter((r: any) => r.status === 'received').length, 0)
        setConcreteRoundsReceived(allReceived)
        setConcreteSent(sorted.length > 0)
      }
    } finally {
      setConcreteLoading(false)
    }
  }

  const [receivingId, setReceivingId] = useState<string | null>(null)
  const handleReceiveRound = async (roundId: string) => {
    setReceivingId(roundId)
    try {
      await receiveConcreteRound(roundId)
      toast.success('รับคอนกรีตสำเร็จ')
      await fetchActiveConcreteOrders()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setReceivingId(null)
    }
  }

  useEffect(() => {
    fetchActiveConcreteOrders()
    const interval = setInterval(fetchActiveConcreteOrders, 8000)
    return () => clearInterval(interval)
  }, [])



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

  const isPhase1Ready = phase1Checks.clean && phase1Checks.wip && photos[`phase1-${currentJob?.id}`]

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
          {activeSection === 'concreteSummary' && jobsByBed.length > 0 && (
            <div style={{ padding: '24px 20px', maxWidth: '480px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', border: '1px solid rgba(0,0,0,0.04)', padding: '32px', position: 'relative', overflow: 'hidden', boxShadow: '0 15px 35px -5px rgba(0,0,0,0.08)' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '8px', backgroundColor: '#2563EB' }}></div>
                <div style={{ textAlign: 'center', marginBottom: '32px', marginTop: '8px' }}>
                  <div style={{ width: '72px', height: '72px', backgroundColor: '#EFF6FF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid #DBEAFE', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                    <i className="fas fa-receipt" style={{ fontSize: '32px', color: '#3B82F6' }}></i>
                  </div>
                  <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.3px' }}>สรุปใบสั่งคอนกรีต โรง {jobsByBed[currentBedIndex].bed}</h2>
                  <p style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '4px' }}>Ready-Mixed Concrete Order ({currentBedIndex + 1}/{jobsByBed.length})</p>
                </div>
                
                <div style={{ borderTop: '2px dashed #F1F5F9', paddingTop: '24px', marginBottom: '24px' }}>
                  <div style={{ marginBottom: '24px', maxHeight: '200px', overflowY: 'auto', paddingRight: '8px' }} className="custom-scrollbar">
                    {jobsByBed[currentBedIndex].jobs.map(j => (
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
                      {jobsByBed[currentBedIndex].jobs.reduce((sum, j) => sum + ((j.plan_item?.product?.concrete_per_unit || 0) * j.qty_target), 0).toFixed(1)} <span style={{ fontSize: '16px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginLeft: '6px' }}>คิว</span>
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button disabled={saving} onClick={() => { setCurrentIndex(0); setCurrentBedIndex(0); setActiveSection('phase1') }} 
                  style={{ flex: 1, backgroundColor: '#ffffff', border: '1px solid #E2E8F0', color: '#64748B', padding: '16px', borderRadius: '16px', fontWeight: 800, fontSize: '15px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  แก้ไข
                </button>
                <button disabled={saving} onClick={async () => {
                  setSaving(true)
                  try {
                    const { data: { user } } = await supabase.auth.getUser()
                    const bedJobs = jobsByBed[currentBedIndex].jobs
                    const bed = jobsByBed[currentBedIndex].bed
                    
                    let totalConcreteQty = 0
                    for (const job of bedJobs) {
                      const p1PhotoUrl = photos[`phase1-${job.id}`] ? await uploadPhoto(photos[`phase1-${job.id}`].file, 'preparation') : null
                      const jobConcreteQty = (job.plan_item?.product?.concrete_per_unit || 0) * job.qty_target
                      totalConcreteQty += jobConcreteQty
                      await supabase.from('job_orders').update({
                        status: 'concrete_ordered',
                        cast_at: new Date().toISOString(),
                        qty_cast: job.qty_target,
                        photo_ready_url: p1PhotoUrl,
                      }).eq('id', job.id)
                    }

                    const bedRounds = Math.ceil(totalConcreteQty)
                    if (bedRounds > 0) {
                      const { data: order } = await supabase.from('concrete_orders').insert({
                        bed,
                        requested_by: user!.id,
                        qty_requested: totalConcreteQty,
                        round_count: bedRounds,
                        status: 'requested',
                      }).select('id').single()

                      if (order?.id) {
                        const rounds = Array.from({ length: bedRounds }, (_, i) => ({
                          concrete_order_id: order.id,
                          round_number: i + 1,
                          qty_per_round: i < bedRounds - 1 ? 1 : totalConcreteQty - Math.floor(totalConcreteQty) || 1,
                          status: 'pending',
                        }))
                        await supabase.from('concrete_rounds').insert(rounds)
                      }
                    }
                    if (currentBedIndex < jobsByBed.length - 1) {
                      setCurrentBedIndex(currentBedIndex + 1)
                    } else {
                      setActiveSection('success')
                    }
                  } catch(e:any) {
                    toast.error(e.message)
                  } finally {
                    setSaving(false)
                  }
                }} 
                  style={{ flex: 2, backgroundColor: '#2563EB', color: '#ffffff', padding: '16px', borderRadius: '16px', fontWeight: 900, fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer', boxShadow: '0 10px 20px -5px rgba(37,99,235,0.4)', border: 'none' }}>
                  {saving ? <i className="fas fa-spinner fa-spin"></i> : <>{currentBedIndex < jobsByBed.length - 1 ? 'ถัดไป' : 'ส่งคำสั่งปูน'} <i className="fas fa-paper-plane" style={{ marginLeft: '4px' }}></i></>}
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
                รอทีม QC เข้าตรวจสอบ
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
                  {(() => {
                    const uniqueOrderNumbers = Array.from(new Set(jobOrders.map((j: any) => j.production_order?.order_number).filter(Boolean)))
                    if (uniqueOrderNumbers.length > 0) {
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                          {uniqueOrderNumbers.map(po => (
                            <span key={po} style={{ fontSize: '12px', fontWeight: 700, backgroundColor: '#F1F5F9', color: '#475569', padding: '3px 8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                              <i className="fas fa-file-invoice" style={{ marginRight: '4px', color: '#64748B' }}></i>
                              ใบสั่งผลิต: {po}
                            </span>
                          ))}
                        </div>
                      )
                    }
                    return <p style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 500, marginTop: '4px' }}>รายการงานผลิตในความรับผิดชอบ</p>
                  })()}
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
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {jobOrders.map(j => {
                    const isExpanded = expandedJobId === j.id
                    const checks = jobItemChecks[j.id] || { clean: false, wip: false }
                    const photo = jobItemPhotos[j.id]
                    const isJobReady = checks.clean && checks.wip && !!photo
                    
                    const planId = j.plan_item?.plan_id || (j.plan_item_id && planItemToPlanMap ? planItemToPlanMap[j.plan_item_id] : null)
                    const materials = planId ? materialsByPlan[planId] || [] : []
                    console.log('Job:', j.id, 'Plan:', planId, 'Materials:', materials)
                    
                    const getStatusDisplay = () => {
                      if (j.status === 'pending') {
                        return isJobReady 
                          ? { label: 'ดำเนินการแล้ว', bg: '#DCFCE7', color: '#166534', border: '#86EFAC' }
                          : { label: 'รอดำเนินการ', bg: '#F1F5F9', color: '#475569', border: '#CBD5E1' }
                      }
                      const statusMap: Record<string, { label: string; bg: string; color: string; border: string }> = {
                        concrete_ordered: { label: 'รอรับคอนกรีต', bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' },
                        casting:      { label: 'รอเทคอนกรีต',  bg: '#DBEAFE', color: '#1E40AF', border: '#93C5FD' },
                        curing:       { label: 'กำลังบ่ม',    bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
                        ready_demold: { label: 'พร้อมถอดแบบ', bg: '#F0FDF4', color: '#059669', border: '#A7F3D0' },
                        demolded:     { label: 'เสร็จสิ้น',   bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
                      }
                      return statusMap[j.status] || statusMap['demolded']
                    }
                    const s = getStatusDisplay()
                    return (
                      <div key={j.id} style={{ borderRadius: '20px', overflow: 'hidden', border: isJobReady ? '2px solid #34D399' : '1px solid rgba(0,0,0,0.06)', boxShadow: isJobReady ? '0 4px 20px rgba(16,185,129,0.12)' : '0 4px 12px rgba(0,0,0,0.04)', backgroundColor: '#ffffff' }}>
                        {/* Card Header */}
                        <div onClick={() => setExpandedJobId(isExpanded ? null : j.id)}
                          style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: '12px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              {isJobReady && <div style={{ width: '8px', height: '8px', borderRadius: '99px', backgroundColor: '#10B981', flexShrink: 0 }} />}
                              <h4 style={{ fontSize: '16px', fontWeight: 800, color: '#1E293B', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.plan_item?.product?.name}</h4>
                            </div>
                            {j.plan_item?.product?.size && <div style={{ fontSize: '14px', color: '#64748B', fontWeight: 700, marginBottom: '6px' }}>ขนาด: {j.plan_item?.product?.size}</div>}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '14px', color: '#475569', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-map-marker-alt" style={{ color: '#3B82F6' }}></i> โรงผลิต {j.bed}
                              </span>
                              <span style={{ fontSize: '14px', color: '#475569', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-bullseye" style={{ color: '#10B981' }}></i> เป้า: {j.qty_target} {j.plan_item?.product?.unit}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 800, padding: '5px 10px', borderRadius: '10px', backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>{s.label}</span>
                            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`} style={{ color: '#94A3B8', fontSize: '12px', flexShrink: 0 }}></i>
                          </div>
                        </div>

                        {/* Expandable Detail */}
                        {isExpanded && (
                          <div style={{ padding: '0 20px 20px', borderTop: '1px solid #F1F5F9' }}>
                            <p style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '16px 0 10px' }}>ตรวจสอบความพร้อม</p>
                            <div style={{ backgroundColor: '#F8FAFC', borderRadius: '16px', padding: '8px', marginBottom: '14px' }}>
                              <label style={{ display: 'flex', alignItems: 'flex-start', padding: '14px', borderRadius: '12px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9' }}>
                                <input type="checkbox" style={{ marginTop: '3px', marginRight: '14px', width: '18px', height: '18px', accentColor: '#2563EB', flexShrink: 0 }}
                                  checked={checks.clean}
                                  onChange={e => setJobItemChecks(p => ({ ...p, [j.id]: { ...( p[j.id] || { clean: false, wip: false }), clean: e.target.checked } }))} />
                                <div>
                                  <p style={{ fontWeight: 800, color: '#1E293B', fontSize: '14px', margin: 0 }}>ทำความสะอาดและทาน้ำยาแม่พิมพ์</p>
                                  <p style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 500, marginTop: '2px' }}>ตรวจสอบความสะอาดของโรงผลิตก่อนเริ่มงาน</p>
                                </div>
                              </label>
                              <label style={{ display: 'flex', alignItems: 'flex-start', padding: '14px', borderRadius: '12px', cursor: 'pointer' }}>
                                <input type="checkbox" style={{ marginTop: '3px', marginRight: '14px', width: '18px', height: '18px', accentColor: '#2563EB', flexShrink: 0 }}
                                  checked={checks.wip}
                                  onChange={e => setJobItemChecks(p => ({ ...p, [j.id]: { ...(p[j.id] || { clean: false, wip: false }), wip: e.target.checked } }))} />
                                <div>
                                  <p style={{ fontWeight: 800, color: '#1E293B', fontSize: '14px', margin: 0 }}>จัดวางโครงเหล็กครบถ้วน</p>
                                  <p style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 500, marginTop: '2px', marginBottom: '8px' }}>ตรวจสอบรหัสและจำนวนโครงเหล็กให้ตรงตามแผน</p>
                                  {materials.length > 0 && (
                                    <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', marginTop: '6px' }}>
                                      {materials.map((m, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderBottom: idx < materials.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                                          <i className="fas fa-check-circle" style={{ color: '#10B981', fontSize: '10px' }}></i>
                                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>{m.name}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </label>
                            </div>
                            <p style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>ถ่ายภาพยืนยัน <span style={{ color: '#EF4444' }}>*</span></p>
                            <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: photo ? '2px solid #34D399' : '2px dashed #CBD5E1', height: '120px', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
                              {!photo && <input type="file" accept="image/*" capture="environment" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', zIndex: 10, width: '100%', height: '100%' }} onChange={e => handleJobItemPhotoSelect(e, j.id)} />}
                              {photo ? (
                                <>
                                  <img src={photo.preview} alt="preview" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                  <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <button onClick={e => { e.stopPropagation(); setJobItemPhotos(p => { const n={...p}; delete n[j.id]; return n }) }}
                                      style={{ position: 'absolute', top: '10px', right: '10px', width: '36px', height: '36px', backgroundColor: 'rgba(239,68,68,0.95)', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
                                      <i className="fas fa-trash" style={{ color: '#fff', fontSize: '14px' }}></i>
                                    </button>
                                    <i className="fas fa-check-circle" style={{ color: '#fff', fontSize: '36px' }}></i>
                                  </div>
                                </>
                              ) : (
                                <><i className="fas fa-camera" style={{ fontSize: '28px', marginBottom: '8px' }}></i><span style={{ fontSize: '11px', fontWeight: 800 }}>แตะเพื่อถ่ายภาพยืนยัน</span></>
                              )}
                            </div>
                            {isJobReady && (
                              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                <i className="fas fa-check-circle" style={{ color: '#10B981' }}></i>
                                <span style={{ fontSize: '13px', fontWeight: 800, color: '#10B981' }}>รายการนี้พร้อมแล้ว</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  </div>

                {/* Order Concrete Button */}
                {allJobsReady && !concreteSent && jobOrders.some(j => j.status === 'pending') && (
                  <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#0F172A', borderRadius: '24px', boxShadow: '0 15px 35px -5px rgba(15,23,42,0.4)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div>
                        <p style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>พร้อมสั่งคอนกรีต</p>
                        <p style={{ fontSize: '22px', fontWeight: 900, color: '#60A5FA', margin: 0 }}>{totalConcreteQty.toFixed(1)} <span style={{ fontSize: '14px', color: '#64748B' }}>คิว ({totalRounds} รอบ)</span></p>
                      </div>
                      <i className="fas fa-truck-monster" style={{ fontSize: '32px', color: '#3B82F6', opacity: 0.6 }}></i>
                    </div>
                    <button disabled={saving} onClick={handleOrderConcrete}
                      style={{ width: '100%', padding: '16px', backgroundColor: '#2563EB', color: '#ffffff', borderRadius: '99px', border: 'none', fontSize: '16px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 8px 24px -4px rgba(37,99,235,0.6)' }}>
                      {saving ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-paper-plane"></i> สั่งคอนกรีต</>}
                    </button>
                  </div>
                )}
                {concreteSent && (
                  <div style={{ marginTop: '20px', padding: '18px 20px', backgroundColor: '#F0FDF4', borderRadius: '20px', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <i className="fas fa-check-circle" style={{ fontSize: '24px', color: '#10B981' }}></i>
                    <div>
                      <p style={{ fontWeight: 800, color: '#047857', margin: 0 }}>ส่งคำสั่งคอนกรีตแล้ว</p>
                      <p style={{ fontSize: '12px', color: '#6EE7B7', margin: 0 }}>ไปที่แถบ &ldquo;รับคอนกรีต&rdquo; เพื่อติดตาม</p>
                    </div>
                  </div>
                )}
                </>
              )
            }
            </div>
          )}

          {/* Active Tab: RECEIVE CONCRETE — DB-driven */}
          {activeTab === 'receiveConcreteTab' && (() => {
            const totalAllRounds = activeConcreteOrders.reduce((s, o) => s + o.round_count, 0)
            const totalReceived = activeConcreteOrders.reduce((s, o) => s + o.rounds.filter(r => r.status === 'received').length, 0)
            const totalQty = activeConcreteOrders.reduce((s, o) => s + Number(o.qty_requested), 0)
            const allDone = totalAllRounds > 0 && totalReceived >= totalAllRounds
            return (
            <div style={{ padding: '16px 16px 100px', maxWidth: '480px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: 0 }}>รับคอนกรีต</h2>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>ซิงค์กับฝ่ายผสมทุก 8 วินาที</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {concreteLoading ? <i className="fas fa-spinner fa-spin" style={{ color: '#94A3B8', fontSize: 13 }} /> : <i className="fas fa-sync-alt" style={{ color: '#10B981', fontSize: 12 }} />}
                  <span style={{ fontSize: 11, color: concreteLoading ? '#94A3B8' : '#10B981', fontWeight: 700 }}>{concreteLoading ? 'กำลังโหลด...' : 'อัปเดตแล้ว'}</span>
                </div>
              </div>

              {/* Summary */}
              {totalAllRounds > 0 && (
                <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '14px 18px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B' }}>รวมทุกคำสั่ง</span>
                    <span style={{ fontSize: 16, fontWeight: 900, color: '#2563EB' }}>{totalReceived}<span style={{ color: '#94A3B8', fontWeight: 600, fontSize: 12 }}>/{totalAllRounds} รอบ</span></span>
                  </div>
                  <div style={{ height: 8, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${totalAllRounds > 0 ? Math.round((totalReceived/totalAllRounds)*100) : 0}%`, background: allDone ? '#10B981' : '#2563EB', borderRadius: 99, transition: 'width 0.4s' }} />
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>รวม {totalQty.toFixed(2)} คิว</p>

                </div>
              )}

              {/* Loading */}
              {concreteLoading && activeConcreteOrders.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: 32, color: '#CBD5E1', display: 'block', marginBottom: 12 }} />
                  <p style={{ fontSize: 14, color: '#94A3B8', fontWeight: 600 }}>กำลังโหลดข้อมูล...</p>
                </div>
              )}

              {/* Empty */}
              {!concreteLoading && activeConcreteOrders.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px 24px', backgroundColor: '#F8FAFC', borderRadius: 20, border: '1px dashed #CBD5E1' }}>
                  <i className="fas fa-truck-monster" style={{ fontSize: 40, color: '#CBD5E1', display: 'block', marginBottom: 12 }} />
                  <p style={{ fontWeight: 800, color: '#94A3B8', margin: '0 0 4px', fontSize: 15 }}>ยังไม่มีคำสั่งคอนกรีต</p>
                  <p style={{ fontSize: 12, color: '#CBD5E1', fontWeight: 500, margin: 0 }}>เมื่อกดสั่งคอนกรีต ข้อมูลจะปรากฏที่นี่</p>
                </div>
              )}

              {/* All done */}
              {allDone && (
                <div style={{ textAlign: 'center', padding: '32px 24px', backgroundColor: '#F0FDF4', borderRadius: 20, border: '1px solid #A7F3D0' }}>
                  <i className="fas fa-check-circle" style={{ fontSize: 40, color: '#10B981', display: 'block', marginBottom: 10 }} />
                  <p style={{ fontWeight: 900, color: '#047857', margin: '0 0 4px', fontSize: 16 }}>รับคอนกรีตครบทุกรอบแล้ว!</p>
                  <p style={{ fontSize: 12, color: '#6EE7B7', fontWeight: 600, margin: 0 }}>รอฝ่าย QC ยืนยันก่อนเริ่มเทคอนกรีต</p>
                </div>
              )}

              {/* Order cards */}
              {activeConcreteOrders.map(order => {
                const suppliedCount = order.rounds.filter(r => r.status === 'supplied').length
                const receivedCount = order.rounds.filter(r => r.status === 'received').length
                const pct = order.round_count > 0 ? Math.round(((suppliedCount + receivedCount) / order.round_count) * 100) : 0
                const productName = (order.job_order as any)?.plan_item?.product?.name ?? `สั่งรวมโรงผลิต ${order.bed ?? '?'}`
                const bed = order.bed ?? (order.job_order as any)?.bed ?? '?'
                return (
                  <div key={order.id} style={{ backgroundColor: '#fff', borderRadius: 20, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div style={{ padding: '14px 18px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EFF6FF', color: '#2563EB', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>
                        <span style={{ fontSize: 8, color: '#93C5FD' }}>โรง</span>
                        <span style={{ fontSize: 17, lineHeight: 1 }}>{bed}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{productName}</p>
                        <p style={{ margin: 0, fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                          สั่ง {new Date(order.requested_at).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#2563EB', lineHeight: 1 }}>{Number(order.qty_requested).toFixed(2)} <span style={{ fontSize: 11, color: '#94A3B8' }}>คิว</span></p>
                        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748B' }}>รับแล้ว {receivedCount}/{order.round_count} รอบ</p>
                      </div>
                    </div>
                    <div style={{ height: 4, background: '#F1F5F9' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#10B981' : '#2563EB', transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ padding: '8px 0' }}>
                      {order.rounds.map((r, idx) => {
                        const isSupplied = r.status === 'supplied' || r.status === 'received'
                        const isReceived = r.status === 'received'
                        const isNext = !isSupplied && (idx === 0 || order.rounds[idx - 1]?.status === 'received')
                        const isLocked = !isSupplied && !isNext
                        return (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: idx < order.rounds.length - 1 ? '1px solid #F8FAFC' : 'none', background: isReceived ? '#F0FDF4' : isSupplied ? '#FFFBEB' : 'transparent', opacity: isLocked ? 0.4 : 1 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, background: isReceived ? '#D1FAE5' : isSupplied ? '#FEF3C7' : isNext ? '#DBEAFE' : '#F3F4F6', color: isReceived ? '#059669' : isSupplied ? '#D97706' : isNext ? '#2563EB' : '#9CA3AF' }}>
                              {isReceived ? <i className="fas fa-check-double" style={{ fontSize: 10 }} /> : isSupplied ? <i className="fas fa-truck" style={{ fontSize: 10 }} /> : isLocked ? <i className="fas fa-lock" style={{ fontSize: 9 }} /> : r.round_number}
                            </div>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: isReceived ? '#047857' : isLocked ? '#9CA3AF' : '#1E293B' }}>รอบที่ {r.round_number}</span>
                              <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 6 }}>{Number(r.qty_per_round).toFixed(2)} คิว</span>
                              {isReceived ? (
                                <div style={{ fontSize: 10, color: '#10B981', fontWeight: 700, marginTop: 1 }}>รับเรียบร้อยแล้ว</div>
                              ) : isSupplied ? (
                                <div style={{ fontSize: 10, color: '#D97706', fontWeight: 700, marginTop: 1 }}>คอนกรีตมาถึงแล้ว! กรุณากดรับ</div>
                              ) : isNext ? (
                                <div style={{ fontSize: 10, color: '#60A5FA', fontWeight: 700, marginTop: 1 }}>รอฝ่ายผสมยืนยัน...</div>
                              ) : null}
                            </div>
                            {isSupplied && !isReceived ? (
                              <button
                                onClick={() => handleReceiveRound(r.id)}
                                disabled={!!receivingId}
                                style={{
                                  padding: '6px 14px', borderRadius: '10px', background: '#D97706', color: '#fff', border: 'none',
                                  fontSize: '11px', fontWeight: 800, cursor: receivingId === r.id ? 'not-allowed' : 'pointer',
                                  boxShadow: '0 4px 10px rgba(217,119,6,0.2)'
                                }}
                              >
                                {receivingId === r.id ? <i className="fas fa-spinner fa-spin" /> : 'กดยืนยันรับ'}
                              </button>
                            ) : isReceived && r.supplied_at && (
                              <span style={{ fontSize: 10, color: '#6EE7B7', fontWeight: 700 }}>{new Date(r.supplied_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {activeConcreteOrders.length > 0 && !allDone && (
                <div style={{ padding: '12px 16px', backgroundColor: '#FFFBEB', borderRadius: 14, border: '1px solid #FDE68A', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <i className="fas fa-info-circle" style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ margin: 0, fontSize: 12, color: '#92400E', fontWeight: 600 }}>สถานะอัปเดตอัตโนมัติหลังฝ่ายผสมกดยืนยันจ่ายแต่ละรอบ ไม่ต้องกดรีเฟรช</p>
                </div>
              )}
            </div>
            )
          })()}

        </main>

        <nav style={{
          position: 'fixed',
          bottom: 0, left: 0,
          width: '100%',
          background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 35%, rgba(255,255,255,1) 100%)',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'flex-end',
          paddingTop: '30px',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
          zIndex: 20,
        }}>


          {/* Tab: งานวันนี้ */}
          <button onClick={() => setActiveTab('dailyJobs')}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', background: 'none', border: 'none', cursor: 'pointer', paddingBottom: 0 }}>
            {activeTab === 'dailyJobs' ? (
              <>
                <div style={{ position: 'absolute', top: '-40px', width: '54px', height: '54px', backgroundColor: '#2563EB', borderRadius: '99px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(37,99,235,0.45)', border: '4px solid #ffffff', zIndex: 10 }}>
                  <i className="fas fa-clipboard-list" style={{ color: '#fff', fontSize: '18px' }}></i>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 800, color: '#2563EB', marginTop: '22px' }}>งานวันนี้</span>
              </>
            ) : (
              <>
                <i className="fas fa-clipboard-list" style={{ fontSize: '20px', color: '#94A3B8', marginBottom: '4px' }}></i>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8' }}>งานวันนี้</span>
              </>
            )}
          </button>

          {/* Tab: รับคอนกรีต */}
          <button onClick={() => setActiveTab('receiveConcreteTab')}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', background: 'none', border: 'none', cursor: 'pointer', paddingBottom: 0 }}>
            {activeTab === 'receiveConcreteTab' ? (
              <>
                <div style={{ position: 'absolute', top: '-40px', width: '54px', height: '54px', backgroundColor: '#2563EB', borderRadius: '99px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(37,99,235,0.45)', border: '4px solid #ffffff', zIndex: 10 }}>
                  <i className="fas fa-truck-monster" style={{ color: '#fff', fontSize: '18px' }}></i>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 800, color: '#2563EB', marginTop: '22px' }}>รับคอนกรีต</span>
              </>
            ) : (
              <>
                <div style={{ position: 'relative' }}>
                  <i className="fas fa-truck-monster" style={{ fontSize: '20px', color: concreteSent && concreteRoundsReceived < totalRounds ? '#F59E0B' : '#94A3B8', marginBottom: '4px' }}></i>
                  {concreteSent && concreteRoundsReceived < totalRounds && (
                    <div style={{ position: 'absolute', top: '-2px', right: '-4px', width: '8px', height: '8px', backgroundColor: '#EF4444', borderRadius: '99px', border: '1px solid #fff' }} />
                  )}
                </div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: concreteSent && concreteRoundsReceived < totalRounds ? '#F59E0B' : '#94A3B8' }}>รับคอนกรีต</span>
              </>
            )}
          </button>

          {/* Tab: ออกจากระบบ */}
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login'; }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', paddingTop: '4px' }}>
            <i className="fas fa-sign-out-alt" style={{ fontSize: '20px', color: '#EF4444', marginBottom: '4px' }}></i>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#EF4444' }}>ออกจากระบบ</span>
          </button>
        </nav>
    </div>
  )
}
