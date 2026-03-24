'use server'
import { revalidatePath } from 'next/cache'

import { traceAction, recordClickMetric } from '@/utils/tracing'
import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const fetch_clients_in_project = traceAction('fetch_clients_in_project', async (project_name) => {
    const supabase = await createClient()

    const { data: client_details, error } = await supabase
        .from('client_details')
        .select('*')
        .eq('project_name', project_name)
        .neq('permission', 'reviewer')

    if (error) {
        console.error("ERROR fetching client details: ", error)
        return null
    }

    // Get current date boundaries
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    
    // Start of week (assuming Monday is start of week)
    const startOfWeek = new Date(now)
    const day = startOfWeek.getDay() || 7 // Get current day number, converting Sun(0) to 7
    if (day !== 1) startOfWeek.setHours(-24 * (day - 1)) // Adjust to previous Monday
    const startOfWeekStr = startOfWeek.toISOString().split('T')[0]

    // Start of month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfMonthStr = startOfMonth.toISOString().split('T')[0]

    // Fetch logs for these clients within the current month
    const clientIds = client_details.map(c => c.id)
    const { data: logsData, error: logsError } = await supabase
        .from('client_logs')
        .select('*')
        .in('client_id', clientIds)
        .eq('project_name', project_name)
        .gte('date', startOfMonthStr)

    if (logsError) {
        console.error("ERROR fetching client logs: ", logsError)
        return client_details // Return basic details if logs fail
    }

    // Process logs into an aggregated map per client
    const logsMap = {}
    if (logsData) {
        logsData.forEach(log => {
            const cid = log.client_id
            if (!logsMap[cid]) {
                logsMap[cid] = {
                    todayLoginTime: null,
                    todayLastActivity: null,
                    todayCases: 0,
                    todayProfiles: 0,
                    weekCases: 0,
                    weekProfiles: 0,
                    monthCases: 0,
                    monthProfiles: 0
                }
            }
            
            // Month aggregation (all fetched logs are >= startOfMonthStr)
            logsMap[cid].monthCases += log.reviewed_cases || 0
            logsMap[cid].monthProfiles += log.reviewed_profiles || 0

            // Week aggregation
            if (log.date >= startOfWeekStr) {
                logsMap[cid].weekCases += log.reviewed_cases || 0
                logsMap[cid].weekProfiles += log.reviewed_profiles || 0
            }

            // Today data
            if (log.date === todayStr) {
                logsMap[cid].todayLoginTime = log.login_time
                logsMap[cid].todayLastActivity = log.last_activity
                logsMap[cid].todayCases = log.reviewed_cases || 0
                logsMap[cid].todayProfiles = log.reviewed_profiles || 0
            }
        })
    }

    // Merge log metrics into client details
    const enrichedClients = client_details.map(client => {
        const stats = logsMap[client.id] || {
            todayLoginTime: null,
            todayLastActivity: null,
            todayCases: 0,
            todayProfiles: 0,
            weekCases: 0,
            weekProfiles: 0,
            monthCases: 0,
            monthProfiles: 0
        }
        
        return {
            ...client,
            activityStats: stats
        }
    })

    return enrichedClients
})

export const create_new_client = traceAction('create_new_client', async (email, password, projectName) => {

    // 1. Initialize the Admin Client using the Service Role Key
    // This bypasses RLS and prevents overwriting the Admin's current session cookies.
    const supabaseAdmin = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )

    // 2. Create the user using the Admin API 
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email.trim(), // Added .trim() to prevent the invalid email error!
        password: password,
        email_confirm: true,
    })

    if (authError) {
        console.error("Auth Error:", authError)
        return { error: authError.message }
    }

    // 3. Upsert into client_details (Insert, or Update if it exists)
    const { error: dbError } = await supabaseAdmin
        .from('client_details')
        .upsert({
            id: authData.user.id,
            email: email.trim(),
            project_name: projectName,
            permission: 'client'
        }, {
            onConflict: 'id' // Tells Supabase to check the 'id' column for duplicates
        })

    if (dbError) {
        console.error("DB Error:", dbError)
        // Cleanup: If the DB insert fails, delete the Auth user so you don't have ghost accounts.
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
        return { error: dbError.message }
    }

    revalidatePath('/admin')
    return { success: true, user: authData.user }
})

export const delete_client = traceAction('delete_client', async (userId) => {
    const supabaseAdmin = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )

    // Explicitly delete from client_details
    const { error: dbError } = await supabaseAdmin
        .from('client_details')
        .delete()
        .eq('id', userId)

    // Delete user from auth.users
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (authError) {
        console.error("Auth Delete Error:", authError)
        return { error: authError.message }
    }

    if (dbError) {
        console.error("DB Delete Error:", dbError)
        return { error: dbError.message }
    }

    revalidatePath('/admin')
    return { success: true }
})