'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { requireRole } from '@/utils/auth-context'

export async function get_research_projects(_project_db) {
    const { dbName } = await requireRole(['client-admin', 'reviewer'])
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = db.collection('ResearchWatchlist')

    const projects = await collection.find({}).sort({ created_at: -1 }).toArray()
    
    return {
        projects: projects.map(p => ({
            ...p,
            _id: p._id.toString()
        }))
    }
}

export async function create_research_project(_project_db, title, description) {
    const { dbName } = await requireRole(['client-admin', 'reviewer'])
    if (!title?.trim()) return { error: 'Project db and title are required' }
    
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = db.collection('ResearchWatchlist')

    const newProject = {
        title: title.trim(),
        description: description?.trim() || '',
        keywords: [],
        profiles: [],
        created_at: new Date().toISOString()
    }

    const result = await collection.insertOne(newProject)
    return { success: true, insertedId: result.insertedId.toString() }
}

export async function delete_research_project(_project_db, projectId) {
    const { dbName } = await requireRole(['client-admin', 'reviewer'])
    if (!projectId) return { error: 'Invalid project or ID' }
    
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = db.collection('ResearchWatchlist')

    await collection.deleteOne({ _id: new ObjectId(projectId) })
    return { success: true }
}

export async function add_keyword_to_project(_project_db, projectId, keyword, priority = 'low') {
    const { dbName } = await requireRole(['client-admin', 'reviewer'])
    if (!projectId || !keyword?.trim()) return { error: 'Invalid inputs' }
    
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = db.collection('ResearchWatchlist')

    const trimmed = keyword.trim()

    // Check if keyword already exists
    const project = await collection.findOne({ _id: new ObjectId(projectId) })
    if (!project) return { error: 'Project not found' }
    
    if (project.keywords?.some(k => k.keyword.toLowerCase() === trimmed.toLowerCase())) {
        return { error: 'Keyword already exists in this project' }
    }

    const newKeyword = {
        keyword: trimmed,
        priority: priority === 'high' ? 'high' : 'low',
        added_at: new Date().toISOString()
    }

    await collection.updateOne(
        { _id: new ObjectId(projectId) },
        { $push: { keywords: newKeyword } }
    )

    return { success: true }
}

export async function remove_keyword_from_project(_project_db, projectId, keyword) {
    const { dbName } = await requireRole(['client-admin', 'reviewer'])
    if (!projectId || !keyword) return { error: 'Invalid inputs' }
    
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = db.collection('ResearchWatchlist')

    await collection.updateOne(
        { _id: new ObjectId(projectId) },
        { $pull: { keywords: { keyword: keyword } } }
    )

    return { success: true }
}

export async function add_profile_to_project(_project_db, projectId, url) {
    const { dbName } = await requireRole(['client-admin', 'reviewer'])
    if (!projectId || !url?.trim()) return { error: 'Invalid inputs' }
    
    const trimmedUrl = url.trim()
    try {
        new URL(trimmedUrl) // Basic URL validation
        if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
            return { error: 'Please provide a valid URL starting with http:// or https://' }
        }
    } catch (_) {
        return { error: 'Please provide a valid URL starting with http:// or https://' }
    }
    
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = db.collection('ResearchWatchlist')

    const project = await collection.findOne({ _id: new ObjectId(projectId) })
    if (!project) return { error: 'Project not found' }
    
    if (project.profiles?.some(p => p.url === trimmedUrl)) {
        return { error: 'Profile already exists in this project' }
    }

    const newProfile = {
        url: trimmedUrl,
        added_at: new Date().toISOString()
    }

    await collection.updateOne(
        { _id: new ObjectId(projectId) },
        { $push: { profiles: newProfile } }
    )

    return { success: true }
}

export async function remove_profile_from_project(_project_db, projectId, url) {
    const { dbName } = await requireRole(['client-admin', 'reviewer'])
    if (!projectId || !url) return { error: 'Invalid inputs' }
    
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = db.collection('ResearchWatchlist')

    await collection.updateOne(
        { _id: new ObjectId(projectId) },
        { $pull: { profiles: { url: url } } }
    )

    return { success: true }
}