'use client'

import { useEffect, useState } from 'react'
import { getSupabaseUsageAction, type SupabaseUsageSummary } from '@/app/actions/settings'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts'

// Quota definitions (Free Tier limits)
const DB_SIZE_LIMIT = 500 * 1024 * 1024 // 500 MB in bytes
const STORAGE_SIZE_LIMIT = 1024 * 1024 * 1024 // 1 GB in bytes
const AUTH_USERS_LIMIT = 50000

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export default function SupabaseTab() {
  const [data, setData] = useState<SupabaseUsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchUsage = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getSupabaseUsageAction()
      if (res.error) {
        setError(res.error)
      } else if (res.data) {
        setData(res.data)
        setLastUpdated(new Date())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการดึงข้อมูล')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsage()
  }, [])

  if (loading && !data) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '300px',
        color: 'var(--text-secondary)'
      }}>
        <i className="fas fa-spinner fa-spin" style={{ fontSize: 32, marginBottom: 12, color: '#3ECF8E' }} />
        <span style={{ fontSize: 13 }}>กำลังดึงข้อมูล Usage Summary จาก Supabase...</span>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div style={{
        padding: '24px',
        background: 'var(--red-light)',
        border: '1px solid var(--red)',
        borderRadius: 10,
        color: 'var(--red)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="fas fa-exclamation-triangle" style={{ fontSize: 18 }} />
          <strong style={{ fontSize: 14 }}>เกิดข้อผิดพลาดในการโหลดข้อมูล</strong>
        </div>
        <div style={{ fontSize: 13 }}>{error}</div>
        <button
          onClick={fetchUsage}
          style={{
            alignSelf: 'flex-start',
            padding: '6px 12px',
            background: 'var(--red)',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700
          }}
        >
          ลองใหม่อีกครั้ง
        </button>
      </div>
    )
  }

  const db = data?.db
  const api = data?.api

  // Calculate percentages for quotas
  const dbPercent = db ? Math.min((db.db_size / DB_SIZE_LIMIT) * 100, 100) : 0
  const storagePercent = db ? Math.min((db.storage.total_size / STORAGE_SIZE_LIMIT) * 100, 100) : 0
  const authPercent = db ? Math.min((db.auth.total_users / AUTH_USERS_LIMIT) * 100, 100) : 0
  const connPercent = db ? Math.min((db.connections.active / db.connections.max) * 100, 100) : 0

  const getProgressColor = (percent: number) => {
    if (percent > 90) return 'var(--red)'
    if (percent > 70) return 'var(--amber)'
    return '#3ECF8E' // Supabase Green
  }

  const formatChartDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return dateStr
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="fade-in">
      {/* Header Info */}
      <div style={{
        background: '#181818',
        borderRadius: 14,
        padding: '24px 28px',
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
        border: '1px solid #2e2e2e'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 48,
            height: 48,
            background: 'rgba(62, 207, 142, 0.15)',
            border: '1px solid rgba(62, 207, 142, 0.3)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#3ECF8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Supabase Platform</h3>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(62, 207, 142, 0.1)',
                color: '#3ECF8E',
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 20,
                fontWeight: 700,
                border: '1px solid rgba(62, 207, 142, 0.2)'
              }}>
                <span style={{
                  width: 6,
                  height: 6,
                  background: '#3ECF8E',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'pulse 2s infinite'
                }} />
                Active & Healthy
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#a8a8a8', marginTop: 4, display: 'flex', gap: 12 }}>
              <span>Project Ref: <code style={{ color: '#3ECF8E', background: '#262626', padding: '1px 4px', borderRadius: 4 }}>{data?.project_ref}</code></span>
              <span>Region: {data?.region}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: '#888' }}>
              อัปเดตล่าสุด: {lastUpdated.toLocaleTimeString('th-TH')}
            </span>
          )}
          <button
            onClick={fetchUsage}
            disabled={loading}
            style={{
              padding: '8px 14px',
              background: '#262626',
              color: 'white',
              border: '1px solid #3e3e3e',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#333'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#262626'}
          >
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`} style={{ color: '#3ECF8E' }} />
            รีเฟรชข้อมูล
          </button>
        </div>
      </div>

      {/* Resource Limit Quotas Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {/* DB Size */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 16,
          boxShadow: 'var(--shadow)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8 }}>
            <span>Database Size</span>
            <i className="fas fa-server" style={{ color: '#3ECF8E' }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>
            {db ? formatBytes(db.db_size) : '—'}
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 4 }}>
              / {formatBytes(DB_SIZE_LIMIT)}
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{
              width: `${dbPercent}%`,
              height: '100%',
              background: getProgressColor(dbPercent),
              borderRadius: 3,
              transition: 'width 0.5s ease-out'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
            <span>{dbPercent.toFixed(1)}% ใช้ไป</span>
            <span>ขีดจำกัด Free Tier 500MB</span>
          </div>
        </div>

        {/* Storage Size */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 16,
          boxShadow: 'var(--shadow)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8 }}>
            <span>Storage Size</span>
            <i className="fas fa-folder-open" style={{ color: 'var(--indigo)' }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>
            {db ? formatBytes(db.storage.total_size) : '—'}
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 4 }}>
              / {formatBytes(STORAGE_SIZE_LIMIT)}
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{
              width: `${storagePercent}%`,
              height: '100%',
              background: getProgressColor(storagePercent),
              borderRadius: 3,
              transition: 'width 0.5s ease-out'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
            <span>{storagePercent.toFixed(1)}% ใช้ไป</span>
            <span>ไฟล์รวม {db?.storage.total_files ?? 0} ไฟล์</span>
          </div>
        </div>

        {/* Auth Users */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 16,
          boxShadow: 'var(--shadow)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8 }}>
            <span>Auth Users</span>
            <i className="fas fa-user-lock" style={{ color: 'var(--green)' }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>
            {db ? db.auth.total_users.toLocaleString() : '—'}
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 4 }}>
              / {AUTH_USERS_LIMIT.toLocaleString()}
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{
              width: `${authPercent}%`,
              height: '100%',
              background: getProgressColor(authPercent),
              borderRadius: 3,
              transition: 'width 0.5s ease-out'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
            <span>{authPercent.toFixed(2)}% ใช้ไป</span>
            <span>+ {db?.auth.created_last_30_days ?? 0} คน (30 วันล่าสุด)</span>
          </div>
        </div>

        {/* DB Connections */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 16,
          boxShadow: 'var(--shadow)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8 }}>
            <span>Active Connections</span>
            <i className="fas fa-plug" style={{ color: 'var(--amber)' }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>
            {db ? db.connections.active : '—'}
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 4 }}>
              / {db?.connections.max ?? '—'}
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{
              width: `${connPercent}%`,
              height: '100%',
              background: getProgressColor(connPercent),
              borderRadius: 3,
              transition: 'width 0.5s ease-out'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
            <span>{connPercent.toFixed(1)}% โหลดการเชื่อมต่อ</span>
            <span>Postgres version: {db?.postgres_version.split(' ')[1] ?? '17.6'}</span>
          </div>
        </div>
      </div>

      {/* API Request Activity Chart */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '20px 24px',
        boxShadow: 'var(--shadow)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
              ปริมาณการเรียกใช้งาน API (API Requests Count)
            </h4>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              การเรียกใช้งาน API ทั้งหมด แยกตามประเภทบริการหลักของ Supabase ในรอบ 24 ชั่วโมงล่าสุด
            </div>
          </div>
          {api && (
            <div style={{
              background: 'var(--accent-light)',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--accent)'
            }}>
              รวม {api.total_requests.toLocaleString()} Requests (บิลลิ่งนี้)
            </div>
          )}
        </div>

        {api && api.time_series && api.time_series.length > 0 ? (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={api.time_series}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorRest" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorAuth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorStorage" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatChartDate}
                  style={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                />
                <YAxis style={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                <Tooltip
                  labelFormatter={(label) => new Date(label).toLocaleString('th-TH')}
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 12,
                    boxShadow: 'var(--shadow-md)'
                  }}
                />
                <Legend style={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  name="Database API (REST)"
                  dataKey="total_rest_requests"
                  stroke="#2563EB"
                  fillOpacity={1}
                  fill="url(#colorRest)"
                  stackId="1"
                />
                <Area
                  type="monotone"
                  name="Auth (GoTrue)"
                  dataKey="total_auth_requests"
                  stroke="#10B981"
                  fillOpacity={1}
                  fill="url(#colorAuth)"
                  stackId="1"
                />
                <Area
                  type="monotone"
                  name="Storage API"
                  dataKey="total_storage_requests"
                  stroke="#6366F1"
                  fillOpacity={1}
                  fill="url(#colorStorage)"
                  stackId="1"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{
            height: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: 12,
            border: '1px dashed var(--border)',
            borderRadius: 8
          }}>
            ไม่มีข้อมูลประวัติ API ในช่วงเวลานี้ (ต้องการ SUPABASE_ACCESS_TOKEN ที่ถูกต้อง)
          </div>
        )}
      </div>

      {/* Two Column Layout for Table Sizes and Buckets */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 16 }}>
        {/* Table Sizes */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
          boxShadow: 'var(--shadow)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>
            <i className="fas fa-table" style={{ marginRight: 8, color: '#3ECF8E' }} />
            ขนาดพื้นที่จัดเก็บรายตาราง (Table Storage Breakdown)
          </h4>
          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '8px 4px', fontWeight: 600 }}>ตาราง (Table)</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>แถว (Rows)</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>ขนาดข้อมูล (Data)</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>ดัชนี (Indexes)</th>
                </tr>
              </thead>
              <tbody>
                {db && db.tables && db.tables.length > 0 ? (
                  db.tables.map((table, i) => (
                    <tr
                      key={table.table_name}
                      style={{
                        borderBottom: i < db.tables.length - 1 ? '1px solid var(--border)' : undefined,
                        color: 'var(--text-primary)'
                      }}
                    >
                      <td style={{ padding: '10px 4px', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                        {table.table_name.replace('public.', '')}
                      </td>
                      <td style={{ padding: '10px 4px', textAlign: 'right', fontWeight: 600 }}>
                        {table.row_count.toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 4px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {formatBytes(table.table_size)}
                      </td>
                      <td style={{ padding: '10px 4px', textAlign: 'right', color: 'var(--text-muted)' }}>
                        {formatBytes(table.index_size)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                      ไม่มีตารางข้อมูล
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Storage Buckets */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
          boxShadow: 'var(--shadow)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>
            <i className="fas fa-boxes" style={{ marginRight: 8, color: 'var(--indigo)' }} />
            ถังจัดเก็บไฟล์ (Storage Buckets Breakdown)
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
            {db && db.storage.buckets && db.storage.buckets.length > 0 ? (
              db.storage.buckets.map((bucket) => {
                const percent = Math.min((bucket.total_size / STORAGE_SIZE_LIMIT) * 100, 100)
                return (
                  <div
                    key={bucket.id}
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-box" style={{ color: 'var(--indigo)', fontSize: 13 }} />
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                          {bucket.name}
                        </span>
                        <code style={{ fontSize: 10, background: 'var(--border)', padding: '1px 5px', borderRadius: 4, color: 'var(--text-secondary)' }}>
                          {bucket.id}
                        </code>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {formatBytes(bucket.total_size)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
                      <span>จำนวนไฟล์: <strong>{bucket.file_count.toLocaleString()}</strong> ไฟล์</span>
                      <span>{percent.toFixed(2)}% ของพื้นที่ระบบ</span>
                    </div>

                    <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        width: `${percent}%`,
                        height: '100%',
                        background: 'var(--indigo)',
                        borderRadius: 2
                      }} />
                    </div>
                  </div>
                )
              })
            ) : (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontSize: 12,
                border: '1px dashed var(--border)',
                borderRadius: 8,
                padding: 40
              }}>
                ไม่พบข้อมูลถังจัดเก็บไฟล์
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(62, 207, 142, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(62, 207, 142, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(62, 207, 142, 0); }
        }
      `}</style>
    </div>
  )
}
