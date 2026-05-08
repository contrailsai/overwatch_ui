'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function login(prevState, formData) {
  const supabase = await createClient()

  const email = formData.get('email')
  const password = formData.get('password')
  const emailDomain = typeof email === 'string' && email.includes('@') ? email.split('@')[1] : null

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    console.warn('[auth.login] signInWithPassword failed', {
      emailDomain,
      code: error.code ?? null,
      status: error.status ?? null,
      message: error.message ?? 'unknown',
    })
    return { error: error.message }
  }

  console.info('[auth.login] login success', { emailDomain })

  revalidatePath('/', 'layout')
  redirect('/')
}
