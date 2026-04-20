import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /worker-entry?token=<worker_token>
 * Middleware จัดการ logic นี้ไปแล้ว แต่สร้างไว้รองรับกรณี edge case
 * และ fallback สำหรับ static export
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!token) {
    return NextResponse.redirect(new URL('/unauthorized?reason=invalid_qr', request.url))
  }

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.redirect(new URL('/worker', request.url))
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey || supabaseKey)

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, is_active, worker_token')
      .eq('worker_token', token)
      .single()

    if (!profile || profile.role !== 'worker' || !profile.is_active) {
      return NextResponse.redirect(new URL('/unauthorized?reason=invalid_qr', request.url))
    }

    // Set HTTP-only cookie and redirect
    const response = NextResponse.redirect(new URL('/worker', request.url))
    response.cookies.set('worker_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 12, // 12 ชั่วโมง
      path: '/',
    })
    return response
  } catch {
    return NextResponse.redirect(new URL('/unauthorized?reason=invalid_qr', request.url))
  }
}
