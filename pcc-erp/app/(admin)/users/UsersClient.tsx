'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { createUserAction, updateUserAction } from './actions'
import { useRouter } from 'next/navigation'

export default function UsersClient({ initialUsers }: { initialUsers: any[] }) {
  const router = useRouter()
  const [users, setUsers] = useState(initialUsers)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('all')

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'worker',
    employeeCode: '',
    isActive: true
  })

  const filtered = users.filter(u => {
    const mRole = filterRole === 'all' || u.role === filterRole
    const mSearch = !search || 
      (u.full_name?.toLowerCase().includes(search.toLowerCase())) ||
      (u.email?.toLowerCase().includes(search.toLowerCase())) ||
      (u.employee_code?.toLowerCase().includes(search.toLowerCase()))
    return mRole && mSearch
  })

  const openNew = () => {
    setEditingId(null)
    setForm({ email: '', password: '', fullName: '', role: 'worker', employeeCode: '', isActive: true })
    setIsModalOpen(true)
  }

  const openEdit = (u: any) => {
    setEditingId(u.id)
    setForm({ email: u.email || '', password: '', fullName: u.full_name || '', role: u.role || 'worker', employeeCode: u.employee_code || '', isActive: u.is_active })
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
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
        toast.success('แก้ไขข้อมูลผู้ใช้สำเร็จ')
      } else {
        if (!form.email || !form.password) throw new Error('กรุณากรอกอีเมลและรหัสผ่าน')
        fd.append('email', form.email)
        const res = await createUserAction(fd)
        if (!res.success) throw new Error(res.error)
        toast.success('สร้างผู้ใช้งานใหม่สำเร็จ')
      }
      setIsModalOpen(false)
      router.refresh() // Reload server data
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px 0' }}>จัดการผู้ใช้งาน (Users)</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>เพิ่ม แก้ไขบทบาท หรือระงับการใช้งานบัญชีระบบ</p>
        </div>
        <button onClick={openNew} style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '10px 16px', borderRadius: 'var(--radius)', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fas fa-user-plus"></i> เพิ่มผู้ใช้งาน
        </button>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
            <input type="text" placeholder="ค้นหาชื่อ, รหัสพนักงาน, อีเมล..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', outline: 'none', fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{v: 'all', l: 'ทั้งหมด'}, {v: 'admin', l: 'Admin'}, {v: 'planner', l: 'Planner'}, {v: 'worker', l: 'Worker'}, {v: 'qc', l: 'QC'}].map(r => (
              <button key={r.v} onClick={() => setFilterRole(r.v)}
                style={{ padding: '6px 12px', borderRadius: 20, border: filterRole === r.v ? 'none' : '1px solid var(--border)', background: filterRole === r.v ? 'var(--accent)' : 'var(--bg)', color: filterRole === r.v ? 'white' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {r.l}
              </button>
            ))}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['ผู้ใช้งาน', 'รหัสพนักงาน', 'บทบาท (Role)', 'สถานะ', 'จัดการ'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id} className="hover:bg-[var(--bg)] transition-colors">
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                      {u.full_name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{u.full_name || 'ไม่มีชื่อ'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                   {u.employee_code || '-'}
                </td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', 
                    background: u.role === 'admin' ? 'var(--accent-light)' : u.role === 'planner' ? 'var(--amber-light)' : 'var(--green-light)',
                    color: u.role === 'admin' ? 'var(--accent)' : u.role === 'planner' ? '#D97706' : 'var(--green)' }}>
                    {u.role}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: u.is_active ? 'var(--green)' : 'var(--red)', fontSize: 12, fontWeight: 600 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: u.is_active ? 'var(--green)' : 'var(--red)' }}></div>
                    {u.is_active ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <button onClick={() => openEdit(u)} style={{ background: 'white', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <i className="fas fa-edit" style={{ marginRight: 4 }}></i> แก้ไข
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  ไม่มีข้อมูลผู้ใช้งาน
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', width: 440, borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{editingId ? 'แก้ไขข้อมูลผู้ใช้งาน' : 'เพิ่มผู้ใช้งานใหม่'}</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: 16, color: 'var(--text-muted)', cursor: 'pointer' }}><i className="fas fa-times"></i></button>
            </div>
            
            <form onSubmit={handleSave} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!editingId && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Email / Username <span style={{ color: 'red' }}>*</span></label>
                  <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required={!editingId}
                    style={{ width: '100%', padding: 10, border: '1px solid var(--border)', borderRadius: 6, outline: 'none' }} placeholder="user@pcc-erp.com" />
                </div>
              )}
              
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{editingId ? 'เปลี่ยนรหัสผ่าน (เว้นว่างหากไม่เปลี่ยน)' : 'Password'} <span style={{ color: 'red' }}>{!editingId && '*'}</span></label>
                <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required={!editingId}
                  style={{ width: '100%', padding: 10, border: '1px solid var(--border)', borderRadius: 6, outline: 'none' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>ชื่อ-นามสกุล <span style={{ color: 'red' }}>*</span></label>
                <input type="text" value={form.fullName} onChange={e => setForm({...form, fullName: e.target.value})} required
                  style={{ width: '100%', padding: 10, border: '1px solid var(--border)', borderRadius: 6, outline: 'none' }} />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>รหัสพนักงาน</label>
                  <input type="text" value={form.employeeCode} onChange={e => setForm({...form, employeeCode: e.target.value})}
                    style={{ width: '100%', padding: 10, border: '1px solid var(--border)', borderRadius: 6, outline: 'none' }} placeholder="EMP-001" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>บทบาท (Role) <span style={{ color: 'red' }}>*</span></label>
                  <select value={form.role} onChange={e => setForm({...form, role: e.target.value})} required
                    style={{ width: '100%', padding: 10, border: '1px solid var(--border)', borderRadius: 6, outline: 'none', background: 'white' }}>
                    <option value="worker">Worker (พนักงานหน้างาน)</option>
                    <option value="qc">QC (พนักงานตรวจคุณภาพ)</option>
                    <option value="planner">Planner (วางแผนผลิต)</option>
                    <option value="admin">Admin (ผู้ดูและระบบ)</option>
                  </select>
                </div>
              </div>

              {editingId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: 'var(--bg)', borderRadius: 6, marginTop: 4 }}>
                  <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm({...form, isActive: e.target.checked})} style={{ width: 16, height: 16 }} />
                  <label htmlFor="isActive" style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', color: form.isActive ? 'var(--text-primary)' : 'var(--red)' }}>
                    ให้สิทธิ์เข้าสู่ระบบ (Active Account)
                  </label>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '10px 16px', background: 'white', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>ยกเลิก</button>
                <button type="submit" disabled={saving} style={{ padding: '10px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, width: 120 }}>
                  {saving ? <i className="fas fa-spinner fa-spin"></i> : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
