import Header from '@/components/layout/Header'

export default function SettingsPage() {
  return (
    <>
      <Header title="Settings" subtitle="ตั้งค่าระบบ" />
      <div style={{ padding: '24px' }}>
        <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>ตั้งค่า (กำลังพัฒนา)</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>หน้านี้อยู่ในระหว่างการพัฒนา</p>
        </div>
      </div>
    </>
  )
}
