'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { UserRole, AuthUpdatePayload, ProfileUpdatePayload } from '@/lib/types'

/**
 * Helper: ตรวจสอบ Session การเข้าสู่ระบบและสิทธิ์การใช้งานระดับ Admin / Super Admin
 */
async function assertAdminUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('ไม่ได้เข้าสู่ระบบ (Unauthorized)')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.is_active || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
    throw new Error('ไม่มีสิทธิ์ใช้งานการดำเนินการนี้ (Forbidden: Admin or Super Admin role required)')
  }

  return { user, profile }
}

export async function createUserAction(formData: FormData) {
  const email = ((formData.get('email') as string) || '').trim()
  const password = formData.get('password') as string
  const fullName = ((formData.get('fullName') as string) || '').trim()
  const role = formData.get('role') as string
  const rawEmployeeCode = ((formData.get('employeeCode') as string) || '').trim()
  const employeeCode = rawEmployeeCode !== '' ? rawEmployeeCode : null
  const avatarUrl = formData.get('avatarUrl') as string | null

  try {
    await assertAdminUser()

    if (role === 'super_admin') {
      throw new Error('ไม่สามารถสร้างผู้ใช้งานระดับ Super Admin ผ่าน UI ได้ (ต้องดำเนินการผ่านฐานข้อมูลเท่านั้น)')
    }

    const supabaseAdmin = createAdminClient()

    // Pre-validation 1: ตรวจสอบว่ามีอีเมลนี้ในระบบแล้วหรือยัง
    const { data: existingEmail } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .ilike('email', email)
      .maybeSingle()

    if (existingEmail) {
      throw new Error(`อีเมล "${email}" มีในระบบอยู่แล้ว (ใช้งานโดย ${existingEmail.full_name})`)
    }

    // Pre-validation 2: ตรวจสอบว่ารหัสพนักงานซ้ำกับผู้ใช้อื่นหรือไม่
    if (employeeCode) {
      const { data: existingEmp } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, employee_code')
        .ilike('employee_code', employeeCode)
        .maybeSingle()

      if (existingEmp) {
        throw new Error(`รหัสพนักงาน "${employeeCode}" ถูกใช้งานแล้วในระบบ (โดย ${existingEmp.full_name})`)
      }
    }

    // 1. Create User in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role, employee_code: employeeCode },
    })

    if (authError) throw authError

    if (authData.user) {
      // 2. upsert profile
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: authData.user.id,
          email: email,
          full_name: fullName,
          role: role as UserRole,
          employee_code: employeeCode,
          avatar_url: avatarUrl || null,
          is_active: true,
        }, {
          onConflict: 'id',
        })

      if (profileError) {
        // Rollback auth user creation if profile upsert fails
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
        await supabaseAdmin.from('profiles').delete().eq('id', authData.user.id)
        
        if (profileError.code === '23505' || profileError.message.includes('profiles_employee_code_key')) {
          throw new Error(`รหัสพนักงาน "${employeeCode}" ถูกใช้งานแล้วในระบบ`)
        }
        throw new Error(`สร้าง profile ไม่สำเร็จ: ${profileError.message}`)
      }
    }

    return { success: true, user: authData.user }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
    return { success: false, error: message }
  }
}

export async function updateUserAction(formData: FormData) {
  const userId = formData.get('userId') as string
  const fullName = ((formData.get('fullName') as string) || '').trim()
  const role = formData.get('role') as string
  const rawEmployeeCode = ((formData.get('employeeCode') as string) || '').trim()
  const employeeCode = rawEmployeeCode !== '' ? rawEmployeeCode : null
  const password = formData.get('password') as string
  const isActive = formData.get('isActive') === 'true'
  const avatarUrl = formData.get('avatarUrl') as string | null

  try {
    const { profile: callerProfile } = await assertAdminUser()
    const supabaseAdmin = createAdminClient()

    // Check if target user is Super Admin
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, email, full_name')
      .eq('id', userId)
      .single()

    // Admin ปกติไม่สามารถแก้ไขข้อมูล Super Admin ได้
    if (targetProfile?.role === 'super_admin' && callerProfile.role !== 'super_admin') {
      throw new Error('Admin ปกติไม่มีสิทธิ์แก้ไขข้อมูลของผู้ใช้งานระดับ Super Admin')
    }

    // ห้ามระงับสิทธิ์ Super Admin
    if (targetProfile?.role === 'super_admin' && !isActive) {
      throw new Error('ไม่สามารถระงับการใช้งานสิทธิ์ Super Admin ได้ (Protected User)')
    }

    // ห้ามปรับสิทธิ์ user ปกติให้เป็น super_admin ผ่าน UI
    if (role === 'super_admin' && targetProfile?.role !== 'super_admin') {
      throw new Error('ไม่สามารถกำหนดสิทธิ์เป็น Super Admin ผ่าน UI ได้ (ต้องดำเนินการผ่านฐานข้อมูลเท่านั้น)')
    }

    // Pre-validation: ตรวจสอบว่ารหัสพนักงานซ้ำกับผู้ใช้อื่นหรือไม่
    if (employeeCode) {
      const { data: existingEmp } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, employee_code')
        .ilike('employee_code', employeeCode)
        .neq('id', userId)
        .maybeSingle()

      if (existingEmp) {
        throw new Error(`รหัสพนักงาน "${employeeCode}" ถูกใช้งานแล้วในระบบ (โดย ${existingEmp.full_name})`)
      }
    }

    const finalRole = targetProfile?.role === 'super_admin' ? 'super_admin' : role

    // Update Auth Data (Email / Password / Ban state)
    const updatePayload: AuthUpdatePayload = {
      user_metadata: { full_name: fullName, role: finalRole as UserRole, employee_code: employeeCode },
      ban_duration: isActive ? 'none' : '876000h', // Ban for 100 years if inactive
    }
    if (password) (updatePayload as AuthUpdatePayload & { password?: string }).password = password

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, updatePayload)
    if (authError) throw authError

    // Update Profile
    const profileData: ProfileUpdatePayload = {
      full_name: fullName,
      role: finalRole as UserRole,
      employee_code: employeeCode,
      is_active: isActive,
    }
    if (avatarUrl !== null) profileData.avatar_url = avatarUrl

    const { error: profileError } = await supabaseAdmin.from('profiles').update(profileData).eq('id', userId)

    if (profileError) {
      if (profileError.code === '23505' || profileError.message.includes('profiles_employee_code_key')) {
        throw new Error(`รหัสพนักงาน "${employeeCode}" ถูกใช้งานแล้วในระบบ`)
      }
      throw profileError
    }

    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
    return { success: false, error: message }
  }
}

export async function generateWorkerTokenAction(formData: FormData) {
  const userId = formData.get('userId') as string

  try {
    await assertAdminUser()
    const supabaseAdmin = createAdminClient()

    // สร้าง UUID ใหม่สำหรับ worker_token
    const { data: tokenData } = await supabaseAdmin.rpc('gen_random_uuid')
    const newToken = tokenData ?? crypto.randomUUID()

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ worker_token: newToken })
      .eq('id', userId)

    if (error) throw error

    return { success: true, token: newToken }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
    return { success: false, error: message }
  }
}

export async function deleteUserAction(userId: string) {
  try {
    await assertAdminUser()
    const supabaseAdmin = createAdminClient()

    // Protected Check: Disallow deleting super_admin or wittawut.abm@gmail.com
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, email, full_name')
      .eq('id', userId)
      .single()

    if (
      targetProfile?.role === 'super_admin' ||
      targetProfile?.email === 'wittawut.abm@gmail.com' ||
      targetProfile?.email?.includes('wittawut.abm')
    ) {
      throw new Error('ไม่อนุญาตให้ลบผู้ใช้งานระดับ Super Admin ออกจากระบบ (Protected Super Admin User)')
    }

    // เคลียร์ความสัมพันธ์ในตารางต่างๆ ป้องกันปัญหา Foreign Key
    await Promise.allSettled([
      supabaseAdmin.from('activity_logs').update({ user_id: null }).eq('user_id', userId),
      supabaseAdmin.from('production_plans').update({ created_by: null }).eq('created_by', userId),
      supabaseAdmin.from('production_orders').update({ confirmed_by: null }).eq('confirmed_by', userId),
      supabaseAdmin.from('job_orders').update({ worker_id: null }).eq('worker_id', userId),
      supabaseAdmin.from('demolding_records').update({ worker_id: null }).eq('worker_id', userId),
      supabaseAdmin.from('fg_inventory').update({ last_updated_by: null }).eq('last_updated_by', userId),
      supabaseAdmin.from('plan_materials').update({ dispensed_by: null }).eq('dispensed_by', userId),
      supabaseAdmin.from('concrete_orders').update({ requested_by: null }).eq('requested_by', userId),
      supabaseAdmin.from('concrete_orders').update({ supplied_by: null }).eq('supplied_by', userId),
      supabaseAdmin.from('qc_inspections').update({ qc_id: null }).eq('qc_id', userId),
      supabaseAdmin.from('fg_receipts').update({ warehouse_id: null }).eq('warehouse_id', userId),
    ])

    // ลบข้อมูลจาก public.profiles ก่อน
    await supabaseAdmin.from('profiles').delete().eq('id', userId)

    // ลบข้อมูลจาก Supabase Auth
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (authError) throw authError
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
    return { success: false, error: message }
  }
}
