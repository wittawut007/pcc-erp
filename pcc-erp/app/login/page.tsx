'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const REMEMBER_ME_KEY = 'pcc_remember_username'
const ERP_EMAIL_DOMAIN = '@pcc-erp.local'

/** แปลง username → email สำหรับ Supabase Auth */
function toEmail(username: string): string {
  const u = username.trim().toLowerCase()
  if (u.includes('@')) return u          // ใส่ email เต็มมาเองก็ได้
  return u + ERP_EMAIL_DOMAIN
}

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [workerBlocked, setWorkerBlocked] = useState(false)

  // โหลด username ที่บันทึกไว้เมื่อเปิดหน้า
  useEffect(() => {
    const savedUsername = localStorage.getItem(REMEMBER_ME_KEY)
    if (savedUsername) {
      setUsername(savedUsername)
      setRememberMe(true)
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setWorkerBlocked(false)

    // บันทึก/ลบ username ตามสถานะ Remember Me
    if (rememberMe) {
      localStorage.setItem(REMEMBER_ME_KEY, username)
    } else {
      localStorage.removeItem(REMEMBER_ME_KEY)
    }

    const email = toEmail(username)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
      setLoading(false)
      return
    }

    // ดึง role จาก profiles table แล้ว redirect ตาม role
    let role = data?.user?.user_metadata?.role
    if (!role && data?.user?.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()
      role = profile?.role
    }

    if (role === 'qc') {
      router.push('/qc-inspect')
    } else if (role === 'worker') {
      router.push('/worker')
    } else {
      router.push('/dashboard')
    }
    router.refresh()
  }

  const logoBoxStyle = (size: number): React.CSSProperties => ({
    width: size,
    height: size,
    borderRadius: 22,
    marginBottom: 32,
    flexShrink: 0,
    background: '#2563EB',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(37,99,235,0.25)',
    overflow: 'hidden',
  })

  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row">

      {/* Left Column — Branding */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center bg-white border-r border-gray-100">
        <div className="text-center flex flex-col items-center" style={{ fontFamily: "'Quicksand', sans-serif" }}>
          {/* Logo Desktop */}
          <div style={logoBoxStyle(84)}>
            <img
              src="/logo.png"
              alt="PCC Logo"
              width={56}
              height={56}
              style={{ objectFit: 'contain' }}
            />
          </div>
          <h1 className="text-slate-900 tracking-tight uppercase font-bold" style={{ fontSize: '46px', marginBottom: '16px' }}>
            PCC <span className="text-blue-600">POSTENTION</span>
          </h1>
          <p className="text-slate-400 uppercase" style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.3em' }}>
            ERP Production System
          </p>
        </div>
      </div>

      {/* Right Column — Login Form */}
      <div
        className="w-full lg:w-1/2"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
          boxSizing: 'border-box',
          minHeight: '100dvh',
          backgroundColor: '#ffffff'
        }}
      >
        <div style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}>
          <div className="text-center flex flex-col items-center" style={{ marginBottom: '40px' }}>
            {/* Logo Mobile — แสดงเฉพาะ mobile, ซ่อนบน desktop */}
            <div className="lg:hidden" style={logoBoxStyle(72)}>
              <img
                src="/logo.png"
                alt="PCC Logo"
                width={48}
                height={48}
                style={{ objectFit: 'contain' }}
              />
            </div>
            {/* Title */}
            <h2 className="tracking-tight font-black" style={{ fontSize: '28px', letterSpacing: '0.02em' }}>
              <span style={{ color: '#0F172A' }}>PCC</span>
              <span style={{ color: '#2563EB', marginLeft: '6px' }}>ERP</span>
            </h2>
            <p className="text-slate-400 uppercase mt-2" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.25em' }}>
              Production System
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <i className="fas fa-exclamation-circle flex-shrink-0"></i>
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-slate-500 uppercase"
                style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '12px' }}
              >
                ชื่อผู้ใช้งาน (USERNAME)
              </label>
              <div style={{ position: 'relative', width: '100%' }}>
                <span style={{ position: 'absolute', top: 0, bottom: 0, left: '16px', display: 'flex', alignItems: 'center', color: '#94A3B8' }}>
                  <i className="fas fa-user" style={{ fontSize: '13px' }}></i>
                </span>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="เช่น somchai.admin"
                  autoComplete="username"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 42px',
                    fontSize: '13px',
                    height: '48px',
                    borderRadius: '99px',
                    border: '1px solid #EFF6FF',
                    backgroundColor: '#EEF4FF',
                    color: '#1E293B',
                    fontWeight: 500,
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.border = '1px solid #2563EB'}
                  onBlur={(e) => e.target.style.border = '1px solid #EFF6FF'}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-slate-500 uppercase"
                style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '12px' }}
              >
                รหัสผ่าน (PASSWORD)
              </label>
              <div style={{ position: 'relative', width: '100%' }}>
                <span style={{ position: 'absolute', top: 0, bottom: 0, left: '16px', display: 'flex', alignItems: 'center', color: '#94A3B8' }}>
                  <i className="fas fa-lock" style={{ fontSize: '13px' }}></i>
                </span>
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 42px 12px 42px',
                    fontSize: '13px',
                    height: '48px',
                    borderRadius: '99px',
                    border: '1px solid #EFF6FF',
                    backgroundColor: '#EEF4FF',
                    color: '#1E293B',
                    fontWeight: 500,
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.border = '1px solid #2563EB'}
                  onBlur={(e) => e.target.style.border = '1px solid #EFF6FF'}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{ position: 'absolute', top: 0, bottom: 0, right: '20px', display: 'flex', alignItems: 'center', color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <i className={`fas ${showPass ? 'fa-eye-slash' : 'fa-eye'}`} style={{ fontSize: '13px' }}></i>
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div style={{ marginTop: '-8px' }}>
              <label
                className="flex items-center gap-2 cursor-pointer select-none"
                style={{ width: 'fit-content' }}
              >
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ width: '14px', height: '14px', accentColor: '#2563EB', cursor: 'pointer' }}
                />
                <span className="text-slate-500 hover:text-slate-700 transition" style={{ fontWeight: 700, fontSize: '11px' }}>
                  จดจำฉันไว้
                </span>
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '99px',
                color: '#ffffff',
                backgroundColor: loading ? '#93C5FD' : '#2563EB',
                fontWeight: 700,
                fontSize: '14px',
                height: '48px',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 8px 24px rgba(37,99,235,0.25)',
                boxSizing: 'border-box'
              }}
            >
              {loading ? (
                <>
                  <i className="fas fa-circle-notch fa-spin"></i>
                  <span>กำลังเข้าสู่ระบบ...</span>
                </>
              ) : (
                <span>เข้าสู่ระบบ</span>
              )}
            </button>

            {/* Quick Login for Dev */}
            {process.env.NODE_ENV === 'development' && (
              <div className="mt-4 border-t border-slate-200 pt-6">
                <div className="text-center mb-4">
                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                    Dev Mode Active
                  </span>
                  <p className="text-slate-500 text-xs mt-2.5 font-medium">เข้าสู่ระบบด่วนสำหรับทดสอบ</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { username: 'somchai.admin',  password: 'Admin@2026', label: 'Admin',     icon: 'fa-user-shield',    color: 'bg-slate-800 text-white hover:bg-slate-700' },
                    { username: 'wiphada.plan',   password: 'Plan@2026',  label: 'Planner',   icon: 'fa-calendar-check', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
                    { username: 'thanakorn.mat',  password: 'Mat@2026x',  label: 'Material',  icon: 'fa-boxes-stacked',  color: 'bg-teal-100 text-teal-700 hover:bg-teal-200' },
                    { username: 'rattana.conc',   password: 'Conc@2026',  label: 'Concrete',  icon: 'fa-industry',       color: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
                    { username: 'ekkachai.ware',  password: 'Ware@2026',  label: 'Warehouse', icon: 'fa-warehouse',      color: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
                    { username: 'nongnuch.qc',    password: 'Qc12@2026',  label: 'QC',        icon: 'fa-clipboard-check',color: 'bg-rose-100 text-rose-700 hover:bg-rose-200' },
                    { username: 'prasit.work',    password: 'Work@2026',  label: 'Worker',    icon: 'fa-hard-hat',       color: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
                  ].map((t) => (
                    <button
                      key={t.username}
                      type="button"
                      onClick={() => {
                        setUsername(t.username)
                        setPassword(t.password)
                      }}
                      className={`text-[11px] font-bold py-2.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${t.color}`}
                    >
                      <i className={`fas ${t.icon}`}></i>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>

          {/* Footer */}
          <div className="text-center flex flex-col items-center gap-2" style={{ marginTop: '50px' }}>
            <span className="font-medium text-slate-400" style={{ fontSize: '11px' }}>หากพบปัญหาการเข้าใช้งาน หรือลืมรหัสผ่าน?</span>
            <a href="#" className="font-bold text-blue-600 hover:text-blue-700 transition" style={{ fontSize: '11px' }}>
              ติดต่อฝ่าย IT (Digital Hub)
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
