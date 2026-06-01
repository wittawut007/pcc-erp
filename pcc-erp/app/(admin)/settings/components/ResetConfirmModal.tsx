'use client'

import { useState } from 'react'

export interface ResetConfig {
  id: string
  title: string
  description: string
  confirmText: string   // text user must type to confirm
  danger: 'medium' | 'high' | 'critical'
  tables: string[]
  onConfirm: () => Promise<{ success: boolean; error?: string; summary?: Record<string, string | number> }>
}

interface ResetConfirmModalProps {
  config: ResetConfig
  onClose: () => void
  onSuccess: (summary: Record<string, string | number>) => void
}

const dangerConfig = {
  medium: {
    color: '#F59E0B',
    bg: '#FFFBEB',
    border: '#FDE68A',
    label: 'ความเสี่ยงปานกลาง',
    icon: 'fa-exclamation-triangle',
  },
  high: {
    color: '#EF4444',
    bg: '#FEF2F2',
    border: '#FECACA',
    label: 'ความเสี่ยงสูง',
    icon: 'fa-shield-alt',
  },
  critical: {
    color: '#DC2626',
    bg: '#FFF1F2',
    border: '#FECDD3',
    label: '⚠️ อันตรายสูงสุด',
    icon: 'fa-radiation',
  },
}

export default function ResetConfirmModal({ config, onClose, onSuccess }: ResetConfirmModalProps) {
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const danger = dangerConfig[config.danger]
  const isConfirmed = typed === config.confirmText

  const handleReset = async () => {
    if (!isConfirmed) return
    setLoading(true)
    setError(null)
    try {
      const result = await config.onConfirm()
      if (result.success) {
        onSuccess(result.summary ?? {})
      } else {
        setError(result.error ?? 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(2px)',
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'white',
        borderRadius: 16,
        padding: 28,
        width: 520,
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
        animation: 'fadeIn 0.2s ease-out',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: danger.bg,
            border: `1px solid ${danger.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <i className={`fas ${danger.icon}`} style={{ fontSize: 20, color: danger.color }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {config.title}
            </h2>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 4,
              background: danger.bg,
              color: danger.color,
              border: `1px solid ${danger.border}`,
            }}>
              {danger.label}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
          >✕</button>
        </div>

        {/* Description */}
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
          {config.description}
        </p>

        {/* Tables affected */}
        <div style={{
          background: 'var(--bg)',
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 20,
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            ตารางที่จะถูกลบ/รีเซ็ต
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {config.tables.map((t) => (
              <span key={t} style={{
                padding: '3px 10px',
                background: danger.bg,
                color: danger.color,
                border: `1px solid ${danger.border}`,
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'monospace',
              }}>
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Confirmation Input */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            พิมพ์ <code style={{
              background: danger.bg,
              color: danger.color,
              padding: '2px 8px',
              borderRadius: 4,
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: '0.05em',
            }}>{config.confirmText}</code> เพื่อยืนยัน
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`พิมพ์ "${config.confirmText}" ที่นี่...`}
            autoComplete="off"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: `2px solid ${isConfirmed ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 8,
              fontSize: 13,
              outline: 'none',
              fontWeight: 600,
              transition: 'border-color 0.2s',
              boxSizing: 'border-box',
              background: isConfirmed ? '#FEF2F2' : 'white',
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 14px',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 8,
            fontSize: 12,
            color: '#DC2626',
            marginBottom: 16,
          }}>
            <i className="fas fa-times-circle" style={{ marginRight: 6 }} />
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1,
              padding: '11px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'white',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              color: 'var(--text-primary)',
            }}
          >
            ยกเลิก
          </button>
          <button
            onClick={handleReset}
            disabled={!isConfirmed || loading}
            style={{
              flex: 2,
              padding: '11px',
              border: 'none',
              borderRadius: 8,
              background: isConfirmed ? '#DC2626' : '#F3F4F6',
              color: isConfirmed ? 'white' : 'var(--text-muted)',
              fontSize: 13,
              fontWeight: 700,
              cursor: isConfirmed && !loading ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
            }}
          >
            {loading ? (
              <><i className="fas fa-spinner fa-spin" />กำลังดำเนินการ...</>
            ) : (
              <><i className="fas fa-trash-alt" />ยืนยันการรีเซ็ต</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
