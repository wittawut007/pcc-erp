'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPass, setShowPass] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
      setLoading(false)
      return
    }

    const role = data?.user?.user_metadata?.role
    if (role === 'worker') {
      router.push('/worker')
    } else {
      router.push('/dashboard')
    }
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row">

      {/* Left Column — Branding */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center bg-white border-r border-gray-100">
        <div className="text-center flex flex-col items-center" style={{ fontFamily: "'Quicksand', sans-serif" }}>
          <div className="bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20" style={{ width: '84px', height: '84px', borderRadius: '22px', marginBottom: '32px' }}>
            <i className="fas fa-industry text-white" style={{ fontSize: '36px' }}></i>
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
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-[420px]">

          {/* Header */}
          <div className="text-center flex flex-col items-center" style={{ marginBottom: '60px' }}>
            <div className="bg-blue-600 flex items-center justify-center shadow-md" style={{ width: '52px', height: '52px', borderRadius: '14px', marginBottom: '20px' }}>
              <i className="fas fa-industry text-white text-xl"></i>
            </div>
            <h2 className="text-slate-900 tracking-tight font-bold" style={{ fontSize: '26px', marginBottom: '6px' }}>เข้าสู่ระบบ</h2>
            <p className="text-slate-400 font-medium tracking-wide" style={{ fontSize: '13px' }}>ยินดีต้อนรับกลับ! โปรดกรอกข้อมูลเพื่อเข้าใช้งานระบบ</p>
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
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-300">
                  <i className="fas fa-user text-[13px]"></i>
                </span>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your username"
                  required
                  className="w-full pr-4 rounded-lg border border-slate-200 bg-white outline-none transition-all text-gray-800 placeholder:text-slate-300 font-medium focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  style={{ paddingLeft: '38px', paddingTop: '12px', paddingBottom: '12px', fontSize: '13px', height: '46px' }}
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
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-300">
                  <i className="fas fa-lock text-[13px]"></i>
                </span>
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pr-10 rounded-lg border border-slate-200 bg-white outline-none transition-all text-gray-800 placeholder:text-slate-300 font-medium focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  style={{ paddingLeft: '38px', paddingTop: '12px', paddingBottom: '12px', fontSize: '13px', height: '46px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-300 hover:text-slate-400"
                >
                  <i className={`fas ${showPass ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between" style={{ marginTop: '-8px' }}>
              <label className="flex items-center gap-2 cursor-pointer text-slate-500 hover:text-slate-700 transition" style={{ fontWeight: 700, fontSize: '11px' }}>
                <input type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer outline-none" style={{ width: '14px', height: '14px' }} />
                <span>จดจำฉันไว้</span>
              </label>
              <a href="#" className="font-extrabold text-blue-600 hover:text-blue-700 transition" style={{ fontSize: '11px' }}>
                ลืมรหัสผ่าน?
              </a>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-blue-600/20"
              style={{ fontWeight: 700, fontSize: '13px', height: '46px' }}
            >
              {loading ? (
                <>
                  <i className="fas fa-circle-notch fa-spin"></i>
                  <span>กำลังเข้าสู่ระบบ...</span>
                </>
              ) : (
                <span>เข้าสู่ระบบ (Sign in)</span>
              )}
            </button>
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
