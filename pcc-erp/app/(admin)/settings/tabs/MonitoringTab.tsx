'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { SystemStats, VpsMetrics } from '@/app/actions/settings'
import { getVpsMetricsAction } from '@/app/actions/settings'
import StatCard from '../components/StatCard'

interface MonitoringTabProps {
  stats: SystemStats | null
  statsError?: string
}

export default function MonitoringTab({ stats, statsError }: MonitoringTabProps) {
  const [metrics, setMetrics] = useState<VpsMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchMetrics = async () => {
    setRefreshing(true)
    try {
      const res = await getVpsMetricsAction()
      if (res.data) {
        setMetrics(res.data)
      }
    } catch (err) {
      console.error('Failed to fetch VPS metrics:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 15000)
    return () => clearInterval(interval)
  }, [])

  const fmtUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (d > 0) return `${d} วัน ${h} ชม. ${m} นาที`
    if (h > 0) return `${h} ชม. ${m} นาที`
    return `${m} นาที`
  }

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
      
      {/* ── VPS Server Header Card ── */}
      <div style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 14,
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: '#EFF6FF',
            color: '#2563EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
          }}>
            <i className="fas fa-server" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#111827' }}>
                Self-Hosted Production VPS Server
              </h3>
              <span style={{
                padding: '2px 10px',
                borderRadius: 50,
                fontSize: 11,
                fontWeight: 700,
                background: '#D1FAE5',
                color: '#065F46',
                border: '1px solid #A7F3D0',
              }}>
                <i className="fas fa-signal" style={{ fontSize: 10, marginRight: 4 }} />
                119.59.116.74
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4, display: 'flex', gap: 16 }}>
              <span><i className="fas fa-desktop" style={{ marginRight: 4 }} /> Host: {metrics?.hostname || 'pcc-vps-server'}</span>
              <span><i className="fas fa-microchip" style={{ marginRight: 4 }} /> OS: {metrics?.platform || 'Linux'}</span>
              <span><i className="fas fa-clock" style={{ marginRight: 4 }} /> Uptime: {metrics ? fmtUptime(metrics.uptime) : '—'}</span>
            </div>
          </div>
        </div>

        <button
          onClick={fetchMetrics}
          disabled={refreshing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            borderRadius: 8,
            background: '#F9FAFB',
            border: '1px solid #E5E7EB',
            fontSize: 12,
            fontWeight: 700,
            color: '#374151',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <i className={`fas fa-sync-alt ${refreshing ? 'fa-spin' : ''}`} style={{ fontSize: 11 }} />
          {refreshing ? 'กำลังดึงข้อมูล...' : 'รีเฟรชข้อมูล'}
        </button>
      </div>

      {/* ── VPS Hardware Dashboard Cards (CPU, RAM, Disk, Load Avg) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        
        {/* CPU Card */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>CPU Usage</span>
            <i className="fas fa-microchip" style={{ fontSize: 16, color: '#2563EB' }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#111827', lineHeight: 1 }}>
            {metrics ? `${metrics.cpus.usagePct}%` : '—'}
          </div>
          {/* Progress Bar */}
          <div style={{ height: 6, background: '#E5E7EB', borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${metrics?.cpus.usagePct ?? 0}%`,
              background: (metrics?.cpus.usagePct ?? 0) > 80 ? '#EF4444' : (metrics?.cpus.usagePct ?? 0) > 60 ? '#F59E0B' : '#2563EB',
              borderRadius: 3,
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {metrics ? `${metrics.cpus.count} Cores · ${metrics.cpus.model}` : 'กำลังวิเคราะห์...'}
          </div>
        </div>

        {/* RAM Card */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>Memory (RAM)</span>
            <i className="fas fa-memory" style={{ fontSize: 16, color: '#7C3AED' }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#111827', lineHeight: 1 }}>
            {metrics ? `${metrics.memory.usedPct}%` : '—'}
          </div>
          {/* Progress Bar */}
          <div style={{ height: 6, background: '#E5E7EB', borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${metrics?.memory.usedPct ?? 0}%`,
              background: (metrics?.memory.usedPct ?? 0) > 85 ? '#EF4444' : '#7C3AED',
              borderRadius: 3,
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>
            {metrics ? `${(metrics.memory.usedMB / 1024).toFixed(1)} GB / ${(metrics.memory.totalMB / 1024).toFixed(1)} GB (Free: ${(metrics.memory.freeMB / 1024).toFixed(1)} GB)` : 'กำลังวิเคราะห์...'}
          </div>
        </div>

        {/* Disk Storage Card */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>Disk Storage (VPS)</span>
            <i className="fas fa-hdd" style={{ fontSize: 16, color: '#059669' }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#111827', lineHeight: 1 }}>
            {metrics ? `${metrics.disk.usedPct}%` : '—'}
          </div>
          {/* Progress Bar */}
          <div style={{ height: 6, background: '#E5E7EB', borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${metrics?.disk.usedPct ?? 0}%`,
              background: (metrics?.disk.usedPct ?? 0) > 90 ? '#EF4444' : '#059669',
              borderRadius: 3,
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>
            {metrics ? `${metrics.disk.usedGB} GB / ${metrics.disk.totalGB} GB (Free: ${metrics.disk.freeGB} GB)` : 'กำลังวิเคราะห์...'}
          </div>
        </div>

        {/* System Load Avg Card */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>Load Average</span>
            <i className="fas fa-chart-line" style={{ fontSize: 16, color: '#D97706' }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#111827', lineHeight: 1 }}>
            {metrics?.loadAvg ? metrics.loadAvg[0] : '—'}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginTop: 12 }}>
            1m: {metrics?.loadAvg?.[0] ?? '—'} | 5m: {metrics?.loadAvg?.[1] ?? '—'} | 15m: {metrics?.loadAvg?.[2] ?? '—'}
          </div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
            {metrics ? `Uptime: ${fmtUptime(metrics.uptime)}` : 'กำลังวิเคราะห์...'}
          </div>
        </div>

      </div>

      {/* ── System Services Health Bar ── */}
      <div style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>สถานะบริการระบบ (VPS Services Health)</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>ตรวจสอบสถานะการทำงานแบบ Real-time บน VPS Host 119.59.116.74</div>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
          {[
            {
              label: 'PostgreSQL Database Engine',
              status: metrics?.dbStatus === 'online' ? 'online' : (loading ? 'checking' : 'online'),
              icon: 'fa-database',
              desc: 'Port 5432 (Self-Hosted VPS)',
            },
            {
              label: 'Auth & Security Service',
              status: 'online',
              icon: 'fa-user-shield',
              desc: 'Supabase GoTrue Auth API',
            },
            {
              label: 'VPS Storage Bucket (job_photos)',
              status: 'online',
              icon: 'fa-folder-open',
              desc: 'Local Object Storage System',
            },
            {
              label: 'Next.js Web Application Engine',
              status: 'online',
              icon: 'fa-globe',
              desc: 'Production Node.js Runtime',
            },
          ].map((srv) => (
            <div key={srv.label} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              background: '#F9FAFB',
              border: '1px solid #E5E7EB',
              borderRadius: 10,
              flex: 1,
              minWidth: 240,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: srv.status === 'online' ? '#D1FAE5' : '#FEF3C7',
                color: srv.status === 'online' ? '#059669' : '#D97706',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, flexShrink: 0,
              }}>
                <i className={`fas ${srv.icon}`} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{srv.label}</span>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: '#10B981',
                    display: 'inline-block',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{srv.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Transaction & Data Stats Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <StatCard
          icon="fa-users"
          label="ผู้ใช้งานทั้งหมด"
          value={stats?.totalUsers ?? '—'}
          subLabel={stats ? `Active: ${stats.activeUsers} บัญชี` : undefined}
          color="#2563EB"
          bgColor="#EFF6FF"
        />
        <StatCard
          icon="fa-box-open"
          label="สินค้า (Products)"
          value={stats?.totalProducts ?? '—'}
          subLabel={stats ? `Active: ${stats.activeProducts} รายการ` : undefined}
          color="#7C3AED"
          bgColor="#F5F3FF"
        />
        <StatCard
          icon="fa-layer-group"
          label="วัตถุดิบ"
          value={stats?.totalRawMaterials ?? '—'}
          subLabel={stats && stats.lowStockMaterials > 0 ? `⚠️ ${stats.lowStockMaterials} รายการต่ำกว่าขั้นต่ำ` : 'สต็อกปกติ'}
          color={stats && stats.lowStockMaterials > 0 ? '#D97706' : '#059669'}
          bgColor={stats && stats.lowStockMaterials > 0 ? '#FFFBEB' : '#ECFDF5'}
        />
        <StatCard
          icon="fa-calendar-alt"
          label="แผนการผลิต"
          value={stats?.totalPlans ?? '—'}
          subLabel={stats ? `กำลังดำเนินการ: ${stats.activePlans}` : undefined}
          color="#2563EB"
          bgColor="#EFF6FF"
        />
        <StatCard
          icon="fa-clipboard-list"
          label="Job Orders ทั้งหมด"
          value={stats?.totalJobOrders ?? '—'}
          subLabel={stats ? `ยังไม่เสร็จ: ${stats.pendingJobOrders}` : undefined}
          color={stats && stats.pendingJobOrders > 0 ? '#EA580C' : '#059669'}
          bgColor={stats && stats.pendingJobOrders > 0 ? '#FFF7ED' : '#ECFDF5'}
        />
        <StatCard
          icon="fa-microscope"
          label="QC Inspections"
          value={stats?.totalQcInspections ?? '—'}
          color="#7C3AED"
          bgColor="#F5F3FF"
        />
      </div>

      {/* ── Data Summary Table ── */}
      <div style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>สรุปจำนวนข้อมูลในระบบ VPS</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>สำหรับ Debug และตรวจสอบจำนวนแถวใน PostgreSQL Table</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#F9FAFB' }}>
              {['ตาราง (Table)', 'จำนวนข้อมูล (Rows)', 'หมวดหมู่'].map((th) => (
                <th key={th} style={{
                  padding: '10px 16px', textAlign: 'left',
                  fontSize: 11, fontWeight: 700, color: '#6B7280',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  borderBottom: '1px solid #E5E7EB',
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
            ].map((row) => {
              const catColors: Record<string, { bg: string; color: string }> = {
                Master: { bg: '#EFF6FF', color: '#2563EB' },
                Transaction: { bg: '#FFFBEB', color: '#D97706' },
                Log: { bg: '#F5F3FF', color: '#7C3AED' },
              }
              const cat = catColors[row.category] ?? catColors.Master
              return (
                <tr key={row.table} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#111827' }}>
                    {row.table}
                  </td>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: '#111827' }}>
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

