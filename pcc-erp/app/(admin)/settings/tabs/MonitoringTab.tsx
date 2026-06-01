import Link from 'next/link'
import type { SystemStats } from '@/app/actions/settings'
import StatCard from '../components/StatCard'

interface MonitoringTabProps {
  stats: SystemStats | null
  statsError?: string
}

export default function MonitoringTab({ stats, statsError }: MonitoringTabProps) {
  if (statsError) {
    return (
      <div style={{
        padding: '24px',
        background: 'var(--red-light)',
        border: '1px solid #FECACA',
        borderRadius: 12,
        textAlign: 'center',
        color: 'var(--red)',
      }}>
        <i className="fas fa-exclamation-circle" style={{ fontSize: 28, marginBottom: 10, display: 'block' }} />
        <div style={{ fontSize: 14, fontWeight: 700 }}>ไม่สามารถโหลดข้อมูลได้</div>
        <div style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>{statsError}</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* System Health */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>สถานะระบบ (System Health)</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>ข้อมูล Real-time จาก Supabase</div>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          {[
            {
              label: 'Database',
              status: stats ? 'online' : 'error',
              icon: 'fa-database',
            },
            {
              label: 'Auth',
              status: stats ? 'online' : 'error',
              icon: 'fa-lock',
            },
            {
              label: 'Storage',
              status: 'online',
              icon: 'fa-cloud',
            },
          ].map((srv) => (
            <div key={srv.label} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              background: srv.status === 'online' ? 'var(--green-light)' : 'var(--red-light)',
              border: `1px solid ${srv.status === 'online' ? '#A7F3D0' : '#FECACA'}`,
              borderRadius: 8,
            }}>
              <i className={`fas ${srv.icon}`} style={{
                fontSize: 13,
                color: srv.status === 'online' ? 'var(--green)' : 'var(--red)',
              }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: srv.status === 'online' ? '#065F46' : '#DC2626' }}>
                {srv.label}
              </span>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: srv.status === 'online' ? 'var(--green)' : 'var(--red)',
                display: 'inline-block',
                animation: srv.status === 'online' ? 'pulse 2s infinite' : undefined,
              }} />
            </div>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <StatCard
          icon="fa-users"
          label="ผู้ใช้งานทั้งหมด"
          value={stats?.totalUsers ?? '—'}
          subLabel={stats ? `Active: ${stats.activeUsers}` : undefined}
          color="var(--accent)"
          bgColor="var(--accent-light)"
        />
        <StatCard
          icon="fa-box-open"
          label="สินค้า (Products)"
          value={stats?.totalProducts ?? '—'}
          subLabel={stats ? `Active: ${stats.activeProducts}` : undefined}
          color="var(--indigo)"
          bgColor="var(--indigo-light)"
        />
        <StatCard
          icon="fa-layer-group"
          label="วัตถุดิบ"
          value={stats?.totalRawMaterials ?? '—'}
          subLabel={stats && stats.lowStockMaterials > 0 ? `⚠️ ${stats.lowStockMaterials} ต่ำกว่าขั้นต่ำ` : 'สต็อกปกติ'}
          color={stats && stats.lowStockMaterials > 0 ? 'var(--amber)' : 'var(--green)'}
          bgColor={stats && stats.lowStockMaterials > 0 ? 'var(--amber-light)' : 'var(--green-light)'}
        />
        <StatCard
          icon="fa-calendar-alt"
          label="แผนการผลิต"
          value={stats?.totalPlans ?? '—'}
          subLabel={stats ? `กำลังดำเนินการ: ${stats.activePlans}` : undefined}
          color="var(--accent)"
          bgColor="var(--accent-light)"
        />
        <StatCard
          icon="fa-clipboard-list"
          label="Job Orders ทั้งหมด"
          value={stats?.totalJobOrders ?? '—'}
          subLabel={stats ? `ยังไม่เสร็จ: ${stats.pendingJobOrders}` : undefined}
          color={stats && stats.pendingJobOrders > 0 ? '#EA580C' : 'var(--green)'}
          bgColor={stats && stats.pendingJobOrders > 0 ? '#FFF7ED' : 'var(--green-light)'}
        />
        <StatCard
          icon="fa-microscope"
          label="QC Inspections"
          value={stats?.totalQcInspections ?? '—'}
          color="var(--indigo)"
          bgColor="var(--indigo-light)"
        />
      </div>

      {/* Activity Log Quick View */}
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
            <div style={{ fontSize: 14, fontWeight: 700 }}>Activity Logs</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {stats ? `มีทั้งหมด ${stats.totalActivityLogs} records` : 'กำลังโหลด...'}
            </div>
          </div>
          <Link href="/logs" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', background: 'var(--bg)', color: 'var(--text-primary)',
            borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none',
            border: '1px solid var(--border)',
          }}>
            <i className="fas fa-external-link-alt" />ดูทั้งหมด
          </Link>
        </div>
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fas fa-history" style={{ fontSize: 28, marginBottom: 8, display: 'block', opacity: 0.3 }} />
          <div style={{ fontSize: 12 }}>ไปที่หน้า <Link href="/logs" style={{ color: 'var(--accent)', fontWeight: 700 }}>ประวัติการทำงาน</Link> เพื่อดูรายละเอียด</div>
        </div>
      </div>

      {/* Data Summary Table */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>สรุปจำนวนข้อมูลในระบบ</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>สำหรับ Debug และตรวจสอบ</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              {['ตาราง (Table)', 'จำนวนข้อมูล', 'หมวดหมู่'].map((th) => (
                <th key={th} style={{
                  padding: '9px 16px', textAlign: 'left',
                  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  borderBottom: '1px solid var(--border)',
                }}>
                  {th}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { table: 'profiles', value: stats?.totalUsers, category: 'Master' },
              { table: 'products', value: stats?.totalProducts, category: 'Master' },
              { table: 'raw_materials', value: stats?.totalRawMaterials, category: 'Master' },
              { table: 'production_plans', value: stats?.totalPlans, category: 'Transaction' },
              { table: 'job_orders', value: stats?.totalJobOrders, category: 'Transaction' },
              { table: 'qc_inspections', value: stats?.totalQcInspections, category: 'Transaction' },
              { table: 'activity_logs', value: stats?.totalActivityLogs, category: 'Log' },
            ].map((row, i) => {
              const catColors: Record<string, { bg: string; color: string }> = {
                Master: { bg: 'var(--accent-light)', color: 'var(--accent)' },
                Transaction: { bg: 'var(--amber-light)', color: 'var(--amber)' },
                Log: { bg: 'var(--indigo-light)', color: 'var(--indigo)' },
              }
              const cat = catColors[row.category] ?? catColors.Master
              return (
                <tr key={row.table} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {row.table}
                  </td>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {row.value !== undefined ? row.value.toLocaleString() : '—'}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      padding: '2px 8px', background: cat.bg, color: cat.color,
                      borderRadius: 4, fontSize: 10, fontWeight: 700,
                    }}>
                      {row.category}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
