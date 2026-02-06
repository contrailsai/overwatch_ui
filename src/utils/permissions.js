'use server'

import { createClient } from './supabase/server'
import { redirect } from 'next/navigation'

/**
 * Get the current user's permission level
 * @returns {Promise<string|null>} The user's permission level or null if not found
 */
export async function getUserPermission() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return null
    }

    const { data: clientDetails, error } = await supabase
        .from('client_details')
        .select('permission')
        .eq('id', user.id)
        .maybeSingle()

    if (error || !clientDetails) {
        return null
    }

    return clientDetails.permission
}

/**
 * Get the current user
 * @returns {Promise<object|null>} The current user or null
 */
export async function getCurrentUser() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

/**
 * Check if the current user has a specific permission
 * @param {string} requiredPermission - The permission to check for
 * @returns {Promise<boolean>} True if user has the permission
 */
export async function hasPermission(requiredPermission) {
    const permission = await getUserPermission()
    return permission === requiredPermission
}

/**
 * Check if the current user has reviewer permission
 * @returns {Promise<boolean>} True if user is a reviewer
 */
export async function isReviewer() {
    return await hasPermission('reviewer')
}

/**
 * Require the user to be authenticated, redirect to login if not
 * @returns {Promise<object>} The authenticated user
 */
export async function requireAuth() {
    const user = await getCurrentUser()

    if (!user) {
        redirect('/login')
    }

    return user
}

/**
 * Require the user to have a specific permission, redirect to login if not authenticated
 * or return false if authenticated but lacks permission
 * @param {string} requiredPermission - The permission to require
 * @returns {Promise<boolean>} True if user has permission, false otherwise (after ensuring auth)
 */
export async function requirePermission(requiredPermission) {
    await requireAuth()
    return await hasPermission(requiredPermission)
}
