import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { canAccess, getDefaultPath } from '@/lib/rbac'
import type { UserRole } from '@/lib/supabase/types'
function redirectWithCookies(url: string | URL, baseResponse: NextResponse): NextResponse {
  const response = NextResponse.redirect(url)
  baseResponse.cookies.getAll().forEach((cookie) => {
    const { name, value, ...options } = cookie
    response.cookies.set(name, value, options)
  })
  return response
}

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Allow all requests during development without Supabase
  if (!supabaseUrl || supabaseUrl === 'your_supabase_project_url' || !supabaseKey) {
    return NextResponse.next()
  }
  const path = request.nextUrl.pathname

  // Skip proxy logic for Next.js prefetch requests to prevent token refresh race conditions
  if (
    request.headers.get('next-router-prefetch') ||
    request.headers.get('purpose') === 'prefetch' ||
    request.headers.get('x-middleware-prefetch') ||
    request.headers.get('x-proxy-prefetch')
  ) {
    return NextResponse.next()
  }

  // Bypass proxy for static public assets (images, fonts, etc.)
  if (
    path.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|woff2?|eot|ttf)$/) ||
    path.startsWith('/_next/')
  ) {
    return NextResponse.next()
  }

  // ─── กรณี API Routes: รีเฟรช Cookie และตรวจสอบ Auth ───────────────────
  if (path.startsWith('/api/')) {
    if (path === '/api/seed-users' || path === '/api/auth/test-worker') {
      return NextResponse.next()
    }

    let supabaseApiResponse = NextResponse.next({ request })
    const supabaseApi = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseApiResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseApiResponse.cookies.set(name, value, options)
          )
          if (headers) {
            Object.entries(headers).forEach(([key, value]) =>
              supabaseApiResponse.headers.set(key, value)
            )
          }
        },
      },
    })

    let user = null
    try {
      const { data } = await supabaseApi.auth.getUser()
      user = data?.user || null
    } catch (e) {
      console.warn('Supabase getUser failed in proxy API handler:', e)
    }

    if (!user && process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 })
    }

    return supabaseApiResponse
  }

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
        .maybeSingle()

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
  // /qc-inspect และ /worker → ต้องมี Session ปกติ หรือมี worker_session (สำหรับ worker)
  if (path === '/qc-inspect' || path.startsWith('/qc-inspect/') || path === '/worker' || path.startsWith('/worker/')) {
    let supabaseResponseMobile = NextResponse.next({ request })

    // Check if worker session exists for worker path
    const isWorkerPath = path === '/worker' || path.startsWith('/worker/')
    const workerSession = request.cookies.get('worker_session')?.value

    if (isWorkerPath && workerSession) {
      try {
        const adminSupabase = createAdminClient(supabaseUrl, serviceRoleKey || supabaseKey)
        const { data: profile } = await adminSupabase
          .from('profiles')
          .select('id, role, is_active')
          .eq('worker_token', workerSession)
          .maybeSingle()

        if (profile && profile.role === 'worker' && profile.is_active) {
          // Token valid: allow access to worker page
          return supabaseResponseMobile
        }
      } catch (err) {
        console.error('Error validating worker session in proxy:', err)
      }
    }

    const supabaseMobile = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponseMobile = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponseMobile.cookies.set(name, value, options)
          )
          if (headers) {
            Object.entries(headers).forEach(([key, value]) =>
              supabaseResponseMobile.headers.set(key, value)
            )
          }
        },
      },
    })

    let user = null
    try {
      const { data } = await supabaseMobile.auth.getUser()
      user = data?.user || null
    } catch (e) {
      console.warn('Supabase getUser failed in proxy Case C:', e)
    }

    if (!user) {
      // In development mode, allow bypass if database is unreachable, except when workerSession failed validation
      if (process.env.NODE_ENV === 'development' && !workerSession) {
        return supabaseResponseMobile
      }
      return redirectWithCookies(new URL('/login', request.url), supabaseResponseMobile)
    }

    let role: UserRole = (user.user_metadata?.role as UserRole) || 'worker'
    try {
      const { data: profile } = await supabaseMobile
        .from('profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.role) {
        role = profile.role as UserRole
      }
    } catch (e) {
      console.warn('Profile query failed in proxy Case C:', e)
    }

    // Check specific role
    if (path.startsWith('/qc-inspect') && role !== 'qc' && role !== 'admin' && role !== 'super_admin') {
      return redirectWithCookies(new URL('/unauthorized?reason=forbidden', request.url), supabaseResponseMobile)
    }
    if (path.startsWith('/worker') && role !== 'worker' && role !== 'admin' && role !== 'super_admin') {
      return redirectWithCookies(new URL('/unauthorized?reason=forbidden', request.url), supabaseResponseMobile)
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
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
        if (headers) {
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          )
        }
      },
    },
  })

  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data?.user || null
  } catch (e) {
    console.warn('Supabase getUser failed in proxy Case D:', e)
  }

  // ไม่ได้ Login และพยายามเข้าหน้าอื่น → redirect /login
  if (!user && path !== '/login' && path !== '/unauthorized') {
    return redirectWithCookies(new URL('/login', request.url), supabaseResponse)
  }

  // Login แล้วเข้า /login → redirect ไปหน้าที่เหมาะสมตาม role
  if (user && path === '/login') {
    let role: UserRole = (user.user_metadata?.role as UserRole) || 'admin'
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.role) {
        role = profile.role as UserRole
      }
    } catch {
      // fallback to user_metadata or admin
    }
    const defaultPath = getDefaultPath(role)
    return redirectWithCookies(new URL(defaultPath, request.url), supabaseResponse)
  }

  // Login แล้วเข้า route ที่ต้องตรวจสิทธิ์
  if (user && path !== '/login' && path !== '/unauthorized') {
    let role: UserRole = (user.user_metadata?.role as UserRole) || 'admin'
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profile?.role) {
        role = profile.role as UserRole
      }
    } catch (e) {
      console.warn('Profile fetch failed in proxy:', e)
    }

    // Worker → redirect ไป mobile route
    if (role === 'worker' && !path.startsWith('/worker')) {
      return redirectWithCookies(new URL('/worker', request.url), supabaseResponse)
    }

    // QC → redirect ไป mobile route
    if (role === 'qc' && !path.startsWith('/qc-inspect')) {
      return redirectWithCookies(new URL('/qc-inspect', request.url), supabaseResponse)
    }

    // ตรวจสิทธิ์ตาม role
    if (!canAccess(role, path)) {
      return redirectWithCookies(new URL('/unauthorized?reason=forbidden', request.url), supabaseResponse)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo\\.png|.*\\.png$|.*\\.svg$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.webp$|.*\\.ico$|.*\\.css$|.*\\.js$).*)'],
}
