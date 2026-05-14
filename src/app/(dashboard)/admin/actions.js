'use server'
import { revalidatePath } from 'next/cache'

import { traceAction } from '@/utils/tracing'
import { createClient } from '@/utils/supabase/server'
import { requireRole } from '@/utils/auth-context'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const fetch_clients_in_project = traceAction('fetch_clients_in_project', async () => {
    const { clientDetails } = await requireRole(['client-admin', 'reviewer'])
    const supabase = await createClient()

    const { data: client_details, error } = await supabase
        .from('client_details')
        .select('*')
        .eq('project_name', clientDetails.project_name)
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
        .eq('project_name', clientDetails.project_name)

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

// Helper to format local date as YYYY-MM-DD (kept identical to fetch_clients_in_project)
const _getLocalDateStr = (date) => {
    const tzOffsetMs = date.getTimezoneOffset() * 60000
    return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 10)
}

export const fetch_capacity_metrics = traceAction('fetch_capacity_metrics', async () => {
    const { clientDetails } = await requireRole(['client-admin', 'reviewer'])
    const supabase = await createClient()
    const projectName = clientDetails.project_name
    if (!projectName) return null

    const now = new Date()
    const last30Days = new Date(now)
    last30Days.setDate(last30Days.getDate() - 29)
    const startStr = _getLocalDateStr(last30Days)

    const [casesRes, reviewedRes, teamLogsRes] = await Promise.all([
        supabase
            .from('daily_case_metrics')
            .select('date, total_cases')
            .eq('project_name', projectName)
            .gte('date', startStr),
        supabase
            .from('daily_reviewed_metrics')
            .select('date, total_reviewed')
            .eq('project_name', projectName)
            .gte('date', startStr),
        supabase
            .from('client_logs')
            .select('date, client_id, reviewed_cases, reviewed_profiles, last_activity')
            .eq('project_name', projectName)
            .gte('date', startStr)
    ])

    if (casesRes.error) console.error('ERROR fetching daily_case_metrics:', casesRes.error)
    if (reviewedRes.error) console.error('ERROR fetching daily_reviewed_metrics:', reviewedRes.error)
    if (teamLogsRes.error) console.error('ERROR fetching team client_logs:', teamLogsRes.error)

    // Aggregate project-level (across platforms) by date
    const casesByDate = {}
    const reviewedByDate = {}
    ;(casesRes.data || []).forEach(r => {
        if (!r.date) return
        casesByDate[r.date] = (casesByDate[r.date] || 0) + (r.total_cases || 0)
    })
    ;(reviewedRes.data || []).forEach(r => {
        if (!r.date) return
        reviewedByDate[r.date] = (reviewedByDate[r.date] || 0) + (r.total_reviewed || 0)
    })

    // Aggregate team-side (per-user logs rolled up by date)
    const teamByDate = {}
    ;(teamLogsRes.data || []).forEach(r => {
        if (!r.date) return
        const bucket = teamByDate[r.date] || (teamByDate[r.date] = {
            cases: 0,
            profiles: 0,
            activeMemberIds: new Set()
        })
        bucket.cases += r.reviewed_cases || 0
        bucket.profiles += r.reviewed_profiles || 0
        if (r.last_activity || (r.reviewed_cases || 0) > 0 || (r.reviewed_profiles || 0) > 0) {
            bucket.activeMemberIds.add(r.client_id)
        }
    })

    // Fill dense 30-day series (oldest to newest)
    const dailySeries = []
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(d.getDate() - i)
        const ds = _getLocalDateStr(d)
        const team = teamByDate[ds]
        dailySeries.push({
            date: ds,
            cases: casesByDate[ds] || 0,
            reviewed: reviewedByDate[ds] || 0,
            teamCases: team?.cases || 0,
            teamProfiles: team?.profiles || 0,
            activeMembers: team ? team.activeMemberIds.size : 0
        })
    }

    const last7 = dailySeries.slice(-7)
    const prior7 = dailySeries.slice(-14, -7)
    const sum = (arr, k) => arr.reduce((s, r) => s + (r[k] || 0), 0)
    const avg = (arr, k) => arr.length ? sum(arr, k) / arr.length : 0
    const pctDelta = (curr, prev) => {
        if (!prev) return curr > 0 ? 100 : null
        return Math.round(((curr - prev) / prev) * 100)
    }

    return {
        dailySeries,
        last7: {
            cases: sum(last7, 'cases'),
            reviewed: sum(last7, 'reviewed'),
            teamCases: sum(last7, 'teamCases'),
            teamProfiles: sum(last7, 'teamProfiles'),
            avgActiveMembers: avg(last7, 'activeMembers')
        },
        last30: {
            cases: sum(dailySeries, 'cases'),
            reviewed: sum(dailySeries, 'reviewed'),
            teamCases: sum(dailySeries, 'teamCases'),
            teamProfiles: sum(dailySeries, 'teamProfiles')
        },
        deltas: {
            teamCases: pctDelta(sum(last7, 'teamCases'), sum(prior7, 'teamCases')),
            teamProfiles: pctDelta(sum(last7, 'teamProfiles'), sum(prior7, 'teamProfiles')),
            activeMembers: pctDelta(avg(last7, 'activeMembers'), avg(prior7, 'activeMembers'))
        }
    }
})

export const fetch_client_activity_history = traceAction('fetch_client_activity_history', async (clientId, days = 30) => {
    const { clientDetails } = await requireRole(['client-admin', 'reviewer'])
    const supabase = await createClient()
    const projectName = clientDetails.project_name
    if (!clientId || !projectName) return { error: 'Invalid request.' }

    const range = Math.max(1, Math.min(Number(days) || 30, 180))
    const now = new Date()
    const start = new Date(now)
    start.setDate(start.getDate() - (range - 1))
    const startStr = _getLocalDateStr(start)

    const { data, error } = await supabase
        .from('client_logs')
        .select('date, login_time, last_activity, reviewed_cases, reviewed_profiles, reports_download')
        .eq('client_id', clientId)
        .eq('project_name', projectName)
        .gte('date', startStr)
        .order('date', { ascending: true })

    if (error) {
        console.error('ERROR fetching client_logs:', error)
        return { error: error.message }
    }

    // Build dense series so the heatmap has every day
    const byDate = {}
    ;(data || []).forEach(r => { if (r.date) byDate[r.date] = r })

    const series = []
    for (let i = range - 1; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(d.getDate() - i)
        const ds = _getLocalDateStr(d)
        const row = byDate[ds]
        series.push({
            date: ds,
            cases: row?.reviewed_cases || 0,
            profiles: row?.reviewed_profiles || 0,
            loginTime: row?.login_time || null,
            lastActivity: row?.last_activity || null,
            reports: row?.reports_download || {}
        })
    }

    // Aggregate report counts across the window
    const reportTotals = {}
    series.forEach(d => {
        Object.entries(d.reports || {}).forEach(([k, v]) => {
            reportTotals[k] = (reportTotals[k] || 0) + (v || 0)
        })
    })

    return {
        days: range,
        series,
        totals: {
            cases: series.reduce((s, d) => s + d.cases, 0),
            profiles: series.reduce((s, d) => s + d.profiles, 0),
            activeDays: series.filter(d => d.cases > 0 || d.profiles > 0 || d.loginTime).length,
            reports: reportTotals
        }
    }
})

export const create_new_client = traceAction('create_new_client', async (email, password) => {
    const { clientDetails } = await requireRole(['client-admin'])
    const projectName = clientDetails.project_name
    if (!projectName) {
        return { error: 'Your account is not assigned to a project.' }
    }

    const trimmedEmail = typeof email === 'string' ? email.trim() : ''
    if (!trimmedEmail || !password || String(password).length < 6) {
        return { error: 'Valid email and password (at least 6 characters) are required.' }
    }

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
        email: trimmedEmail,
        password,
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
            email: trimmedEmail,
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
    const { user, clientDetails } = await requireRole(['client-admin'])
    const tenantProject = clientDetails.project_name
    if (!userId || !tenantProject) {
        return { error: 'Invalid request.' }
    }
    if (userId === user.id) {
        return { error: 'You cannot delete your own account.' }
    }

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

    const { data: deletedRows, error: dbError } = await supabaseAdmin
        .from('client_details')
        .delete()
        .eq('id', userId)
        .eq('project_name', tenantProject)
        .select('id')

    if (dbError) {
        console.error('DB Delete Error:', dbError)
        return { error: dbError.message }
    }
    if (!deletedRows?.length) {
        return { error: 'User not found or you do not have permission to remove this account.' }
    }

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (authError) {
        console.error('Auth Delete Error:', authError)
        return { error: authError.message }
    }

    revalidatePath('/admin')
    return { success: true }
})

export const update_client_alias = traceAction('update_client_alias', async (userId, alias) => {
    const { clientDetails } = await requireRole(['client-admin'])
    const tenantProject = clientDetails.project_name
    if (!userId || !tenantProject) {
        return { error: 'Invalid request.' }
    }

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

    const { data: updatedRows, error: dbError } = await supabaseAdmin
        .from('client_details')
        .update({ alias })
        .eq('id', userId)
        .eq('project_name', tenantProject)
        .select('id')

    if (dbError) {
        console.error('DB Update Alias Error:', dbError)
        return { error: dbError.message }
    }
    if (!updatedRows?.length) {
        return { error: 'User not found or you do not have permission to update this account.' }
    }

    revalidatePath('/admin')
    return { success: true }
})

export const update_client_permission = traceAction('update_client_permission', async (userId, permission) => {
    const { user, clientDetails } = await requireRole(['client-admin'])
    const tenantProject = clientDetails.project_name
    if (!userId || !tenantProject) {
        return { error: 'Invalid request.' }
    }
    if (userId === user.id) {
        return { error: 'You cannot change your own role.' }
    }

    const allowed = ['client-admin', 'client-reviewer', 'client']
    if (!allowed.includes(permission)) {
        return { error: 'Invalid role.' }
    }

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

    const { data: updatedRows, error: dbError } = await supabaseAdmin
        .from('client_details')
        .update({ permission })
        .eq('id', userId)
        .eq('project_name', tenantProject)
        .select('id')

    if (dbError) {
        console.error('DB Update Permission Error:', dbError)
        return { error: dbError.message }
    }
    if (!updatedRows?.length) {
        return { error: 'User not found or you do not have permission to update this account.' }
    }

    revalidatePath('/admin')
    return { success: true }
})

export const update_client_organization = traceAction('update_client_organization', async (userId, organization) => {
    const { clientDetails } = await requireRole(['client-admin'])
    const tenantProject = clientDetails.project_name
    if (!userId || !tenantProject) {
        return { error: 'Invalid request.' }
    }

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

    const { data: updatedRows, error: dbError } = await supabaseAdmin
        .from('client_details')
        .update({ organization })
        .eq('id', userId)
        .eq('project_name', tenantProject)
        .select('id')

    if (dbError) {
        console.error('DB Update Organization Error:', dbError)
        return { error: dbError.message }
    }
    if (!updatedRows?.length) {
        return { error: 'User not found or you do not have permission to update this account.' }
    }

    revalidatePath('/admin')
    return { success: true }
})
