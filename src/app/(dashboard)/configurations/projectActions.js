'use server'

import { createClient } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { revalidatePath } from 'next/cache'
import { getAuthContext } from '@/utils/auth-context'
import { runInSpan } from '@/utils/tracing'

export async function updateLabels(prevState, formData) {
  const ctx = await getAuthContext()
  if (!ctx?.clientDetails?.project_name || !ctx.dbName) {
    return { error: 'Not authenticated' }
  }

  const projectData = ctx.project
  if (!projectData?.mongo_db_map) {
    return { error: 'Project not found' }
  }

  const allowedRoles = ['client-admin', 'reviewer']
  if (!allowedRoles.includes(ctx.clientDetails.permission)) {
    return { error: 'Insufficient permissions to update project settings' }
  }

  if (projectData.editable !== true) {
    return { error: 'Project details are locked for this project' }
  }

  let projectDetails = {}
  try {
    projectDetails = typeof projectData?.project_details === 'string'
      ? JSON.parse(projectData.project_details)
      : (projectData?.project_details || {})
  } catch (e) {
    console.error('Error parsing project_details:', e)
    projectDetails = {}
  }

  const projectDescription = formData.get('project_description')
  const labelsString = formData.get('labels')
  const legalCodesString = formData.get('legal_codes')

  let labels = []
  let legalCodes = []
  let renamedLabels = []
  let renamedLegalCodes = []

  try {
    if (labelsString) {
      const parsedLabels = JSON.parse(labelsString)

      labels = parsedLabels
        .filter(label => label.name?.trim() !== '')
        .map(label => {
          if (label.originalName && label.name !== label.originalName) {
            renamedLabels.push({ oldName: label.originalName, newName: label.name })
          }
          return {
            name: label.name,
            description: label.description,
            severity: label.severity || 'low'
          }
        })
    }

    if (legalCodesString) {
      const parsedCodes = JSON.parse(legalCodesString)
      legalCodes = parsedCodes
        .filter(code => (code.actName?.trim() !== '' || code.codeName?.trim() !== ''))
        .map(code => {
          const generatedName = `${code.actName || ''} - ${code.codeName || ''}`.trim().replace(/^-|-$/g, '').trim()
          if (code.originalName && generatedName !== code.originalName) {
            renamedLegalCodes.push({ oldName: code.originalName, newName: generatedName })
          }
          return {
            actName: code.actName,
            codeName: code.codeName,
            description: code.description,
            name: generatedName,
            severity: code.severity || 'low',
            referenceLink: code.referenceLink || ''
          }
        })
    }
  } catch (e) {
    console.error('Error parsing JSON:', e)
    return { error: 'Invalid data provided' }
  }

  projectDetails.description = projectDescription
  projectDetails.labels = labels
  projectDetails.legal_codes = legalCodes

  const supabase = await createClient()
  const { error } = await runInSpan(
    'configurations.updateLabels.supabase_update',
    async () =>
      supabase
        .from('project')
        .update({ project_details: projectDetails })
        .eq('project_name', ctx.clientDetails.project_name),
    { 'app.span_type': 'supabase_query' }
  )

  if (error) {
    console.error('Error updating project labels:', error)
    return { error: 'Failed to update labels' }
  }

  if (renamedLabels.length > 0 || renamedLegalCodes.length > 0) {
    try {
      await runInSpan(
        'configurations.updateLabels.mongo_cascade',
        async () => {
          const client = await clientPromise
          const db = client.db(ctx.dbName)
          const postsCollection = db.collection('Posts')

          for (const { oldName, newName } of renamedLabels) {
            await postsCollection.updateMany(
              { 'review_details.threat_types': oldName },
              { $set: { 'review_details.threat_types.$': newName } }
            )

            const renameOp = {}
            renameOp[`review_details.flags.${oldName}`] = `review_details.flags.${newName}`
            await postsCollection.updateMany(
              { [`review_details.flags.${oldName}`]: { $exists: true } },
              { $rename: renameOp }
            )
          }

          for (const { oldName, newName } of renamedLegalCodes) {
            await postsCollection.updateMany(
              { 'review_details.legal_codes': oldName },
              { $set: { 'review_details.legal_codes.$': newName } }
            )
          }
        },
        { 'app.span_type': 'mongo_query' }
      )
    } catch (err) {
      console.error('Error cascading label updates to MongoDB:', err)
    }
  }

  revalidatePath('/configurations')

  return { success: true, message: 'Labels updated successfully' }
}
