import Link from 'next/link'
import type { SystemStats } from '@/app/actions/settings'
import StatCard from '../components/StatCard'

interface MasterDataTabProps {
  stats: SystemStats | null
}

export default function MasterDataTab({ stats }: MasterDataTabProps) {
  const beds = ['A', 'B', 'C', 'D', 'E', 'F', '1', '2', '3', '4']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <StatCard
          icon="fa-box-open"
          label="สินค้าทั้งหมด"
          value={stats?.totalProducts ?? '—'}
          subLabel={stats ? `${stats.activeProducts} รายการ Active` : undefined}
          color="var(--accent)"
          bgColor="var(--accent-light)"
        />
        <StatCard
          icon="fa-layer-group"
          label="วัตถุดิบทั้งหมด"
          value={stats?.totalRawMaterials ?? '—'}
          subLabel={stats ? `${stats.lowStockMaterials} รายการ ต่ำกว่าขั้นต่ำ` : undefined}
          color={stats && stats.lowStockMaterials > 0 ? 'var(--amber)' : 'var(--green)'}
          bgColor={stats && stats.lowStockMaterials > 0 ? 'var(--amber-light)' : 'var(--green-light)'}
        />
        <StatCard
          icon="fa-industry"
          label="Beds ทั้งหมด"
          value={beds.length}
          subLabel="A–F + 1–4"
          color="var(--indigo)"
          bgColor="var(--indigo-light)"
        />
      </div>

      {/* Products Section */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>ข้อมูลสินค้าและ BOM</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Products, BOM Code, สูตรคอนกรีต, เหล็กเส้น
            </div>
          </div>
          <Link href="/products" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', background: 'var(--accent)', color: 'white',
            borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none',
          }}>
            <i className="fas fa-external-link-alt" />ไปที่หน้าสินค้า
          </Link>
        </div>

        {[
          { icon: 'fa-box', label: 'ข้อมูลสินค้า (Products)', desc: 'ชื่อ, รหัส, หมวดหมู่, ขนาด, หน่วย', link: '/products', color: 'var(--accent)' },
          { icon: 'fa-sitemap', label: 'Bill of Materials (BOM)', desc: 'สูตรวัตถุดิบ: คอนกรีต, เหล็กเส้น, ตะแกรง, ลวด', link: '/products', color: 'var(--indigo)' },
          { icon: 'fa-tags', label: 'หมวดหมู่สินค้า', desc: 'จัดกลุ่มสินค้าตามประเภทและขนาด', link: '/data-catalog', color: 'var(--amber)' },
        ].map((item) => (
          <Link key={item.label} href={item.link}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px',
              borderBottom: '1px solid var(--border)', textDecoration: 'none',
              transition: 'background 0.12s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
          >
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: 'var(--bg)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <i className={`fas ${item.icon}`} style={{ fontSize: 14, color: item.color }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.desc}</div>
            </div>
            <i className="fas fa-chevron-right" style={{ fontSize: 11, color: 'var(--text-muted)' }} />
          </Link>
        ))}
        <div style={{ height: 1 }} />
      </div>

      {/* Raw Materials */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>วัตถุดิบ (Raw Materials)</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              สต็อกวัตถุดิบ, ระดับขั้นต่ำ, ซัพพลายเออร์
            </div>
          </div>
          {stats && stats.lowStockMaterials > 0 && (
            <span style={{
              padding: '5px 12px',
              background: 'var(--amber-light)',
              color: 'var(--amber)',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              border: '1px solid #FDE68A',
            }}>
              <i className="fas fa-exclamation-triangle" style={{ marginRight: 5 }} />
              {stats.lowStockMaterials} รายการ ต่ำกว่าขั้นต่ำ
            </span>
          )}
        </div>

        {[
          { icon: 'fa-layer-group', label: 'จัดการสต็อกวัตถุดิบ', desc: 'ดู/แก้ไขยอดคงเหลือ, min stock, ราคาต่อหน่วย', link: '/inventory/raw', color: 'var(--accent)' },
          { icon: 'fa-truck', label: 'ข้อมูลซัพพลายเออร์', desc: 'ชื่อ supplier และข้อมูลการจัดซื้อ', link: '/inventory/raw', color: 'var(--green)' },
        ].map((item) => (
          <Link key={item.label} href={item.link}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px',
              borderBottom: '1px solid var(--border)', textDecoration: 'none',
              transition: 'background 0.12s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
          >
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: 'var(--bg)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <i className={`fas ${item.icon}`} style={{ fontSize: 14, color: item.color }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.desc}</div>
            </div>
            <i className="fas fa-chevron-right" style={{ fontSize: 11, color: 'var(--text-muted)' }} />
          </Link>
        ))}
        <div style={{ height: 1 }} />
      </div>

      {/* Bed Configuration */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>การกำหนดค่า Bed</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Bed คือพื้นที่วางแบบหล่อ — ระบบรองรับ {beds.length} Beds
          </div>
        </div>
        <div style={{ padding: '14px 20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {beds.map((bed) => (
              <div key={bed} style={{
                width: 44, height: 44, borderRadius: 10,
                background: 'var(--bg)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 800, color: 'var(--accent)',
              }}>
                {bed}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
            <i className="fas fa-info-circle" style={{ marginRight: 5 }} />
            การเพิ่ม/ลบ Bed ต้องแก้ไข Enum ใน Database โดยตรง (ผ่าน Supabase Dashboard)
          </div>
        </div>
      </div>
    </div>
  )
}
