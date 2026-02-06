import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

export async function POST(request) {
    const supabase = await createClient()

    // Check if a user's session exists
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (user) {
        await supabase.auth.signOut()
    }

    revalidatePath('/', 'layout')
    return NextResponse.redirect(new URL('/login', request.url), {
        status: 302,
    })
}
