import { updateSession } from './utils/supabase/middleware'

export async function proxy(request) {
  return await updateSession(request)
}

// Support both export names for compatibility with different Next.js 16 sub-versions
export const middleware = proxy

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - fonts/ (font files)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|woff|woff2)$).*)',
  ],
}

