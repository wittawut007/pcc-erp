'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import type { UserRole } from '@/lib/supabase/types'

interface NavLink {
  href: string
  icon: string
  label: string
  roles: UserRole[]
}

interface NavSection {
  label: string
  links: NavLink[]
}

const allNavItems: NavSection[] = [
  {
    label: 'MAIN',
    links: [
      {
        href: '/dashboard',
        icon: 'fa-chart-line',
        label: 'Dashboard',
        roles: ['admin', 'planner', 'material', 'concrete', 'warehouse'],
      },
    ],
  },
  {
    label: 'PRODUCTION',
    links: [
      { href: '/planner',          icon: 'fa-calendar-alt',   label: 'แผนการผลิต',      roles: ['admin', 'planner'] },
      { href: '/production-order', icon: 'fa-file-invoice',   label: 'ใบสั่งผลิต',      roles: ['admin', 'planner'] },
      { href: '/job-orders',       icon: 'fa-clipboard-list', label: 'คิวงานเทคอนกรีต',     roles: ['admin', 'planner'] },
      { href: '/demolding',        icon: 'fa-hammer',         label: 'งานตัดยก',         roles: ['admin', 'planner'] },
      { href: '/qc',               icon: 'fa-microscope',     label: 'การจัดการของเสีย', roles: ['admin', 'planner'] },
    ],
  },
  {
    label: 'MATERIAL',
    links: [
      { href: '/material',         icon: 'fa-dolly',          label: 'เบิกจ่ายวัตถุดิบ', roles: ['admin', 'material'] },
    ],
  },
  {
    label: 'CONCRETE',
    links: [
      { href: '/concrete',         icon: 'fa-fill-drip',      label: 'คิวผสมคอนกรีต',  roles: ['admin', 'concrete'] },
    ],
  },
  {
    label: 'INVENTORY',
    links: [
      { href: '/inventory/raw', icon: 'fa-layer-group', label: 'คลังวัตถุดิบ',    roles: ['admin', 'material', 'warehouse'] },
      { href: '/inventory/fg',  icon: 'fa-cubes',       label: 'สินค้าพร้อมขาย',  roles: ['admin', 'warehouse'] },
    ],
  },
  {
    label: 'SYSTEM',
    links: [
      { href: '/products',     icon: 'fa-box-open',       label: 'ข้อมูลสินค้า',    roles: ['admin', 'planner'] },
      { href: '/users',        icon: 'fa-users-cog',      label: 'จัดการผู้ใช้งาน', roles: ['admin'] },
      { href: '/logs',         icon: 'fa-history',        label: 'ประวัติการทำงาน', roles: ['admin'] },
    ],
  },
]

interface SidebarProps {
  role: UserRole
}

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isCollapsed, setIsCollapsed] = useState(false)

  const navItems = allNavItems
    .map((section) => ({
      ...section,
      links: section.links.filter((link) => link.roles.includes(role)),
    }))
    .filter((section) => section.links.length > 0)

  return (
    <aside
      style={{
        width: isCollapsed ? 64 : 200,
        minWidth: isCollapsed ? 64 : 200,
        maxWidth: isCollapsed ? 64 : 200,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#fff',
        borderRight: '1px solid #EBEBF0',
        flexShrink: 0,
        transition: 'width 0.25s, min-width 0.25s',
        overflow: 'hidden',
        zIndex: 10,
      }}
    >
      {/* ── Logo ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isCollapsed ? 0 : 8,
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          padding: isCollapsed ? '0' : '0 18px',
          height: 80,
          borderBottom: '1px solid #EBEBF0',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: '#2563EB',
            borderRadius: 8,
            width: 30,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
          }}
          title={isCollapsed ? 'PCC POST-TENSION' : undefined}
        >
          <img 
            src="/logo.png" 
            alt="TP Logo" 
            style={{ width: '20px', height: '20px', objectFit: 'contain' }}
            onError={(e) => {
              // Fallback to icon if image not found yet
              (e.target as HTMLImageElement).style.display = 'none';
              e.currentTarget.parentElement?.insertAdjacentHTML('beforeend', '<i class="fas fa-industry" style="color: #fff; font-size: 13px"></i>');
            }}
          />
        </div>
        {!isCollapsed && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: '#1A1B23',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
              lineHeight: 1.2,
            }}
          >
            PCC <span style={{ color: '#2563EB' }}>POST-TENSION</span>
          </span>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: isCollapsed ? '12px 6px' : '12px 8px',
        }}
      >
        {navItems.map((section, index) => (
          <div key={section.label}>
            {/* Section divider / label */}
            {isCollapsed ? (
              index !== 0 && (
                <div style={{ height: 1, background: '#F3F4F6', margin: '6px 4px' }} />
              )
            ) : (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#B0B7C3',
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  padding: '10px 8px 4px',
                  whiteSpace: 'nowrap',
                }}
              >
                {section.label}
              </div>
            )}

            {/* Nav links */}
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
                    gap: isCollapsed ? 0 : 8,
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    padding: isCollapsed ? '10px 0' : '7px 8px',
                    borderRadius: 8,
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#2563EB' : '#4B5563',
                    background: isActive ? '#EFF4FF' : 'transparent',
                    transition: 'background 0.12s, color 0.12s',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLAnchorElement).style.background = '#F7F8FA'
                      ;(e.currentTarget as HTMLAnchorElement).style.color = '#1A1B23'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'
                      ;(e.currentTarget as HTMLAnchorElement).style.color = '#4B5563'
                    }
                  }}
                >
                  <i
                    className={`fas ${link.icon}`}
                    style={{
                      fontSize: 14,
                      width: 16,
                      textAlign: 'center',
                      flexShrink: 0,
                      color: isActive ? '#2563EB' : '#9CA3AF',
                    }}
                  />
                  {!isCollapsed && <span>{link.label}</span>}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* ── Bottom ── */}
      <div
        style={{
          flexShrink: 0,
          borderTop: '1px solid #EBEBF0',
          padding: isCollapsed ? '8px 6px' : '8px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isCollapsed ? 0 : 8,
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            padding: isCollapsed ? '10px 0' : '7px 8px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            color: '#4B5563',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            transition: 'background 0.12s',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F7F8FA' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <i className={`fas ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`} style={{ fontSize: 14, width: 16, textAlign: 'center', flexShrink: 0, color: '#9CA3AF' }} />
          {!isCollapsed && <span>ย่อแถบเมนู</span>}
        </button>

        {role === 'admin' && (
          <Link
            href="/settings"
            title={isCollapsed ? 'ตั้งค่า' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: isCollapsed ? 0 : 8,
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              padding: isCollapsed ? '10px 0' : '7px 8px',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 500,
              color: '#4B5563',
              transition: 'background 0.12s',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#F7F8FA' }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
          >
            <i className="fas fa-cog" style={{ fontSize: 14, width: 16, textAlign: 'center', flexShrink: 0, color: '#9CA3AF' }} />
            {!isCollapsed && <span>ตั้งค่า</span>}
          </Link>
        )}


      </div>
    </aside>
  )
}
