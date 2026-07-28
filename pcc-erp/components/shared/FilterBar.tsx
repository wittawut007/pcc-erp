'use client'

import React from 'react'

export interface DateRange {
  start: string
  end: string
}

export function getLocalDateString(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getTodayRange(): DateRange {
  const t = new Date()
  const d = getLocalDateString(t)
  return { start: d, end: d }
}

export function getThisWeekRange(): DateRange {
  const t = new Date()
  const day = t.getDay()
  const diffToMonday = t.getDate() - day + (day === 0 ? -6 : 1)
  const start = new Date(t)
  start.setDate(diffToMonday)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: getLocalDateString(start), end: getLocalDateString(end) }
}

export function getThisMonthRange(): DateRange {
  const t = new Date()
  const start = new Date(t.getFullYear(), t.getMonth(), 1)
  const end = new Date(t.getFullYear(), t.getMonth() + 1, 0)
  return { start: getLocalDateString(start), end: getLocalDateString(end) }
}

export function isDateInRange(dateStr: string | null | undefined, dateRange: DateRange): boolean {
  if (!dateRange.start && !dateRange.end) return true
  if (!dateStr) return false
  const d = dateStr.split('T')[0]
  if (dateRange.start && d < dateRange.start) return false
  if (dateRange.end && d > dateRange.end) return false
  return true
}

interface FilterBarProps {
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  countLabel?: React.ReactNode
  dateLabel?: string
  dateRange: DateRange
  onDateRangeChange: (range: DateRange) => void
  extraFilters?: React.ReactNode
  actionButton?: React.ReactNode
  style?: React.CSSProperties
}

export default function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'ค้นหาสินค้า, รหัส, โรงผลิต, เลขที่ PO...',
  countLabel,
  dateLabel = 'วันที่แผน:',
  dateRange,
  onDateRangeChange,
  extraFilters,
  actionButton,
  style,
}: FilterBarProps) {
  const hasDateFilter = Boolean(dateRange.start || dateRange.end)

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', width: '100%', ...style }}>
      {/* Search Card */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 300 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#9CA3AF' }} />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            style={{ paddingLeft: 32, paddingRight: 12, height: 36, width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12, outline: 'none', color: '#374151', background: '#F9FAFB', boxSizing: 'border-box' }}
          />
        </div>
        {countLabel && (
          <span style={{ fontSize: 12, color: '#9CA3AF', whiteSpace: 'nowrap' }}>
            {countLabel}
          </span>
        )}
        {extraFilters}
      </div>

      {/* Date Filter Card */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fas fa-calendar-alt" style={{ color: '#9CA3AF', fontSize: 14 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{dateLabel}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '4px 8px' }}>
          <input
            type="date"
            value={dateRange.start}
            onChange={e => onDateRangeChange({ ...dateRange, start: e.target.value })}
            style={{ border: 'none', background: 'transparent', fontSize: 12, outline: 'none', color: '#374151', cursor: 'pointer' }}
          />
          <span style={{ color: '#9CA3AF', fontSize: 12 }}>-</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={e => onDateRangeChange({ ...dateRange, end: e.target.value })}
            style={{ border: 'none', background: 'transparent', fontSize: 12, outline: 'none', color: '#374151', cursor: 'pointer' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => onDateRangeChange(getTodayRange())}
            style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer', transition: 'all 0.15s' }}
          >วันนี้</button>
          <button
            type="button"
            onClick={() => onDateRangeChange(getThisWeekRange())}
            style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer', transition: 'all 0.15s' }}
          >สัปดาห์นี้</button>
          <button
            type="button"
            onClick={() => onDateRangeChange(getThisMonthRange())}
            style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer', transition: 'all 0.15s' }}
          >เดือนนี้</button>
          {hasDateFilter && (
            <button
              type="button"
              onClick={() => onDateRangeChange({ start: '', end: '' })}
              style={{ padding: '6px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', marginLeft: 4 }}
              title="ล้างตัวกรอง"
            >
              <i className="fas fa-times" />
            </button>
          )}
        </div>
      </div>

      {actionButton}
    </div>
  )
}
