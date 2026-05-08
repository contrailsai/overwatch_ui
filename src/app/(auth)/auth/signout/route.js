import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

export async function POST(request) {
    const supabase = await createClient()

    // Check if a user's session exists
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
        console.warn('[auth.signout] getUser failed before signout', {
            code: userError.code ?? null,
            status: userError.status ?? null,
            message: userError.message ?? 'unknown',
        })
    }

    if (user) {
        await supabase.auth.signOut()
        console.info('[auth.signout] signOut success', { userId: user.id })
    }

    revalidatePath('/', 'layout')
    return NextResponse.redirect(new URL('/login', request.url), {
        status: 302,
    })
}
