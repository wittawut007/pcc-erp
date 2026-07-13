'use client'

import { useState } from 'react'
import LogsClient from './LogsClient'
import ErrorLogViewer from './ErrorLogViewer'
import type { ErrorLog } from './ErrorLogViewer'

interface ActivityLog {
  id: string
  user_id: string | null
  action_type: string
  entity_type: string
  entity_id: string | null
  detail: string | null
  created_at: string
  profile: { full_name: string; role: string; employee_code: string | null } | null
}

interface LogsTabsProps {
  activityLogs: ActivityLog[]
  errorLogs: ErrorLog[]
  errorCount: number
}

export default function LogsTabs({ activityLogs, errorLogs, errorCount }: LogsTabsProps) {
  const [activeTab, setActiveTab] = useState<'activity' | 'errors'>('activity')

  const tabs = [
    { id: 'activity' as const, label: 'ประวัติกิจกรรม', icon: 'fa-history', count: activityLogs.length },
    { id: 'errors' as const, label: 'Error Logs', icon: 'fa-triangle-exclamation', count: errorCount, isAlert: errorCount > 0 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* Tab Bar */}
      <div style={{ padding: '0 36px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 0 }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '14px 20px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: isActive ? '2.5px solid var(--accent)' : '2.5px solid transparent',
                marginBottom: -1,
                transition: 'all 0.18s',
                position: 'relative',
              }}
            >
              <i
                className={`fas ${tab.icon}`}
                style={{
                  fontSize: 12,
                  color: tab.isAlert && !isActive ? '#DC2626' : isActive ? 'var(--accent)' : 'var(--text-muted)',
                }}
              />
              <span style={{ color: tab.isAlert && !isActive ? '#DC2626' : undefined }}>
                {tab.label}
              </span>

              {/* Badge */}
              {tab.count > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px',
                  fontSize: 10, fontWeight: 700,
                  background: tab.isAlert
                    ? (isActive ? '#DC2626' : '#FEE2E2')
                    : (isActive ? 'var(--accent)' : 'var(--border)'),
                  color: tab.isAlert
                    ? (isActive ? 'white' : '#DC2626')
                    : (isActive ? 'white' : 'var(--text-muted)'),
                }}>
                  {tab.count > 99 ? '99+' : tab.count}
                </span>
              )}

              {/* Pulsing dot for errors */}
              {tab.isAlert && !isActive && (
                <span style={{
                  position: 'absolute', top: 10, right: 10,
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#DC2626',
                  animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                }} />
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'activity' ? (
          <LogsClient logs={activityLogs} />
        ) : (
          <ErrorLogViewer logs={errorLogs} />
        )}
      </div>
    </div>
  )
}
