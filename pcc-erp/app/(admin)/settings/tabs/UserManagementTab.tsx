import Link from 'next/link'
import type { SystemStats } from '@/app/actions/settings'
import StatCard from '../components/StatCard'

interface UserManagementTabProps {
  stats: SystemStats | null
}

const roleConfig = [
  { role: 'admin', label: 'Admin', icon: 'fa-user-shield', color: 'var(--accent)', bg: 'var(--accent-light)', desc: 'เข้าถึงได้ทุกส่วน' },
  { role: 'planner', label: 'Planner', icon: 'fa-calendar-alt', color: 'var(--indigo)', bg: 'var(--indigo-light)', desc: 'วางแผน + ใบสั่งผลิต' },
  { role: 'material', label: 'Material', icon: 'fa-dolly', color: 'var(--amber)', bg: 'var(--amber-light)', desc: 'เบิก-จ่ายวัตถุดิบ' },
  { role: 'concrete', label: 'Concrete', icon: 'fa-fill-drip', color: '#7C3AED', bg: '#EDE9FE', desc: 'ผสมคอนกรีต' },
  { role: 'warehouse', label: 'Warehouse', icon: 'fa-cubes', color: '#0891B2', bg: '#E0F2FE', desc: 'คลังสินค้า' },
  { role: 'qc', label: 'QC', icon: 'fa-microscope', color: 'var(--green)', bg: 'var(--green-light)', desc: 'ตรวจสอบคุณภาพ (Mobile)' },
  { role: 'worker', label: 'Worker', icon: 'fa-hard-hat', color: '#EA580C', bg: '#FFF7ED', desc: 'หน้างาน (QR Login)' },
]

export default function UserManagementTab({ stats }: UserManagementTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <StatCard
          icon="fa-users"
          label="ผู้ใช้งานทั้งหมด"
          value={stats?.totalUsers ?? '—'}
          color="var(--accent)"
          bgColor="var(--accent-light)"
        />
        <StatCard
          icon="fa-user-check"
          label="ใช้งานปกติ (Active)"
          value={stats?.activeUsers ?? '—'}
          color="var(--green)"
          bgColor="var(--green-light)"
        />
      </div>

      {/* Roles Overview */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>สิทธิ์การใช้งาน (Roles)</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>ระบบมีทั้งหมด 7 ระดับสิทธิ์</div>
          </div>
          <Link href="/users" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            background: 'var(--accent)',
            color: 'white',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            textDecoration: 'none',
          }}>
            <i className="fas fa-users-cog" />
            จัดการผู้ใช้งาน
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0 }}>
          {roleConfig.map((r, i) => (
            <div
              key={r.role}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 20px',
                borderBottom: i < roleConfig.length - 1 ? '1px solid var(--border)' : undefined,
                borderRight: i % 2 === 0 ? '1px solid var(--border)' : undefined,
              }}
            >
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: r.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <i className={`fas ${r.icon}`} style={{ fontSize: 15, color: r.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{r.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.desc}</div>
              </div>
              <span style={{
                padding: '2px 8px',
                background: r.bg,
                color: r.color,
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
              }}>
                {r.role === 'worker' ? 'QR' : r.role === 'qc' ? 'Mobile' : 'Desktop'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Links */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          ลิงค์ด่วน
        </div>
        {[
          { href: '/users', icon: 'fa-user-plus', label: 'เพิ่มผู้ใช้งานใหม่', desc: 'สร้างบัญชีและกำหนดสิทธิ์', color: 'var(--accent)' },
          { href: '/users', icon: 'fa-qrcode', label: 'จัดการ QR Token พนักงาน', desc: 'สร้าง/Regenerate QR Code สำหรับ Worker', color: '#EA580C' },
          { href: '/users', icon: 'fa-ban', label: 'ระงับ/เปิดใช้งานบัญชี', desc: 'เปลี่ยนสถานะ Active/Inactive', color: 'var(--red)' },
        ].map((link) => (
          <Link
            key={link.href + link.label}
            href={link.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '13px 20px',
              borderBottom: '1px solid var(--border)',
              textDecoration: 'none',
              transition: 'background 0.12s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
          >
            <i className={`fas ${link.icon}`} style={{ fontSize: 15, color: link.color, width: 20, textAlign: 'center' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{link.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{link.desc}</div>
            </div>
            <i className="fas fa-chevron-right" style={{ fontSize: 11, color: 'var(--text-muted)' }} />
          </Link>
        ))}
        <div style={{ height: 1 }} />
      </div>
    </div>
  )
}
