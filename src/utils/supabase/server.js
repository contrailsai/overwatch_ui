import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

/**
 * Get the current authenticated user, cached for the duration of the request.
 * Use this in Server Components and Server Actions to avoid redundant Supabase calls.
 */
export const getAuthenticatedUser = cache(async () => {
  const supabase = await createClient()
  // Use getSession() for performance - it reads from the cookie without a network round-trip.
  // This is safe because our middleware already verifies the user with getUser() on every request.
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
})
