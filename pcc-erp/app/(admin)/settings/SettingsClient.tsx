'use client'

import { useState } from 'react'
import type { SystemStats } from '@/app/actions/settings'
import GeneralTab from './tabs/GeneralTab'
import UserManagementTab from './tabs/UserManagementTab'
import MasterDataTab from './tabs/MasterDataTab'
import DataManagementTab from './tabs/DataManagementTab'
import MonitoringTab from './tabs/MonitoringTab'
import SupabaseTab from './tabs/SupabaseTab'

interface Tab {
  id: string
  label: string
  icon: string
  badge?: string
  badgeColor?: string
}

const tabs: Tab[] = [
  { id: 'general', label: 'ทั่วไป', icon: 'fa-cog' },
  { id: 'users', label: 'จัดการผู้ใช้', icon: 'fa-users-cog' },
  { id: 'master', label: 'ข้อมูลหลัก', icon: 'fa-database' },
  { id: 'supabase', label: 'Supabase', icon: 'fa-bolt' },
  { id: 'data', label: 'ข้อมูล & รีเซ็ต', icon: 'fa-redo-alt', badge: '⚠️', badgeColor: '#DC2626' },
  { id: 'monitoring', label: 'Monitoring', icon: 'fa-chart-bar' },
]

interface SettingsClientProps {
  stats: SystemStats | null
  statsError?: string
}

export default function SettingsClient({ stats, statsError }: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState('general')

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      overflow: 'hidden',
      background: 'var(--bg)',
    }}>
      {/* Sidebar Nav */}
      <div style={{
        width: 200,
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}>
        <div style={{
          padding: '16px 14px 8px',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          การตั้งค่า
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px 12px' }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: isActive ? 'var(--accent-light)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'background 0.12s',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                }}
              >
                <i
                  className={`fas ${tab.icon}`}
                  style={{
                    fontSize: 13,
                    width: 16,
                    textAlign: 'center',
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, flex: 1 }}>
                  {tab.label}
                </span>
                {tab.badge && (
                  <span style={{ fontSize: 12 }}>{tab.badge}</span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Bottom Info */}
        <div style={{
          marginTop: 'auto',
          padding: '12px 14px',
          borderTop: '1px solid var(--border)',
          fontSize: 10,
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Admin Only</div>
          <div>การตั้งค่าทั้งหมดในนี้สงวนสำหรับ Admin เท่านั้น</div>
        </div>
      </div>

      {/* Content Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px',
      }}>
        {/* Tab Header */}
        <div style={{ marginBottom: 20 }}>
          {tabs.filter(t => t.id === activeTab).map(tab => (
            <div key={tab.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: tab.id === 'data' ? '#FEF2F2' : 'var(--accent-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <i className={`fas ${tab.icon}`} style={{
                  fontSize: 15,
                  color: tab.id === 'data' ? '#DC2626' : 'var(--accent)',
                }} />
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  {tab.label}
                </h2>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {tab.id === 'general' && 'ข้อมูลทั่วไปและสถานะระบบ'}
                  {tab.id === 'users' && 'จัดการบัญชีผู้ใช้และสิทธิ์การเข้าถึง'}
                  {tab.id === 'master' && 'จัดการข้อมูลหลัก: สินค้า, วัตถุดิบ, BOM'}
                  {tab.id === 'supabase' && 'รายละเอียดการใช้งานทรัพยากร Supabase'}
                  {tab.id === 'data' && '⚠️ ระวัง — การกระทำต่อไปนี้ไม่สามารถกู้คืนได้'}
                  {tab.id === 'monitoring' && 'ตรวจสอบสถานะระบบและสถิติข้อมูล'}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border)', marginBottom: 20 }} />

        {/* Tab Content */}
        {activeTab === 'general' && <GeneralTab stats={stats} />}
        {activeTab === 'users' && <UserManagementTab stats={stats} />}
        {activeTab === 'master' && <MasterDataTab stats={stats} />}
        {activeTab === 'supabase' && <SupabaseTab />}
        {activeTab === 'data' && <DataManagementTab />}
        {activeTab === 'monitoring' && <MonitoringTab stats={stats} statsError={statsError} />}
      </div>
    </div>
  )
}
