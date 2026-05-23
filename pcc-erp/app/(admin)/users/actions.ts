'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function createUserAction(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('fullName') as string
  const role = formData.get('role') as string
  const employeeCode = formData.get('employeeCode') as string
  const avatarUrl = formData.get('avatarUrl') as string | null

  try {
    const supabaseAdmin = createAdminClient()

    // 1. Create User in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role, employee_code: employeeCode },
    })

    if (authError) throw authError

    if (authData.user) {
      // 2. upsert แทน update เพื่อรองรับทั้งกรณีที่ trigger สร้าง profile ไว้แล้ว
      //    และกรณีที่ยังไม่มี profile row เลย (ป้องกัน silent fail)
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: authData.user.id,
          email: email,
          full_name: fullName,
          role: role,
          employee_code: employeeCode,
          avatar_url: avatarUrl || null,
          is_active: true,
        }, {
          onConflict: 'id',  // ถ้า id ซ้ำ (trigger สร้างไว้แล้ว) ให้ update แทน
        })

      if (profileError) throw new Error(`สร้าง profile ไม่สำเร็จ: ${profileError.message}`)
    }

    return { success: true, user: authData.user }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}


export async function updateUserAction(formData: FormData) {
  const userId = formData.get('userId') as string
  const fullName = formData.get('fullName') as string
  const role = formData.get('role') as string
  const employeeCode = formData.get('employeeCode') as string
  const password = formData.get('password') as string
  const isActive = formData.get('isActive') === 'true'
  const avatarUrl = formData.get('avatarUrl') as string | null

  try {
    const supabaseAdmin = createAdminClient()

    // Update Auth Data (Email / Password / Ban state)
    const updatePayload: any = {
      user_metadata: { full_name: fullName, role, employee_code: employeeCode },
      ban_duration: isActive ? 'none' : '876000h' // Ban for 100 years if inactive
    }
    if (password) updatePayload.password = password

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, updatePayload)
    if (authError) throw authError

    // Update Profile
    const profileData: any = {
      full_name: fullName,
      role: role,
      employee_code: employeeCode,
      is_active: isActive
    }
    if (avatarUrl !== null) profileData.avatar_url = avatarUrl

    const { error: profileError } = await supabaseAdmin.from('profiles').update(profileData).eq('id', userId)

    if (profileError) throw profileError

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function generateWorkerTokenAction(formData: FormData) {
  const userId = formData.get('userId') as string

  try {
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
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
