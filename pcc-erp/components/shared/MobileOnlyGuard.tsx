'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ServerDeviceCheck } from '@/lib/utils/device'

interface DesktopBlockedViewProps {
  roleLabel: string
  showDashboardLink?: boolean
}

interface NavigatorWithUAData extends Navigator {
  userAgentData?: {
    mobile?: boolean
  }
}

const CLIENT_MOBILE_UA_REGEX =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet|Silk|Kindle/i

function isAllowedMobileDeviceClient(): boolean {
  if (typeof window === 'undefined') return false

  const nav = navigator as NavigatorWithUAData
  const ua = nav.userAgent || ''
  const hasTouch =
    (typeof nav.maxTouchPoints === 'number' && nav.maxTouchPoints > 0) ||
    'ontouchstart' in window
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches

  // 1. iPadOS 13+ Safari รายงาน UA เป็น Macintosh แต่มี multi-touch (maxTouchPoints > 1)
  const isIPadOS = /Macintosh/i.test(ua) && nav.maxTouchPoints > 1 && hasCoarsePointer
  if (isIPadOS) return true

  // 2. อุปกรณ์ Mobile/Tablet ตาม Client Hints หรือ User-Agent และต้องรองรับ Touch/Coarse pointer
  const isMobileIdentity = nav.userAgentData?.mobile === true || CLIENT_MOBILE_UA_REGEX.test(ua)
  return isMobileIdentity && (hasTouch || hasCoarsePointer)
}

export function DesktopBlockedView({
  roleLabel,
  showDashboardLink = false,
}: DesktopBlockedViewProps) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        backgroundColor: '#FFFFFF',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Minimal 404-style header */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          <i
            className="fas fa-mobile-alt"
            aria-hidden="true"
            style={{ fontSize: '26px', color: '#2563EB' }}
          />
          <span
            style={{
              width: '1px',
              height: '28px',
              backgroundColor: '#E2E8F0',
            }}
          />
          <span
            style={{
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#64748B',
            }}
          >
            Mobile Only
          </span>
        </div>

        <h1
          style={{
            fontSize: '24px',
            fontWeight: 800,
            color: '#0F172A',
            lineHeight: 1.35,
            marginBottom: '12px',
          }}
        >
          รองรับการใช้งานบนมือถือเท่านั้น
        </h1>

        <p
          style={{
            fontSize: '14px',
            color: '#64748B',
            lineHeight: 1.75,
            marginBottom: '28px',
            maxWidth: '400px',
          }}
        >
          หน้างานสำหรับ{' '}
          <strong style={{ color: '#1E293B', fontWeight: 700 }}>
            {roleLabel}
          </strong>{' '}
          ไม่สามารถเปิดใช้งานผ่านคอมพิวเตอร์สำนักงานได้
          กรุณาเข้าใช้งานผ่านโทรศัพท์มือถือหรือแท็บเล็ตหน้างาน
        </p>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          {showDashboardLink && (
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              style={{
                padding: '10px 22px',
                borderRadius: '10px',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <i className="fas fa-arrow-left" aria-hidden="true" style={{ fontSize: '12px' }} />
              กลับหน้า Dashboard
            </button>
          )}

          <button
            type="button"
            disabled={loggingOut}
            onClick={handleLogout}
            style={{
              padding: '10px 22px',
              borderRadius: '10px',
              backgroundColor: 'transparent',
              color: '#475569',
              fontSize: '13px',
              fontWeight: 600,
              border: '1px solid #E2E8F0',
              cursor: loggingOut ? 'not-allowed' : 'pointer',
              opacity: loggingOut ? 0.6 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {loggingOut ? (
              <i className="fas fa-spinner fa-spin" aria-hidden="true" style={{ fontSize: '12px' }} />
            ) : (
              <i className="fas fa-sign-out-alt" aria-hidden="true" style={{ fontSize: '12px' }} />
            )}
            ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  )
}

interface MobileOnlyGuardProps {
  children: React.ReactNode
  roleLabel: string
  serverCheck: ServerDeviceCheck
  showDashboardLink?: boolean
}

export default function MobileOnlyGuard({
  children,
  roleLabel,
  serverCheck,
  showDashboardLink = false,
}: MobileOnlyGuardProps) {
  const [status, setStatus] = useState<'checking' | 'allowed' | 'blocked'>(() => {
    if (serverCheck === 'desktop') return 'blocked'
    if (serverCheck === 'mobile') return 'allowed'
    return 'checking'
  })

  useEffect(() => {
    const evaluate = () => {
      setStatus(isAllowedMobileDeviceClient() ? 'allowed' : 'blocked')
    }

    evaluate()

    const mediaQuery = window.matchMedia('(pointer: coarse)')
    mediaQuery.addEventListener('change', evaluate)
    return () => mediaQuery.removeEventListener('change', evaluate)
  }, [])

  if (status === 'checking') {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500 text-sm font-semibold">
          <i className="fas fa-spinner fa-spin text-2xl text-blue-600" aria-hidden="true" />
          <span>กำลังตรวจสอบอุปกรณ์...</span>
        </div>
      </div>
    )
  }

  if (status === 'blocked') {
    return (
      <DesktopBlockedView
        roleLabel={roleLabel}
        showDashboardLink={showDashboardLink}
      />
    )
  }

  return <>{children}</>
}
