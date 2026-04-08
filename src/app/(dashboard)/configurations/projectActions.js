'use server'

import { createClient } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { revalidatePath } from 'next/cache'

export async function updateLabels(prevState, formData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // 1. Get project name from client_details
  const { data: clientDetails, error: clientError } = await supabase
    .from('client_details')
    .select('project_name')
    .eq('id', user.id)
    .single()

  if (clientError || !clientDetails?.project_name) {
    return { error: 'Project not found' }
  }

  // 2. Fetch current project details to update
  const { data: projectData, error: projectError } = await supabase
    .from('project')
    .select('*')
    .eq('project_name', clientDetails.project_name)
    .single()

  if (projectError) {
    return { error: 'Failed to fetch project details' }
  }

  let projectDetails = {}
  // check if we get project details as string or object
  try {
    projectDetails = typeof projectData?.project_details === 'string'
      ? JSON.parse(projectData.project_details)
      : (projectData?.project_details || {})
  } catch (e) {
    console.error('Error parsing project_details:', e)
    projectDetails = {}
  }

  // 3. Extract inputs from formData
  const projectDescription = formData.get('project_description')
  const labelsString = formData.get('labels') // Grab the JSON string we sent from the frontend
  const legalCodesString = formData.get('legal_codes')

  let labels = []
  let legalCodes = []
  let renamedLabels = []
  let renamedLegalCodes = []

  try {
    if (labelsString) {
      // Parse the JSON string back into an array of objects
      const parsedLabels = JSON.parse(labelsString)

      // Filter out any labels where the name is completely empty and ensure they have a severity
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
    console.error("Error parsing JSON:", e)
    return { error: 'Invalid data provided' }
  }

  // console.log("Parsed labels = ", labels)
  // console.log("Parsed legal codes = ", legalCodes)

  // 4. Update project_details structure
  projectDetails.description = projectDescription
  projectDetails.labels = labels
  projectDetails.legal_codes = legalCodes

  const { error } = await supabase
    .from('project')
    .update({ project_details: projectDetails })
    .eq('project_name', clientDetails.project_name)

  if (error) {
    console.error('Error updating project labels:', error)
    return { error: 'Failed to update labels' }
  }

  // 5. Cascade updates to MongoDB
  if (renamedLabels.length > 0 || renamedLegalCodes.length > 0) {
    try {
      const client = await clientPromise
      // Use mongo_db_map if available, otherwise fallback to project_name
      const dbName = projectData.mongo_db_map
      const db = client.db(dbName)
      const postsCollection = db.collection('Posts')

      for (const { oldName, newName } of renamedLabels) {
        // Update threat_types array
        await postsCollection.updateMany(
          { "review_details.threat_types": oldName },
          { $set: { "review_details.threat_types.$": newName } }
        )

        // Update flags object key
        const renameOp = {}
        renameOp[`review_details.flags.${oldName}`] = `review_details.flags.${newName}`
        await postsCollection.updateMany(
          { [`review_details.flags.${oldName}`]: { $exists: true } },
          { $rename: renameOp }
        )
      }

      for (const { oldName, newName } of renamedLegalCodes) {
        // Update legal_codes array
        await postsCollection.updateMany(
          { "review_details.legal_codes": oldName },
          { $set: { "review_details.legal_codes.$": newName } }
        )
      }
    } catch (err) {
      console.error('Error cascading label updates to MongoDB:', err)
    }
  }

  // Make sure to import revalidatePath at the top of your file!
  // import { revalidatePath } from 'next/cache'
  revalidatePath('/configurations')

  return { success: true, message: 'Labels updated successfully' }
}
