interface StatCardProps {
  icon: string
  label: string
  value: string | number
  subLabel?: string
  color?: string
  bgColor?: string
  size?: 'sm' | 'md'
}

export default function StatCard({
  icon,
  label,
  value,
  subLabel,
  color = 'var(--accent)',
  bgColor = 'var(--accent-light)',
  size = 'md',
}: StatCardProps) {
  const isSmall = size === 'sm'

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: isSmall ? '12px 14px' : '16px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{
        width: isSmall ? 36 : 44,
        height: isSmall ? 36 : 44,
        borderRadius: 10,
        background: bgColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <i className={`fas ${icon}`} style={{ fontSize: isSmall ? 15 : 18, color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: isSmall ? 20 : 26,
          fontWeight: 700,
          color,
          lineHeight: 1.1,
        }}>
          {value}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
        {subLabel && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, opacity: 0.7 }}>{subLabel}</div>
        )}
      </div>
    </div>
  )
}
