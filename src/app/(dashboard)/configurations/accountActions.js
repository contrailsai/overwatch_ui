'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getAuthContext } from '@/utils/auth-context'
import { traceAction } from '@/utils/tracing'

export const getConfiguration = traceAction('configurations.getConfiguration', async () => {
  const ctx = await getAuthContext()
  if (!ctx?.user?.id) {
    return { error: 'Not authenticated' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('client_details')
    .select('email, notification_config, permission, organization, alias, created_at')
    .eq('id', ctx.user.id)
    .single()

  if (error) {
    console.error('Error fetching configuration:', error)
    return { error: 'Failed to fetch configuration' }
  }

  return { data }
})

export const updateConfiguration = traceAction('configurations.updateConfiguration', async (prevState, formData) => {
  const ctx = await getAuthContext()
  if (!ctx?.user?.id) {
    return { error: 'Not authenticated' }
  }

  const supabase = await createClient()
  const { data: currentData } = await supabase
    .from('client_details')
    .select('notification_config')
    .eq('id', ctx.user.id)
    .single()

  const currentConfig = currentData?.notification_config || { methods: {} }

  let activeMethod = formData.get('active_method')
  const notificationConfigStr = formData.get('notification_config')

  const methods = currentConfig.methods || {
    email: { receiving_email: '' },
    slack: { slack_token: '', slack_channel: '' },
    telegram: { telegram_token: '', telegram_chat_id: '' }
  }

  if (notificationConfigStr) {
    try {
      const parsedConfig = JSON.parse(notificationConfigStr)
      activeMethod = parsedConfig.active_method

      if (parsedConfig.methods) {
        if (activeMethod === 'email') {
          const receivingEmail = parsedConfig.methods.email?.receiving_email
          if (!receivingEmail || !receivingEmail.includes('@')) {
            return { error: 'Please enter a valid email address' }
          }
          methods.email = { receiving_email: receivingEmail }
        }
        else if (activeMethod === 'slack') {
          const slackToken = parsedConfig.methods.slack?.slack_token
          const slackChannel = parsedConfig.methods.slack?.slack_channel
          if (!slackToken) return { error: 'Slack Bot Token is required' }
          if (!slackChannel) return { error: 'Slack Channel ID is required' }
          methods.slack = { slack_token: slackToken, slack_channel: slackChannel }
        }
        else if (activeMethod === 'telegram') {
          const telegramToken = parsedConfig.methods.telegram?.telegram_token
          const telegramChatId = parsedConfig.methods.telegram?.telegram_chat_id
          if (!telegramToken) return { error: 'Telegram Bot Token is required' }
          if (!telegramChatId) return { error: 'Telegram Chat ID is required' }
          methods.telegram = { telegram_token: telegramToken, telegram_chat_id: telegramChatId }
        }
      }
    } catch (e) {
      console.error('Error parsing notification_config:', e)
      return { error: 'Invalid configuration data' }
    }
  } else {
    if (activeMethod === 'email') {
      const receivingEmail = formData.get('receiving_email')
      if (!receivingEmail || !receivingEmail.includes('@')) {
        return { error: 'Please enter a valid email address' }
      }
      methods.email = { receiving_email: receivingEmail }
    }
    else if (activeMethod === 'slack') {
      const slackToken = formData.get('slack_token')
      const slackChannel = formData.get('slack_channel')

      if (!slackToken) return { error: 'Slack Bot Token is required' }
      if (!slackChannel) return { error: 'Slack Channel ID is required' }

      methods.slack = { slack_token: slackToken, slack_channel: slackChannel }
    }
    else if (activeMethod === 'telegram') {
      const telegramToken = formData.get('telegram_token')
      const telegramChatId = formData.get('telegram_chat_id')

      if (!telegramToken) return { error: 'Telegram Bot Token is required' }
      if (!telegramChatId) return { error: 'Telegram Chat ID is required' }

      methods.telegram = { telegram_token: telegramToken, telegram_chat_id: telegramChatId }
    }
  }

  if (!['email', 'slack', 'telegram'].includes(activeMethod)) {
    return { error: 'Invalid notification method selected' }
  }

  const notificationConfig = {
    active_method: activeMethod,
    methods: methods
  }

  const { error } = await supabase
    .from('client_details')
    .update({ notification_config: notificationConfig })
    .eq('id', ctx.user.id)

  if (error) {
    console.error('Error updating configuration:', error)
    return { error: 'Failed to update configuration' }
  }

  revalidatePath('/configurations')
  return { success: true, message: 'Configuration saved successfully' }
})
