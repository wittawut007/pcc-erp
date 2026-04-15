'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function createUserAction(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('fullName') as string
  const role = formData.get('role') as string
  const employeeCode = formData.get('employeeCode') as string

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

    // 2. Note: Our trigger "on_auth_user_created" might automatically insert a profile.
    // If the trigger already exists and sets name initially, we ensure it updates correctly.
    // Let's directly update the public.profiles just to be safe.
    if (authData.user) {
      await supabaseAdmin.from('profiles').update({
        full_name: fullName,
        role: role,
        employee_code: employeeCode,
        is_active: true
      }).eq('id', authData.user.id)
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
    const { error: profileError } = await supabaseAdmin.from('profiles').update({
      full_name: fullName,
      role: role,
      employee_code: employeeCode,
      is_active: isActive
    }).eq('id', userId)

    if (profileError) throw profileError

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
