'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { requireRole } from '@/utils/auth-context'
import { traceAction, runInSpan } from '@/utils/tracing'

export const get_research_projects = traceAction('configurations.get_research_projects', async (_project_db) => {
  const { dbName } = await requireRole(['client-admin', 'reviewer'])
  const client = await clientPromise
  const db = client.db(dbName)
  const collection = db.collection('ResearchWatchlist')

  const projects = await runInSpan(
    'configurations.get_research_projects.mongo_find',
    async () => collection.find({}).sort({ created_at: -1 }).toArray(),
    { 'app.span_type': 'mongo_query' }
  )

  return {
    projects: projects.map(p => ({
      ...p,
      _id: p._id.toString()
    }))
  }
})

export const create_research_project = traceAction('configurations.create_research_project', async (_project_db, title, description) => {
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

  const result = await runInSpan(
    'configurations.create_research_project.mongo_insert',
    async () => collection.insertOne(newProject),
    { 'app.span_type': 'mongo_query' }
  )
  return { success: true, insertedId: result.insertedId.toString() }
})

export const delete_research_project = traceAction('configurations.delete_research_project', async (_project_db, projectId) => {
  const { dbName } = await requireRole(['client-admin', 'reviewer'])
  if (!projectId) return { error: 'Invalid project or ID' }

  const client = await clientPromise
  const db = client.db(dbName)
  const collection = db.collection('ResearchWatchlist')

  await runInSpan(
    'configurations.delete_research_project.mongo_delete',
    async () => collection.deleteOne({ _id: new ObjectId(projectId) }),
    { 'app.span_type': 'mongo_query' }
  )
  return { success: true }
})

export const add_keyword_to_project = traceAction('configurations.add_keyword_to_project', async (_project_db, projectId, keyword, priority = 'low') => {
  const { dbName } = await requireRole(['client-admin', 'reviewer'])
  if (!projectId || !keyword?.trim()) return { error: 'Invalid inputs' }

  const client = await clientPromise
  const db = client.db(dbName)
  const collection = db.collection('ResearchWatchlist')

  const trimmed = keyword.trim()

  const project = await runInSpan(
    'configurations.add_keyword_to_project.mongo_findOne',
    async () => collection.findOne({ _id: new ObjectId(projectId) }),
    { 'app.span_type': 'mongo_query' }
  )
  if (!project) return { error: 'Project not found' }

  if (project.keywords?.some(k => k.keyword.toLowerCase() === trimmed.toLowerCase())) {
    return { error: 'Keyword already exists in this project' }
  }

  const newKeyword = {
    keyword: trimmed,
    priority: priority === 'high' ? 'high' : 'low',
    added_at: new Date().toISOString()
  }

  await runInSpan(
    'configurations.add_keyword_to_project.mongo_update',
    async () =>
      collection.updateOne(
        { _id: new ObjectId(projectId) },
        { $push: { keywords: newKeyword } }
      ),
    { 'app.span_type': 'mongo_query' }
  )

  return { success: true }
})

export const remove_keyword_from_project = traceAction('configurations.remove_keyword_from_project', async (_project_db, projectId, keyword) => {
  const { dbName } = await requireRole(['client-admin', 'reviewer'])
  if (!projectId || !keyword) return { error: 'Invalid inputs' }

  const client = await clientPromise
  const db = client.db(dbName)
  const collection = db.collection('ResearchWatchlist')

  await runInSpan(
    'configurations.remove_keyword_from_project.mongo_update',
    async () =>
      collection.updateOne(
        { _id: new ObjectId(projectId) },
        { $pull: { keywords: { keyword: keyword } } }
      ),
    { 'app.span_type': 'mongo_query' }
  )

  return { success: true }
})

export const add_profile_to_project = traceAction('configurations.add_profile_to_project', async (_project_db, projectId, url) => {
  const { dbName } = await requireRole(['client-admin', 'reviewer'])
  if (!projectId || !url?.trim()) return { error: 'Invalid inputs' }

  const trimmedUrl = url.trim()
  try {
    new URL(trimmedUrl)
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      return { error: 'Please provide a valid URL starting with http:// or https://' }
    }
  } catch (_) {
    return { error: 'Please provide a valid URL starting with http:// or https://' }
  }

  const client = await clientPromise
  const db = client.db(dbName)
  const collection = db.collection('ResearchWatchlist')

  const project = await runInSpan(
    'configurations.add_profile_to_project.mongo_findOne',
    async () => collection.findOne({ _id: new ObjectId(projectId) }),
    { 'app.span_type': 'mongo_query' }
  )
  if (!project) return { error: 'Project not found' }

  if (project.profiles?.some(p => p.url === trimmedUrl)) {
    return { error: 'Profile already exists in this project' }
  }

  const newProfile = {
    url: trimmedUrl,
    added_at: new Date().toISOString()
  }

  await runInSpan(
    'configurations.add_profile_to_project.mongo_update',
    async () =>
      collection.updateOne(
        { _id: new ObjectId(projectId) },
        { $push: { profiles: newProfile } }
      ),
    { 'app.span_type': 'mongo_query' }
  )

  return { success: true }
})

export const remove_profile_from_project = traceAction('configurations.remove_profile_from_project', async (_project_db, projectId, url) => {
  const { dbName } = await requireRole(['client-admin', 'reviewer'])
  if (!projectId || !url) return { error: 'Invalid inputs' }

  const client = await clientPromise
  const db = client.db(dbName)
  const collection = db.collection('ResearchWatchlist')

  await runInSpan(
    'configurations.remove_profile_from_project.mongo_update',
    async () =>
      collection.updateOne(
        { _id: new ObjectId(projectId) },
        { $pull: { profiles: { url: url } } }
      ),
    { 'app.span_type': 'mongo_query' }
  )

  return { success: true }
})
