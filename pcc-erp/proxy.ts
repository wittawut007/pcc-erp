import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { canAccess, getDefaultPath } from '@/lib/rbac'
import type { UserRole } from '@/lib/supabase/types'

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Allow all requests during development without Supabase
  if (!supabaseUrl || supabaseUrl === 'your_supabase_project_url' || !supabaseKey) {
    return NextResponse.next()
  }

  const path = request.nextUrl.pathname

  // ─── กรณี A: Worker QR Entry ─────────────────────────────────────────────
  // /worker-entry?token=xxx → validate token → set cookie → redirect /worker
  if (path === '/worker-entry') {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
      return NextResponse.redirect(new URL('/unauthorized?reason=invalid_qr', request.url))
    }

    try {
      const adminSupabase = createAdminClient(supabaseUrl, serviceRoleKey || supabaseKey)
      const { data: profile } = await adminSupabase
        .from('profiles')
        .select('id, role, is_active, worker_token')
        .eq('worker_token', token)
        .single()

      if (!profile || profile.role !== 'worker' || !profile.is_active) {
        return NextResponse.redirect(new URL('/unauthorized?reason=invalid_qr', request.url))
      }

      // Token valid → set HTTP-only cookie and redirect to /worker
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

  // ─── กรณี C: Mobile Route (QC & Worker) ──────────────────────────────────────────────
  // /qc-inspect และ /worker → ต้องมี Session ปกติ
  if (path === '/qc-inspect' || path.startsWith('/qc-inspect/') || path === '/worker' || path.startsWith('/worker/')) {
    let supabaseResponseMobile = NextResponse.next({ request })
    const supabaseMobile = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponseMobile = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponseMobile.cookies.set(name, value, options)
          )
        },
      },
    })

    const { data: { user } } = await supabaseMobile.auth.getUser()
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    try {
      const { data: profile } = await supabaseMobile
        .from('profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .single()

      if (!profile || !profile.is_active) {
        return NextResponse.redirect(new URL('/unauthorized?reason=forbidden', request.url))
      }

      // Check specific role
      if (path.startsWith('/qc-inspect') && profile.role !== 'qc' && profile.role !== 'admin') {
        return NextResponse.redirect(new URL('/unauthorized?reason=forbidden', request.url))
      }
      if (path.startsWith('/worker') && profile.role !== 'worker' && profile.role !== 'admin') {
        return NextResponse.redirect(new URL('/unauthorized?reason=forbidden', request.url))
      }
    } catch {
      return NextResponse.redirect(new URL('/unauthorized?reason=forbidden', request.url))
    }

    return supabaseResponseMobile
  }

  // ─── กรณี D: Admin/Standard Desktop Routes ───────────────────────────────
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  // ไม่ได้ Login และพยายามเข้าหน้าอื่น → redirect /login
  if (!user && path !== '/login' && path !== '/unauthorized') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Login แล้วเข้า /login → redirect ไปหน้าที่เหมาะสมตาม role
  if (user && path === '/login') {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      const role = (profile?.role ?? 'admin') as UserRole
      const defaultPath = getDefaultPath(role)
      return NextResponse.redirect(new URL(defaultPath, request.url))
    } catch {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // Login แล้วเข้า route ที่ต้องตรวจสิทธิ์
  if (user && path !== '/login' && path !== '/unauthorized') {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      const role = (profile?.role ?? 'admin') as UserRole

      // Worker → redirect ไป mobile route
      if (role === 'worker') {
        return NextResponse.redirect(new URL('/worker', request.url))
      }

      // QC → redirect ไป mobile route
      if (role === 'qc') {
        return NextResponse.redirect(new URL('/qc-inspect', request.url))
      }

      // ตรวจสิทธิ์ตาม role
      if (!canAccess(role, path)) {
        return NextResponse.redirect(new URL('/unauthorized?reason=forbidden', request.url))
      }
    } catch {
      // ถ้า query ไม่ได้ให้ผ่านไปก่อน (เช่น ตอน dev)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
