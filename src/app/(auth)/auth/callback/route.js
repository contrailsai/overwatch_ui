import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getAuthContext } from '@/utils/auth-context'
import { resolveDefaultLandingPage } from '@/lib/project-sections'
import { flushOtelLogs, logActionWarn, LOKI_STREAMS, otelLogger } from '@/utils/otel-logger'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Explicit deep-link next param wins; otherwise use project default landing page
  const hasExplicitNext = searchParams.has('next')
  const nextParam = searchParams.get('next')
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv = process.env.NODE_ENV === 'development'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      let next = hasExplicitNext ? (nextParam || '/') : null
      if (!next) {
        const ctx = await getAuthContext()
        next = resolveDefaultLandingPage(ctx?.project?.project_details)
      }

      otelLogger.info('[auth.callback] exchangeCodeForSession success', {
        app_span_type: 'auth_callback',
        has_forwarded_host: !!forwardedHost,
        next,
      })
      await flushOtelLogs()
      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
    logActionWarn({
      loki_stream: LOKI_STREAMS.auth,
      app_action: 'auth.callback',
      message: 'exchangeCodeForSession failed',
      code: error?.code ?? null,
      status: error?.status ?? null,
      oauth_message: error?.message ?? 'unknown',
      has_forwarded_host: !!forwardedHost,
    })
    await flushOtelLogs()
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
