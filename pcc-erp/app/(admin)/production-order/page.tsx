export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 48, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>กำลังพัฒนา...</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>หน้านี้อยู่ระหว่างการพัฒนา กำลังเชื่อมต่อกับฐานข้อมูล Supabase</p>
      </div>
    </div>
  )
}
