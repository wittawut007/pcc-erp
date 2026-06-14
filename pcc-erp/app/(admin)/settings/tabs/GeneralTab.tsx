import type { SystemStats } from '@/app/actions/settings'
import StatCard from '../components/StatCard'

interface GeneralTabProps {
  stats: SystemStats | null
}

export default function GeneralTab({ stats }: GeneralTabProps) {
  const buildVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0'
  const environment = process.env.NODE_ENV ?? 'development'
  const supabaseProject = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]
    : 'not-configured'

  const envColors: Record<string, { color: string; bg: string; label: string }> = {
    production: { color: '#10B981', bg: '#ECFDF5', label: 'Production' },
    development: { color: '#F59E0B', bg: '#FFFBEB', label: 'Development' },
    test: { color: '#6366F1', bg: '#EEF2FF', label: 'Testing' },
  }
  const envStyle = envColors[environment] ?? envColors.development

  const infoRows = [
    {
      label: 'ชื่อระบบ',
      value: 'PCC ERP — Post-Tension Production Management',
      icon: 'fa-industry',
    },
    {
      label: 'เวอร์ชันระบบ',
      value: `v${buildVersion}`,
      icon: 'fa-code-branch',
    },
    {
      label: 'เฟรมเวิร์ค',
      value: 'Next.js 16 · Supabase · TypeScript',
      icon: 'fa-layer-group',
    },
    {
      label: 'Supabase Project',
      value: supabaseProject,
      icon: 'fa-database',
    },
    {
      label: 'โซนเวลา (Timezone)',
      value: 'Asia/Bangkok (UTC+7)',
      icon: 'fa-clock',
    },
    {
      label: 'วันที่ปัจจุบัน',
      value: new Intl.DateTimeFormat('th-TH', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date()),
      icon: 'fa-calendar-alt',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Card */}
      <div style={{
        background: 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 60%, #3B82F6 100%)',
        borderRadius: 14,
        padding: '24px 28px',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
      }}>
        <div style={{
          width: 60,
          height: 60,
          background: 'rgba(255,255,255,0.15)',
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <i className="fas fa-building" style={{ fontSize: 26, color: 'white' }} />
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>
            PCC POST-TENSION CO., LTD.
          </div>
          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
            ระบบบริหารจัดการการผลิต ERP
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              padding: '3px 12px',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 700,
            }}>
              <i className="fas fa-check-circle" style={{ marginRight: 5 }} />
              ระบบทำงานปกติ
            </span>
            <span style={{
              padding: '3px 12px',
              background: envStyle.bg,
              color: envStyle.color,
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 800,
            }}>
              ENV: {envStyle.label.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Info Rows */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          ข้อมูลระบบ
        </div>
        {infoRows.map((row, i) => (
          <div
            key={row.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '14px 20px',
              borderBottom: i < infoRows.length - 1 ? '1px solid var(--border)' : undefined,
              gap: 14,
            }}
          >
            <div style={{
              width: 32,
              height: 32,
              background: 'var(--accent-light)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <i className={`fas ${row.icon}`} style={{ fontSize: 13, color: 'var(--accent)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{row.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{row.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <StatCard
          icon="fa-users"
          label="ผู้ใช้ในระบบ"
          value={stats ? stats.totalUsers.toLocaleString() : '—'}
          subLabel={stats ? `ใช้งานอยู่ ${stats.activeUsers.toLocaleString()} บัญชี` : 'กำลังโหลด...'}
          size="sm"
        />
        <StatCard
          icon="fa-box-open"
          label="สินค้าทั้งหมด"
          value={stats ? stats.totalProducts.toLocaleString() : '—'}
          subLabel={stats ? `เปิดใช้งานอยู่ ${stats.activeProducts.toLocaleString()} รายการ` : 'กำลังโหลด...'}
          size="sm"
          color="var(--green)"
          bgColor="var(--green-light)"
        />
        <StatCard
          icon="fa-clipboard-list"
          label="Job Orders"
          value={stats ? stats.totalJobOrders.toLocaleString() : '—'}
          subLabel={stats ? `รอดำเนินการ ${stats.pendingJobOrders.toLocaleString()} รายการ` : 'กำลังโหลด...'}
          size="sm"
          color="var(--amber)"
          bgColor="var(--amber-light)"
        />
      </div>

      {/* Info Note */}
      <div style={{
        padding: '12px 16px',
        background: 'var(--accent-light)',
        border: '1px solid var(--accent-soft)',
        borderRadius: 10,
        fontSize: 12,
        color: '#1D4ED8',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}>
        <i className="fas fa-info-circle" style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }} />
        <span>
          หน้า <strong>Settings</strong> นี้สำหรับ Admin เท่านั้น การเปลี่ยนแปลงข้อมูลหลักและการรีเซ็ตระบบ
          จะมีผลต่อข้อมูลจริงใน Production Database ทันที กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการทุกครั้ง
        </span>
      </div>
    </div>
  )
}
