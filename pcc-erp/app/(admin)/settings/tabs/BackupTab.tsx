'use client'

import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  getBackupLogsAction,
  getBackupStatsAction,
  getBackupScheduleAction,
  updateBackupScheduleAction,
  getBackupDownloadUrlAction,
  deleteBackupAction,
  type BackupLog,
  type BackupStats,
  type BackupScheduleConfig,
} from '@/app/actions/backup'

// ─── Utility ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('th-TH', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'เมื่อกี้'
  if (mins < 60) return `${mins} นาทีที่แล้ว`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`
  return `${Math.floor(hrs / 24)} วันที่แล้ว`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BackupLog['status'] }) {
  const config: Record<BackupLog['status'], { color: string; bg: string; icon: string; label: string }> = {
    success: { color: '#059669', bg: '#D1FAE5', icon: 'fa-check-circle', label: 'สำเร็จ' },
    failed:  { color: '#DC2626', bg: '#FEE2E2', icon: 'fa-times-circle', label: 'ล้มเหลว' },
    running: { color: '#D97706', bg: '#FEF3C7', icon: 'fa-spinner fa-spin', label: 'กำลังทำงาน' },
  }
  const c = config[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 20,
      background: c.bg, color: c.color,
      fontSize: 11, fontWeight: 700,
    }}>
      <i className={`fas ${c.icon}`} style={{ fontSize: 10 }} />
      {c.label}
    </span>
  )
}

function StatCard({ icon, label, value, sub, color }: {
  icon: string; label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '16px 20px',
      display: 'flex', flexDirection: 'column', gap: 6,
      flex: '1 1 160px', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: color ? `${color}22` : 'var(--accent-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i className={`fas ${icon}`} style={{ fontSize: 13, color: color ?? 'var(--accent)' }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({ log, onConfirm, onClose }: {
  log: BackupLog; onConfirm: () => void; onClose: () => void
}) {
  const [inputVal, setInputVal] = useState('')
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16, padding: 28,
        maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: '#FEE2E2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="fas fa-trash" style={{ color: '#DC2626', fontSize: 16 }} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>ยืนยันการลบ Backup</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.file_name}</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
          การลบ Backup นี้ไม่สามารถกู้คืนได้ กรุณาพิมพ์ <strong style={{ color: '#DC2626' }}>DELETE</strong> เพื่อยืนยัน
        </p>
        <input
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          placeholder="พิมพ์ DELETE เพื่อยืนยัน"
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text-primary)', fontSize: 13, marginBottom: 16,
          }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '9px 16px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>ยกเลิก</button>
          <button
            onClick={onConfirm}
            disabled={inputVal !== 'DELETE'}
            style={{
              flex: 1, padding: '9px 16px', borderRadius: 8, border: 'none',
              background: inputVal === 'DELETE' ? '#DC2626' : '#FECACA',
              color: '#fff', cursor: inputVal === 'DELETE' ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 700,
            }}
          >
            <i className="fas fa-trash" style={{ marginRight: 6 }} />
            ลบ Backup
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BackupTab() {
  const [logs, setLogs] = useState<BackupLog[]>([])
  const [stats, setStats] = useState<BackupStats | null>(null)
  const [schedule, setSchedule] = useState<BackupScheduleConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BackupLog | null>(null)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({
    is_enabled: true,
    schedule_hour: 2,
    schedule_minute: 0,
    retention_days: 30,
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    const [logsRes, statsRes, schedRes] = await Promise.all([
      getBackupLogsAction(30),
      getBackupStatsAction(),
      getBackupScheduleAction(),
    ])
    if (logsRes.data) setLogs(logsRes.data)
    if (statsRes.data) setStats(statsRes.data)
    if (schedRes.data) {
      setSchedule(schedRes.data)
      setScheduleForm({
        is_enabled: schedRes.data.is_enabled,
        schedule_hour: schedRes.data.schedule_hour,
        schedule_minute: schedRes.data.schedule_minute,
        retention_days: schedRes.data.retention_days,
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Auto-refresh เมื่อมี backup running
  useEffect(() => {
    const hasRunning = logs.some(l => l.status === 'running')
    if (!hasRunning) return
    const timer = setTimeout(() => loadData(), 5000)
    return () => clearTimeout(timer)
  }, [logs, loadData])

  async function handleManualBackup() {
    setIsBackingUp(true)
    const toastId = toast.loading('กำลัง Backup ฐานข้อมูล...')
    try {
      const res = await fetch('/api/admin/backup/trigger', { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        toast.success(`Backup สำเร็จ! ${json.fileName} (${formatBytes(json.fileSizeBytes)})`, { id: toastId, duration: 5000 })
        await loadData()
      } else {
        toast.error(json.error ?? 'Backup ล้มเหลว', { id: toastId })
      }
    } catch {
      toast.error('เชื่อมต่อ Server ไม่ได้', { id: toastId })
    } finally {
      setIsBackingUp(false)
    }
  }

  async function handleDownload(log: BackupLog) {
    const toastId = toast.loading('กำลังสร้าง Download Link...')
    const res = await getBackupDownloadUrlAction(log.id)
    if (res.url) {
      toast.success('เปิด Download Link แล้ว', { id: toastId })
      window.open(res.url, '_blank')
    } else {
      toast.error(res.error ?? 'ไม่สามารถสร้าง Link ได้', { id: toastId })
    }
  }

  async function handleDelete(log: BackupLog) {
    setDeleteTarget(null)
    const toastId = toast.loading('กำลังลบ Backup...')
    const res = await deleteBackupAction(log.id)
    if (res.success) {
      toast.success('ลบ Backup สำเร็จ', { id: toastId })
      await loadData()
    } else {
      toast.error(res.error ?? 'ลบไม่สำเร็จ', { id: toastId })
    }
  }

  async function handleSaveSchedule() {
    setSavingSchedule(true)
    const res = await updateBackupScheduleAction(scheduleForm)
    if (res.success) {
      toast.success('บันทึกการตั้งค่า Backup สำเร็จ')
      await loadData()
    } else {
      toast.error(res.error ?? 'บันทึกไม่สำเร็จ')
    }
    setSavingSchedule(false)
  }

  // ─── Schedule time display ─────────────────────────────────────────────────
  const scheduleTimeDisplay = schedule
    ? `${String(schedule.schedule_hour).padStart(2, '0')}:${String(schedule.schedule_minute).padStart(2, '0')} น. (ทุกวัน)`
    : '—'

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
        <i className="fas fa-spinner fa-spin" style={{ fontSize: 32, color: 'var(--accent)' }} />
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>กำลังโหลดข้อมูล Backup...</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ─── Stats Row ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <StatCard
          icon="fa-check-circle" label="สำเร็จทั้งหมด"
          value={stats?.success ?? 0}
          sub={`จาก ${stats?.total ?? 0} ครั้ง`}
          color="#059669"
        />
        <StatCard
          icon="fa-clock" label="Backup ล่าสุด"
          value={stats?.last_success ? timeAgo(stats.last_success.backup_started_at) : 'ยังไม่มี'}
          sub={stats?.last_success?.file_name?.slice(0, 28) ?? '—'}
          color="var(--accent)"
        />
        <StatCard
          icon="fa-hdd" label="ขนาดรวม"
          value={formatBytes(stats?.total_size_bytes ?? 0)}
          sub={`เฉลี่ย ${formatDuration(stats?.avg_duration_seconds ?? null)} / ครั้ง`}
          color="#7C3AED"
        />
        <StatCard
          icon="fa-times-circle" label="ล้มเหลว"
          value={stats?.failed ?? 0}
          sub="ครั้ง (30 วันล่าสุด)"
          color={stats?.failed ? '#DC2626' : '#6B7280'}
        />
      </div>

      {/* ─── Last Backup Status Card ────────────────────────────────────────── */}
      {stats?.last_success && (
        <div style={{
          background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
          border: '1px solid #6EE7B7', borderRadius: 12, padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: '#059669',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <i className="fas fa-shield-alt" style={{ color: '#fff', fontSize: 20 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#065F46' }}>
              ระบบมีการ Backup ล่าสุดเมื่อ {timeAgo(stats.last_success.backup_started_at)}
            </div>
            <div style={{ fontSize: 12, color: '#047857', marginTop: 2 }}>
              {stats.last_success.file_name} · {formatBytes(stats.last_success.file_size_bytes ?? 0)} · {formatDuration(stats.last_success.duration_seconds)}
            </div>
          </div>
          <button
            onClick={handleManualBackup}
            disabled={isBackingUp}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: '#059669', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: isBackingUp ? 'wait' : 'pointer',
              opacity: isBackingUp ? 0.7 : 1, flexShrink: 0,
            }}
          >
            <i className={`fas ${isBackingUp ? 'fa-spinner fa-spin' : 'fa-database'}`} />
            {isBackingUp ? 'กำลัง Backup...' : 'Backup ทันที'}
          </button>
        </div>
      )}

      {/* ─── No Backup Yet ─────────────────────────────────────────────────── */}
      {!stats?.last_success && (
        <div style={{
          background: '#FFFBEB', border: '1px solid #FCD34D',
          borderRadius: 12, padding: '20px 24px',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <i className="fas fa-exclamation-triangle" style={{ fontSize: 28, color: '#D97706', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#92400E' }}>ยังไม่มีข้อมูล Backup</div>
            <div style={{ fontSize: 12, color: '#B45309', marginTop: 3 }}>
              ทำการ Backup ครั้งแรกเดี๋ยวนี้เพื่อปกป้องข้อมูล
            </div>
          </div>
          <button
            onClick={handleManualBackup}
            disabled={isBackingUp}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: '#D97706', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: isBackingUp ? 'wait' : 'pointer',
              flexShrink: 0,
            }}
          >
            <i className={`fas ${isBackingUp ? 'fa-spinner fa-spin' : 'fa-database'}`} />
            {isBackingUp ? 'กำลัง Backup...' : 'เริ่ม Backup แรก'}
          </button>
        </div>
      )}

      {/* ─── Schedule Config ────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              <i className="fas fa-calendar-alt" style={{ marginRight: 8, color: 'var(--accent)' }} />
              ตั้งค่า Auto Backup
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Vercel Cron Job — รันทุกวัน {scheduleTimeDisplay}
            </div>
          </div>
          {/* Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {scheduleForm.is_enabled ? 'เปิดอยู่' : 'ปิดอยู่'}
            </span>
            <div
              onClick={() => setScheduleForm(f => ({ ...f, is_enabled: !f.is_enabled }))}
              style={{
                width: 40, height: 22, borderRadius: 11,
                background: scheduleForm.is_enabled ? 'var(--accent)' : '#D1D5DB',
                position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
              }}
            >
              <div style={{
                position: 'absolute', top: 2,
                left: scheduleForm.is_enabled ? 20 : 2,
                width: 18, height: 18, borderRadius: '50%',
                background: '#fff', transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </div>
          </label>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
          {/* เวลา */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>เวลา Backup (ชั่วโมง)</label>
            <select
              value={scheduleForm.schedule_hour}
              onChange={e => setScheduleForm(f => ({ ...f, schedule_hour: parseInt(e.target.value) }))}
              style={{
                padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--text-primary)', fontSize: 13,
              }}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}:00 น.</option>
              ))}
            </select>
          </div>

          {/* Retention */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>เก็บ Backup (วัน)</label>
            <select
              value={scheduleForm.retention_days}
              onChange={e => setScheduleForm(f => ({ ...f, retention_days: parseInt(e.target.value) }))}
              style={{
                padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--text-primary)', fontSize: 13,
              }}
            >
              {[7, 14, 30, 60, 90].map(d => (
                <option key={d} value={d}>{d} วัน</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSaveSchedule}
            disabled={savingSchedule}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: savingSchedule ? 'wait' : 'pointer',
              opacity: savingSchedule ? 0.7 : 1,
            }}
          >
            <i className={`fas ${savingSchedule ? 'fa-spinner fa-spin' : 'fa-save'}`} style={{ marginRight: 6 }} />
            บันทึก
          </button>
        </div>
      </div>

      {/* ─── Backup History Table ───────────────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              <i className="fas fa-history" style={{ marginRight: 8, color: 'var(--accent)' }} />
              ประวัติ Backup
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {logs.length} รายการล่าสุด
            </div>
          </div>
          <button
            onClick={loadData}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
            }}
          >
            <i className="fas fa-sync-alt" />
            รีเฟรช
          </button>
        </div>

        {logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fas fa-database" style={{ fontSize: 32, marginBottom: 12, opacity: 0.3, display: 'block' }} />
            <div style={{ fontSize: 13 }}>ยังไม่มีประวัติ Backup</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['สถานะ', 'ชื่อไฟล์', 'เวลาเริ่ม', 'ระยะเวลา', 'ขนาด', 'Triggered By', 'จัดการ'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left',
                      fontWeight: 700, fontSize: 11, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      borderBottom: '1px solid var(--border)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => (
                  <tr
                    key={log.id}
                    style={{
                      background: idx % 2 === 0 ? 'transparent' : 'var(--bg)',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-light)')}
                    onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'var(--bg)')}
                  >
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <StatusBadge status={log.status} />
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.file_name ?? '—'}
                      </div>
                      {log.error_message && (
                        <div style={{ fontSize: 11, color: '#DC2626', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.error_message.slice(0, 60)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      <div>{formatDateTime(log.backup_started_at)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(log.backup_started_at)}</div>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      {formatDuration(log.duration_seconds)}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      {log.file_size_bytes ? formatBytes(log.file_size_bytes) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '2px 8px', borderRadius: 6,
                        background: log.triggered_by === 'auto' ? '#EEF2FF' : '#F0FDF4',
                        color: log.triggered_by === 'auto' ? '#4338CA' : '#166534',
                        fontSize: 11, fontWeight: 700,
                      }}>
                        <i className={`fas ${log.triggered_by === 'auto' ? 'fa-robot' : 'fa-user'}`} style={{ fontSize: 9 }} />
                        {log.triggered_by === 'auto' ? 'อัตโนมัติ' : 'Manual'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {log.status === 'success' && (
                          <button
                            onClick={() => handleDownload(log)}
                            title="Download Backup"
                            style={{
                              width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)',
                              background: 'transparent', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'var(--accent)',
                            }}
                          >
                            <i className="fas fa-download" style={{ fontSize: 11 }} />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteTarget(log)}
                          title="ลบ Backup"
                          style={{
                            width: 30, height: 30, borderRadius: 7, border: '1px solid #FECACA',
                            background: 'transparent', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#DC2626',
                          }}
                        >
                          <i className="fas fa-trash" style={{ fontSize: 11 }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Info Note ─────────────────────────────────────────────────────── */}
      <div style={{
        background: '#EFF6FF', border: '1px solid #BFDBFE',
        borderRadius: 10, padding: '12px 16px',
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <i className="fas fa-info-circle" style={{ color: '#3B82F6', marginTop: 1, flexShrink: 0 }} />
        <div style={{ fontSize: 12, color: '#1E40AF', lineHeight: 1.6 }}>
          <strong>Backup Storage:</strong> ไฟล์ backup ถูกเก็บใน Supabase Storage bucket <code style={{ background: '#DBEAFE', padding: '0 4px', borderRadius: 4 }}>backups</code> ·
          ไฟล์เก่าจะถูกลบอัตโนมัติตาม Retention Policy ({schedule?.retention_days ?? 30} วัน) ·
          Backup รันทุกวันเวลา <strong>{scheduleTimeDisplay}</strong>
        </div>
      </div>

      {/* ─── Delete Confirm Modal ────────────────────────────────────────────── */}
      {deleteTarget && (
        <DeleteConfirmModal
          log={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
