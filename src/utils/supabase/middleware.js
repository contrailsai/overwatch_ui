import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function updateSession(request) {
  const path = request.nextUrl.pathname
  const copyCookies = (source, target) => {
    for (const cookie of source.cookies.getAll()) {
      target.cookies.set(cookie)
    }
    return target
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value, options)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    console.warn('[auth.middleware] getUser failed', {
      path,
      code: error.code ?? null,
      status: error.status ?? null,
      message: error.message ?? 'unknown',
    })
  }

  const isProtectedRoute = !path.startsWith('/login') && !path.startsWith('/auth')

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    console.info('[auth.middleware] redirecting unauthenticated request', {
      from: path,
      to: '/login',
    })
    const redirectResponse = NextResponse.redirect(url)
    return copyCookies(supabaseResponse, redirectResponse)
  }

  console.debug('[auth.middleware] session check completed', {
    path,
    authenticated: !!user,
  })
  return supabaseResponse
}
