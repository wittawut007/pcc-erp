'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

const navItems = [
  {
    label: 'Main',
    links: [
      { href: '/dashboard', icon: 'fa-chart-line', label: 'Dashboard' },
    ],
  },
  {
    label: 'Production',
    links: [
      { href: '/planner', icon: 'fa-calendar-alt', label: 'แผนการผลิต' },
      { href: '/job-orders', icon: 'fa-clipboard-list', label: 'คิวงานเทปูน' },
      { href: '/demolding', icon: 'fa-hammer', label: 'งานถอดแบบ' },
    ],
  },
  {
    label: 'Inventory',
    links: [
      { href: '/inventory/raw', icon: 'fa-layer-group', label: 'คลังวัตถุดิบ' },
      { href: '/inventory/wip', icon: 'fa-th-large', label: 'โครงเหล็ก (WIP)' },
      { href: '/inventory/fg', icon: 'fa-cubes', label: 'สินค้าพร้อมขาย' },
    ],
  },
  {
    label: 'System',
    links: [
      { href: '/products', icon: 'fa-box-open', label: 'ข้อมูลสินค้า' },
      { href: '/users', icon: 'fa-users-cog', label: 'จัดการผู้ใช้งาน' },
      { href: '/qc', icon: 'fa-clipboard-check', label: 'จัดการของเสีย (QC)' },
      { href: '/logs', icon: 'fa-history', label: 'ประวัติการทำงาน' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [loggingOut, setLoggingOut] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside
      style={{
        width: isCollapsed ? 70 : 'var(--sidebar-width)',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        transition: 'width 0.3s ease',
      }}
      className="flex flex-col flex-shrink-0 z-10 h-screen"
    >
      {/* Logo */}
      <div
        style={{ borderBottom: '1px solid var(--border)', height: 90 }}
        className="flex flex-col justify-center items-center px-4 gap-1.5 overflow-hidden"
      >
        <div
          style={{ background: 'var(--accent)', borderRadius: 8, width: 34, height: 34 }}
          className="flex items-center justify-center flex-shrink-0 relative"
          title={isCollapsed ? "PCC POSTENTION" : undefined}
        >
          <i className="fas fa-industry text-white text-sm"></i>
        </div>
        {!isCollapsed && (
          <div
            style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.02em', textAlign: 'center', whiteSpace: 'nowrap' }}
          >
            PCC <span style={{ color: 'var(--accent)' }}>POSTENTION</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 overflow-x-hidden">
        {navItems.map((section) => (
          <div key={section.label}>
            {isCollapsed ? (
              <div style={{ height: 1, background: 'var(--border)', margin: '16px auto 6px', width: '24px' }}></div>
            ) : (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '0 8px',
                  marginTop: 16,
                  marginBottom: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                {section.label}
              </div>
            )}
            
            {section.links.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  title={isCollapsed ? link.label : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: isCollapsed ? 0 : 9,
                    padding: isCollapsed ? '10px 0' : '8px 10px',
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    borderRadius: 'var(--radius-sm)',
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    background: isActive ? 'var(--accent-light)' : 'transparent',
                    marginBottom: 1,
                    transition: 'all 0.15s, justify-content 0.3s, padding 0.3s',
                  }}
                  className="hover:bg-[var(--bg)] hover:text-[var(--text-primary)]"
                >
                  <i className={`fas ${link.icon}`} style={{ width: 16, textAlign: 'center', fontSize: 13, flexShrink: 0 }}></i>
                  {!isCollapsed && <span style={{ whiteSpace: 'nowrap' }}>{link.label}</span>}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div style={{ padding: 12, borderTop: '1px solid var(--border)', overflow: 'hidden' }}>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            display: 'flex', alignItems: 'center', gap: isCollapsed ? 0 : 9, padding: isCollapsed ? '8px 0' : '8px 10px', width: '100%',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
            background: 'none', border: 'none', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', transition: 'all 0.15s',
            marginBottom: 4,
          }}
          className="hover:bg-[var(--bg)]"
          title={isCollapsed ? "ขยายแถบเมนู" : "ย่อแถบเมนู"}
        >
          <i className={`fas ${isCollapsed ? 'fa-chevron-right' : 'fa-list'}`} style={{ width: 16, textAlign: 'center', fontSize: 13, flexShrink: 0 }}></i>
          {!isCollapsed && <span style={{ whiteSpace: 'nowrap' }}>ย่อแถบเมนู</span>}
        </button>
        <Link
          href="/settings"
          title={isCollapsed ? "ตั้งค่า" : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: isCollapsed ? 0 : 9, padding: isCollapsed ? '8px 0' : '8px 10px',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
            textDecoration: 'none', fontSize: 13, fontWeight: 500,
            marginBottom: 4,
          }}
          className="hover:bg-[var(--bg)]"
        >
          <i className="fas fa-cog" style={{ width: 16, textAlign: 'center', fontSize: 13, flexShrink: 0 }}></i>
          {!isCollapsed && <span style={{ whiteSpace: 'nowrap' }}>ตั้งค่า</span>}
        </Link>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          title={isCollapsed ? "ออกจากระบบ" : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: isCollapsed ? 0 : 9, padding: isCollapsed ? '8px 0' : '8px 10px', width: '100%',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            borderRadius: 'var(--radius-sm)', color: 'var(--red)',
            background: 'none', border: 'none', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', transition: 'all 0.15s',
          }}
          className="hover:bg-[var(--red-light)]"
        >
          <i className="fas fa-sign-out-alt" style={{ width: 16, textAlign: 'center', fontSize: 13, flexShrink: 0 }}></i>
          {!isCollapsed && <span style={{ whiteSpace: 'nowrap' }}>ออกจากระบบ</span>}
        </button>
      </div>
    </aside>
  )
}
