import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const { pathname } = request.nextUrl

  // 1. Static files & public assets — pass straight through
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/manifest') ||
    pathname.startsWith('/sw.js') ||
    pathname.startsWith('/workbox') ||
    pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|woff2?|json)$/)
  ) {
    return response
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mredhrvxhcdhityoouxa.supabase.co'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_thhGWSDaCViFfi7ym-do1g_EN4WHHb9'

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        response = NextResponse.next({
          request,
        })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  // 2. Fetch authenticated user safely
  const { data: { user } } = await supabase.auth.getUser()

  // 3. Unauthenticated access protection: redirect to /login immediately
  if (!user && pathname !== '/login') {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // 4. Authenticated user visiting /login or root /: redirect to /dashboard
  if (user && (pathname === '/login' || pathname === '/')) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    return NextResponse.redirect(dashboardUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icon|manifest\\.json|sw\\.js|workbox|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)).*)',
  ],
}
