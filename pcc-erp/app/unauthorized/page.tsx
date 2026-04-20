'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState, Suspense } from 'react'

function UnauthorizedContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const reason = searchParams.get('reason')

  // กำหนดเนื้อหาตาม reason
  const config = (() => {
    switch (reason) {
      case 'invalid_qr':
        return {
          icon: 'fa-qrcode',
          iconBg: '#FFF7ED',
          iconColor: '#D97706',
          title: 'QR Code ไม่ถูกต้องหรือหมดอายุ',
          subtitle: 'ไม่พบ QR Code ที่ใช้งานได้ในระบบ',
          message: 'กรุณาขอ QR Code ใหม่จากผู้ดูแลระบบ หรือติดต่อฝ่าย IT',
          showLogout: false,
          showBackToQr: true,
        }
      case 'no_qr':
        return {
          icon: 'fa-qrcode',
          iconBg: '#FFF7ED',
          iconColor: '#D97706',
          title: 'กรุณาสแกน QR Code',
          subtitle: 'คุณยังไม่ได้สแกน QR Code เพื่อเข้าสู่ระบบ',
          message: 'พนักงานหน้างานต้องสแกน QR Code ที่ได้รับจากผู้ดูแลระบบเท่านั้น',
          showLogout: false,
          showBackToQr: true,
        }
      case 'worker_login':
        return {
          icon: 'fa-mobile-alt',
          iconBg: '#EFF6FF',
          iconColor: '#2563EB',
          title: 'บัญชีพนักงานหน้างาน',
          subtitle: 'ไม่สามารถเข้าสู่ระบบผ่านหน้านี้ได้',
          message: 'บัญชีนี้เป็นบัญชีพนักงานผลิต กรุณาสแกน QR Code ที่ได้รับจากผู้ดูแลระบบเพื่อเข้าใช้งาน Worker App',
          showLogout: true,
          showBackToQr: false,
        }
      default:
        return {
          icon: 'fa-shield-alt',
          iconBg: '#FEF2F2',
          iconColor: '#DC2626',
          title: 'ไม่มีสิทธิ์เข้าถึง',
          subtitle: 'คุณไม่ได้รับอนุญาตให้เข้าถึงหน้านี้',
          message: 'หากคิดว่านี่เป็นข้อผิดพลาด กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบสิทธิ์การเข้าถึง',
          showLogout: true,
          showBackToQr: false,
        }
    }
  })()

  const handleLogout = async () => {
    setLoading(true)
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleBack = () => {
    router.push('/dashboard')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'white',
        borderRadius: 20,
        padding: '48px 40px',
        maxWidth: 440,
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07), 0 20px 40px -5px rgba(0,0,0,0.08)',
        border: '1px solid rgba(0,0,0,0.06)',
      }}>

        {/* Icon */}
        <div style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: config.iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          fontSize: 32,
          color: config.iconColor,
        }}>
          <i className={`fas ${config.icon}`}></i>
        </div>

        {/* Logo mini */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          <div style={{ width: 24, height: 24, background: '#2563EB', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fas fa-industry text-white" style={{ fontSize: 11, color: 'white' }}></i>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em' }}>PCC POSTENTION ERP</span>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>
          {config.title}
        </h1>
        <p style={{ fontSize: 13, color: '#64748B', fontWeight: 500, margin: '0 0 16px' }}>
          {config.subtitle}
        </p>

        {/* Divider */}
        <div style={{ height: 1, background: '#F1F5F9', margin: '16px 0' }}></div>

        {/* Message */}
        <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6, margin: '0 0 28px' }}>
          {config.message}
        </p>

        {/* QR hint for worker routes */}
        {config.showBackToQr && (
          <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: '14px 16px', marginBottom: 24, textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <i className="fas fa-info-circle" style={{ color: '#D97706', marginTop: 2, flexShrink: 0 }}></i>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: '#92400E' }}>วิธีเข้าสู่ระบบ</p>
                <p style={{ margin: 0, fontSize: 12, color: '#B45309', lineHeight: 1.5 }}>
                  1. ขอ QR Code จากผู้ดูแลระบบ (Admin)<br />
                  2. เปิดกล้องมือถือและสแกน QR Code<br />
                  3. ระบบจะพาคุณเข้าสู่ Worker App โดยอัตโนมัติ
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!config.showBackToQr && (
            <button onClick={handleBack}
              style={{ width: '100%', padding: '12px 0', background: '#2563EB', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              <i className="fas fa-arrow-left" style={{ marginRight: 8 }}></i>
              กลับหน้าหลัก
            </button>
          )}
          {config.showLogout && (
            <button onClick={handleLogout} disabled={loading}
              style={{ width: '100%', padding: '12px 0', background: 'white', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              {loading
                ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }}></i>กำลังออกจากระบบ...</>
                : <><i className="fas fa-sign-out-alt" style={{ marginRight: 8 }}></i>ออกจากระบบ</>
              }
            </button>
          )}
          <p style={{ fontSize: 11, color: '#CBD5E1', margin: 0 }}>
            หากพบปัญหา ติดต่อ IT Support
          </p>
        </div>
      </div>
    </div>
  )
}

export default function UnauthorizedPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i className="fas fa-spinner fa-spin" style={{ fontSize: 24, color: '#94A3B8' }}></i>
      </div>
    }>
      <UnauthorizedContent />
    </Suspense>
  )
}
