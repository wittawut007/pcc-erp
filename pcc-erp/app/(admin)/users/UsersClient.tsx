'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { createUserAction, updateUserAction, generateWorkerTokenAction } from './actions'
import { useRouter } from 'next/navigation'

function QRImage({ value, size = 180 }: { value: string; size?: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&margin=10`
  return <img src={url} alt="QR Code" width={size} height={size} style={{ borderRadius: 6, display: 'block', margin: '0 auto' }} />
}

export default function UsersClient({ initialUsers }: { initialUsers: any[] }) {
  const router = useRouter()
  const [users, setUsers] = useState(initialUsers)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('ทั้งหมด')
  
  useEffect(() => {
    setUsers(initialUsers)
  }, [initialUsers])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [qrModal, setQrModal] = useState<{ open: boolean; user: any | null; token: string | null }>({
    open: false, user: null, token: null,
  })
  const [generatingQr, setGeneratingQr] = useState(false)

  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'worker',
    employeeCode: '',
    isActive: true
  })

  const rolesList = ['ทั้งหมด', 'Admin', 'Planner', 'Warehouse', 'QC', 'Worker']

  const filtered = users.filter(u => {
    const roleMap: Record<string, string> = {
      'admin': 'Admin',
      'planner': 'Planner',
      'warehouse': 'Warehouse',
      'qc': 'QC',
      'worker': 'Worker',
    }
    const matchRole = filterRole === 'ทั้งหมด' || roleMap[u.role] === filterRole
    const matchSearch = !search ||
      (u.full_name?.toLowerCase().includes(search.toLowerCase())) ||
      (u.email?.toLowerCase().includes(search.toLowerCase())) ||
      (u.employee_code?.toLowerCase().includes(search.toLowerCase()))
    return matchRole && matchSearch
  })

  const openAdd = () => {
    setEditingId(null)
    setForm({ email: '', password: '', fullName: '', role: 'worker', employeeCode: '', isActive: true })
    setIsModalOpen(true)
  }

  const openEdit = (u: any) => {
    setEditingId(u.id)
    setForm({ email: u.email || '', password: '', fullName: u.full_name || '', role: u.role || 'worker', employeeCode: u.employee_code || '', isActive: u.is_active })
    setIsModalOpen(true)
  }

  const openQrModal = async (u: any) => {
    setQrModal({ open: true, user: u, token: u.worker_token ?? null })
  }

  const handleGenerateQr = async () => {
    if (!qrModal.user) return
    setGeneratingQr(true)
    const fd = new FormData()
    fd.append('userId', qrModal.user.id)
    const res = await generateWorkerTokenAction(fd)
    if (res.success && res.token) {
      setQrModal(prev => ({ ...prev, token: res.token! }))
      setUsers(prev => prev.map(u => u.id === qrModal.user.id ? { ...u, worker_token: res.token } : u))
      toast.success('สร้าง QR Code ใหม่สำเร็จ!')
    } else {
      toast.error(res.error || 'เกิดข้อผิดพลาดในการสร้าง QR')
    }
    setGeneratingQr(false)
  }

  const handleToggleStatus = async (u: any) => {
    const fd = new FormData()
    fd.append('userId', u.id)
    fd.append('fullName', u.full_name)
    fd.append('role', u.role)
    fd.append('employeeCode', u.employee_code || '')
    fd.append('isActive', (!u.is_active).toString())

    toast.promise(
      updateUserAction(fd).then(res => {
        if (!res.success) throw new Error(res.error)
        router.refresh()
      }),
      {
        loading: 'กำลังอัพเดทสถานะ...',
        success: 'อัพเดทสถานะสำเร็จ!',
        error: 'เกิดข้อผิดพลาด'
      }
    )
  }

  const handleSave = async () => {
    if (!form.fullName) {
      toast.error('กรุณากรอกชื่อ-นามสกุล')
      return
    }
    
    setSaving(true)
    const fd = new FormData()
    fd.append('fullName', form.fullName)
    fd.append('role', form.role)
    fd.append('employeeCode', form.employeeCode)
    if (form.password) fd.append('password', form.password)

    try {
      if (editingId) {
        fd.append('userId', editingId)
        fd.append('isActive', form.isActive.toString())
        const res = await updateUserAction(fd)
        if (!res.success) throw new Error(res.error)
        toast.success('แก้ไขข้อมูลผู้ใช้สำเร็จ!')
      } else {
        if (!form.email || !form.password) throw new Error('กรุณากรอกอีเมลและรหัสผ่าน')
        fd.append('email', form.email)
        const res = await createUserAction(fd)
        if (!res.success) throw new Error(res.error)
        toast.success('สร้างผู้ใช้งานใหม่สำเร็จ!')
      }
      setIsModalOpen(false)
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  const getQrUrl = (token: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/worker-entry?token=${token}`
  }

  const stats = {
    total: users.length,
    active: users.filter(u => u.is_active).length,
    suspended: users.filter(u => !u.is_active).length,
    admins: users.filter(u => ['admin', 'planner'].includes(u.role)).length,
  }

  const roleStyleMap: Record<string, { bg: string, color: string, label: string }> = {
    admin: { bg: 'var(--accent-light)', color: 'var(--accent)', label: 'Admin' },
    planner: { bg: 'var(--indigo-light)', color: 'var(--indigo)', label: 'Planner' },
    warehouse: { bg: 'var(--amber-light)', color: 'var(--amber)', label: 'Warehouse' },
    qc: { bg: 'var(--green-light)', color: 'var(--green)', label: 'QC' },
    worker: { bg: '#FFF7ED', color: '#EA580C', label: 'Worker' }, // orange mapping
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      
      {/* Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}></i>
          <input
            type="text" placeholder="ค้นหา ชื่อ, Username, แผนก..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', outline: 'none' }}
          />
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          style={{ padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', outline: 'none', color: 'var(--text-primary)' }}>
          {rolesList.map(r => <option key={r} value={r}>{r === 'ทั้งหมด' ? 'สิทธิ์ทั้งหมด (All Roles)' : `สิทธิ์: ${r}`}</option>)}
        </select>
        <button onClick={openAdd}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <i className="fas fa-user-plus"></i>
          เพิ่มผู้ใช้งานใหม่
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'ผู้ใช้งานทั้งหมด', value: stats.total, color: 'var(--accent)', bg: 'var(--accent-light)' },
          { label: 'ผู้ดูแลระบบ (Admin/Exec)', value: stats.admins, color: 'var(--indigo)', bg: 'var(--indigo-light)' },
          { label: 'ใช้งานปกติ (Active)', value: stats.active, color: 'var(--green)', bg: 'var(--green-light)' },
          { label: 'ระงับการใช้งาน (Inactive)', value: stats.suspended, color: 'var(--red)', bg: 'var(--red-light)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['ผู้ใช้งาน (USER)', 'USERNAME', 'สิทธิ์ (ROLE)', 'แผนก/พื้นที่รับผิดชอบ', 'สถานะ (STATUS)', 'จัดการ'].map((th, i) => (
                <th key={th} style={{ padding: '10px 14px', textAlign: i >= 5 ? 'center' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>{th}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const rStyle = roleStyleMap[u.role] ?? { bg: '#F3F4F6', color: '#6B7280', label: u.role }
              const initials = u.full_name ? u.full_name.substring(0,2) : 'U'
              
              return (
                <tr key={u.id} className="hover:bg-[var(--bg)] transition-colors" style={{ opacity: u.is_active ? 1 : 0.6 }}>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: rStyle.bg, color: rStyle.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                        {u.role === 'admin' ? 'AD' : initials}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.full_name || 'ไม่ระบุชื่อ'} {u.role === 'admin' && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>(Admin)</span>}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{u.is_active ? 'เข้าใช้งานล่าสุด: -' : 'ถูกระงับ'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {u.email?.split('@')[0]}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ background: rStyle.bg, color: rStyle.color, padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{rStyle.label}</span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                    {u.employee_code || (u.role === 'admin' ? 'IT Department' : '—')}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: u.is_active ? 'var(--green-light)' : 'var(--red-light)', color: u.is_active ? 'var(--green)' : 'var(--red)' }}>
                      {u.is_active ? 'ใช้งานปกติ' : 'ระงับสิทธิ์'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button onClick={() => openEdit(u)} style={{ padding: '5px 10px', background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600 }} title="แก้ไขข้อมูล">
                        <i className="fas fa-pen"></i>
                      </button>
                      
                      {u.role === 'worker' ? (
                        <button onClick={() => openQrModal(u)} style={{ padding: '5px 10px', background: u.worker_token ? '#FEF3C7' : 'var(--bg)', color: u.worker_token ? '#D97706' : 'var(--text-muted)', border: `1px solid ${u.worker_token ? '#FDE68A' : 'var(--border)'}`, borderRadius: 5, cursor: 'pointer', fontSize: 11 }} title="QR Code เข้างาน">
                          <i className="fas fa-qrcode"></i>
                        </button>
                      ) : (
                        <button disabled style={{ padding: '5px 10px', background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 5, opacity: 0.5, cursor: 'not-allowed', fontSize: 11 }}>
                          <i className="fas fa-key"></i>
                        </button>
                      )}
                      
                      <button onClick={() => handleToggleStatus(u)} style={{ padding: '5px 10px', background: u.is_active ? 'var(--bg)' : 'var(--green-light)', color: u.is_active ? 'var(--text-muted)' : 'var(--green)', border: `1px solid ${u.is_active ? 'var(--border)' : 'var(--green-light)'}`, borderRadius: 5, cursor: 'pointer', fontSize: 11 }} title={u.is_active ? "ระงับสิทธิ์" : "เปิดใช้งาน"}>
                        <i className={`fas ${u.is_active ? 'fa-ban' : 'fa-unlock'}`}></i>
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
            <i className="fas fa-users-slash" style={{ fontSize: 36, marginBottom: 12, display: 'block', opacity: 0.3 }}></i>
            ไม่พบผู้ใช้งาน
          </div>
        )}
      </div>

      {/* QR Modal */}
      {qrModal.open && qrModal.user && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>QR Code เข้างาน</h2>
              <button onClick={() => setQrModal({ open: false, user: null, token: null })} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{qrModal.user.full_name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>รหัส: {qrModal.user.employee_code || '-'}</div>
            </div>

            {qrModal.token ? (
              <div style={{ padding: 16, background: 'var(--bg)', borderRadius: 8, display: 'inline-block', marginBottom: 16 }}>
                <QRImage value={getQrUrl(qrModal.token)} size={180} />
              </div>
            ) : (
             <div style={{ padding: 30, background: 'var(--bg)', borderRadius: 8, marginBottom: 16, color: 'var(--text-muted)', fontSize: 12 }}>
                กดปุ่มด้านล่างเพื่อสร้าง QR Code
             </div>
            )}
            
            <button onClick={handleGenerateQr} disabled={generatingQr}
              style={{ width: '100%', padding: '11px', border: 'none', borderRadius: 8, background: qrModal.token ? 'var(--amber-light)' : 'var(--accent)', color: qrModal.token ? 'var(--amber)' : 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {generatingQr ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>กำลังสร้าง...</> : qrModal.token ? <><i className="fas fa-sync-alt" style={{ marginRight: 6 }}></i>สร้าง QR ใหม่</> : <><i className="fas fa-qrcode" style={{ marginRight: 6 }}></i>สร้าง QR Code</>}
            </button>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{editingId ? 'แก้ไขข้อมูลผู้ใช้งาน' : 'เพิ่มผู้ใช้งานใหม่'}</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>ชื่อ-นามสกุล *</label>
                <input
                  type="text" placeholder="ระบุชื่อจริง นามสกุล"
                  value={form.fullName}
                  onChange={e => setForm(prev => ({ ...prev, fullName: e.target.value }))}
                  style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {!editingId && (
                <div style={{ gridColumn: 'span 2' }}>
                   <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Email / Username *</label>
                   <input
                     type="email" placeholder="user@pcc-erp.com"
                     value={form.email}
                     onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                     style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                   />
                </div>
              )}

              <div style={{ gridColumn: 'span 2' }}>
                 <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>{editingId ? 'เปลี่ยนรหัสผ่านใหม่ (เว้นว่างหากไม่เปลี่ยน)' : 'Password *'}</label>
                 <input
                   type="password" placeholder={editingId ? 'เว้นว่างไว้หากไม่เปลี่ยน' : '••••••••'}
                   value={form.password}
                   onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                   style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                 />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>รหัสพนักงาน (ID)</label>
                <input
                  type="text" placeholder="EMP-001"
                  value={form.employeeCode}
                  onChange={e => setForm(prev => ({ ...prev, employeeCode: e.target.value }))}
                  style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

               <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>สิทธิ์การใช้งาน (Role)</label>
                <select value={form.role} onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
                  style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--accent)', borderRadius: 7, fontSize: 12, outline: 'none', background: 'white', color: 'var(--accent)', fontWeight: 700 }}>
                  <option value="admin">ผู้ดูแลระบบ (Admin)</option>
                  <option value="planner">ส่วนวางแผนผลิต (Planner)</option>
                  <option value="warehouse">คลังสินค้า (Warehouse)</option>
                  <option value="qc">ฝ่าย QC</option>
                  <option value="worker">พนักงานหน้างาน (Worker)</option>
                </select>
              </div>

            </div>

            {form.role === 'worker' && !editingId && (
              <div style={{ padding: '10px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, marginTop: 14, fontSize: 11, color: '#92400E' }}>
                <i className="fas fa-info-circle" style={{ marginRight: 5 }}></i> Worker จะใช้ <b>QR Code</b> ในการเข้าระบบ
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: '11px', border: '1px solid var(--border)', borderRadius: 8, background: 'white', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>ยกเลิก</button>
              <button onClick={handleSave} disabled={saving}
                style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>กำลังบันทึก...</> : <><i className="fas fa-save" style={{ marginRight: 6 }}></i>บันทึกข้อมูล</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
