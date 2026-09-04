'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getAuthContext } from '@/utils/auth-context'
import { resolveDefaultLandingPage } from '@/lib/project-sections'
import { logActionWarn, LOKI_STREAMS } from '@/utils/otel-logger'
import { traceAction } from '@/utils/tracing'

export const login = traceAction(
  'auth.login',
  async (prevState, formData) => {
    const supabase = await createClient()

    const email = formData.get('email')
    const password = formData.get('password')
    const emailDomain = typeof email === 'string' && email.includes('@') ? email.split('@')[1] : null

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      logActionWarn({
        loki_stream: LOKI_STREAMS.auth,
        app_caller: 'login/actions',
        app_action: 'auth.login',
        message: '[auth.login] signInWithPassword failed',
        email_domain: emailDomain,
        code: error.code ?? null,
        status: error.status ?? null,
        error_message: error.message ?? 'unknown',
      })
      console.warn('[auth.login] signInWithPassword failed', {
        emailDomain,
        code: error.code ?? null,
        status: error.status ?? null,
        message: error.message ?? 'unknown',
      })
      return { error: error.message }
    }

    revalidatePath('/', 'layout')

    const ctx = await getAuthContext()
    const landing = resolveDefaultLandingPage(ctx?.project?.project_details)
    redirect(landing)
  },
  { loki_stream: LOKI_STREAMS.auth },
)
