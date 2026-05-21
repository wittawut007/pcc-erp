'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useTransition, useState } from 'react'

export default function DashboardRefresh() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [lastUpdated, setLastUpdated] = useState<string>('')

  useEffect(() => {
    // กำหนดเวลาอัปเดตเริ่มต้นเมื่อ component mount
    setLastUpdated(
      new Date().toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    )

    // สั่งรีเฟรชข้อมูลทุก 15 วินาที
    const interval = setInterval(() => {
      startTransition(() => {
        router.refresh()
      })
    }, 15000)

    return () => clearInterval(interval)
  }, [router])

  useEffect(() => {
    if (!isPending) {
      setLastUpdated(
        new Date().toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      )
    }
  }, [isPending])

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        padding: '6px 14px',
        borderRadius: '100px',
        fontSize: '11px',
        fontWeight: 600,
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '8px',
          height: '8px',
        }}
      >
        {!isPending && (
          <span
            className="refresh-ping-dot"
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: 'var(--green)',
              opacity: 0.75,
            }}
          />
        )}
        <span
          style={{
            position: 'relative',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: isPending ? 'var(--accent)' : 'var(--green)',
            transition: 'background-color 0.3s ease',
          }}
        />
      </div>
      <span style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
        {isPending ? 'กำลังดึงข้อมูลล่าสุด...' : `สด (อัปเดตเมื่อ ${lastUpdated})`}
      </span>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes refresh-ping {
          75%, 100% {
            transform: scale(2.8);
            opacity: 0;
          }
        }
        .refresh-ping-dot {
          animation: refresh-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
      `,
        }}
      />
    </div>
  )
}
