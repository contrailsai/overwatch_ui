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

    // Helper to format local date as YYYY-MM-DD
    const getLocalDateStr = (date) => {
        const tzOffsetMs = date.getTimezoneOffset() * 60000;
        return (new Date(date.getTime() - tzOffsetMs)).toISOString().slice(0, 10);
    }

    // Get current date boundaries
    const now = new Date()
    const todayStr = getLocalDateStr(now)
    
    // Last 7 days
    const last7Days = new Date(now)
    last7Days.setDate(last7Days.getDate() - 6) // Include today
    const last7DaysStr = getLocalDateStr(last7Days)

    // Last 30 days
    const last30Days = new Date(now)
    last30Days.setDate(last30Days.getDate() - 29) // Include today
    const last30DaysStr = getLocalDateStr(last30Days)

    // Fetch all logs for these clients to calculate all-time stats as well
    const clientIds = client_details.map(c => c.id)
    const { data: logsData, error: logsError } = await supabase
        .from('client_logs')
        .select('*')
        .in('client_id', clientIds)
        .eq('project_name', project_name)

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
                    last7DaysCases: 0,
                    last7DaysProfiles: 0,
                    last30DaysCases: 0,
                    last30DaysProfiles: 0,
                    allTimeCases: 0,
                    allTimeProfiles: 0,
                    todayReports: {},
                    last7DaysReports: {},
                    last30DaysReports: {},
                    allTimeReports: {}
                }
            }
            
            // Helper to merge report counts
            const mergeReports = (target, source) => {
                if (!source) return;
                Object.keys(source).forEach(key => {
                    target[key] = (target[key] || 0) + source[key]
                })
            }

            // All-time aggregation
            logsMap[cid].allTimeCases += log.reviewed_cases || 0
            logsMap[cid].allTimeProfiles += log.reviewed_profiles || 0
            mergeReports(logsMap[cid].allTimeReports, log.reports_download)

            // 30 days aggregation
            if (log.date >= last30DaysStr) {
                logsMap[cid].last30DaysCases += log.reviewed_cases || 0
                logsMap[cid].last30DaysProfiles += log.reviewed_profiles || 0
                mergeReports(logsMap[cid].last30DaysReports, log.reports_download)
            }

            // 7 days aggregation
            if (log.date >= last7DaysStr) {
                logsMap[cid].last7DaysCases += log.reviewed_cases || 0
                logsMap[cid].last7DaysProfiles += log.reviewed_profiles || 0
                mergeReports(logsMap[cid].last7DaysReports, log.reports_download)
            }

            // Today data
            if (log.date === todayStr) {
                logsMap[cid].todayLoginTime = log.login_time
                logsMap[cid].todayLastActivity = log.last_activity
                logsMap[cid].todayCases = log.reviewed_cases || 0
                logsMap[cid].todayProfiles = log.reviewed_profiles || 0
                mergeReports(logsMap[cid].todayReports, log.reports_download)
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
            last7DaysCases: 0,
            last7DaysProfiles: 0,
            last30DaysCases: 0,
            last30DaysProfiles: 0,
            allTimeCases: 0,
            allTimeProfiles: 0,
            todayReports: {},
            last7DaysReports: {},
            last30DaysReports: {},
            allTimeReports: {}
        }
        
        return {
            ...client,
            activityStats: stats,
            meta_stats: {
                reviewed_cases: stats.allTimeCases,
                reviewed_profiles: stats.allTimeProfiles
            }
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

export const update_client_alias = traceAction('update_client_alias', async (userId, alias) => {
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

    const { error: dbError } = await supabaseAdmin
        .from('client_details')
        .update({ alias: alias })
        .eq('id', userId)

    if (dbError) {
        console.error("DB Update Alias Error:", dbError)
        return { error: dbError.message }
    }

    revalidatePath('/admin')
    return { success: true }
})

export const update_client_organization = traceAction('update_client_organization', async (userId, organization) => {
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

    const { error: dbError } = await supabaseAdmin
        .from('client_details')
        .update({ organization: organization })
        .eq('id', userId)

    if (dbError) {
        console.error("DB Update Organization Error:", dbError)
        return { error: dbError.message }
    }

    revalidatePath('/admin')
    return { success: true }
})
