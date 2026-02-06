'use client'

import { useEffect, useState, useActionState } from 'react'
import { getConfiguration, updateConfiguration } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Mail, Slack, MessageCircle } from 'lucide-react'

export default function ConfigurationsPage() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [state, formAction, isPending] = useActionState(updateConfiguration, null)
  const [activeMethod, setActiveMethod] = useState(null)

  useEffect(() => {
    async function fetchConfig() {
      const result = await getConfiguration()
      if (result.data) {
        setConfig(result.data)
        // Set active method from config or default to email
        setActiveMethod(result.data.notification_config?.active_method || 'email')
      } else {
        setActiveMethod('email')
      }
      setLoading(false)
    }
    fetchConfig()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full p-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    )
  }

  // Helper to safely get config values
  const getMethodConfig = (method) => config?.notification_config?.methods?.[method] || {}

  // Default values
  const emailConfig = getMethodConfig('email')
  const initialReceivingEmail = emailConfig.receiving_email || emailConfig.recieving_email || ''

  const slackConfig = getMethodConfig('slack')
  const initialSlackToken = slackConfig.slack_token || ''
  const initialSlackChannel = slackConfig.slack_channel || '' // Support both naming conventions if needed, but action uses slack_channel

  const telegramConfig = getMethodConfig('telegram')
  const initialTelegramToken = telegramConfig.telegram_token || ''
  const initialTelegramChatId = telegramConfig.telegram_chat_id || ''

  return (
    <div className="p-8 max-w-3xl w-full mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Configurations</h1>

      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
          <CardDescription>Your account information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account-email">Account Email</Label>
            <div className="w-full rounded-md text-2xl">
              {config?.email}
            </div>
            <p className="text-xs text-gray-500">This is your registered account email</p>
          </div>
        </CardContent>
      </Card>

      <form action={formAction}>
        <input type="hidden" name="active_method" value={activeMethod || 'email'} />
        <Card>
          <CardHeader>
            <CardTitle>Notification Settings</CardTitle>
            <CardDescription>Configure how you want to receive alerts and notifications.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            <div className="space-y-2">
              <Label htmlFor="active_method_select">Notification Method</Label>
              <Select
                value={activeMethod}
                onValueChange={setActiveMethod}
              >
                <SelectTrigger id="active_method_select">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">
                    <div className="flex items-center">
                      <Mail className="mr-2 h-4 w-4" />
                      Email
                    </div>
                  </SelectItem>
                  <SelectItem value="slack">
                    <div className="flex items-center">
                      <Slack className="mr-2 h-4 w-4" />
                      Slack
                    </div>
                  </SelectItem>
                  <SelectItem value="telegram">
                    <div className="flex items-center">
                      <MessageCircle className="mr-2 h-4 w-4" />
                      Telegram
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {activeMethod === 'email' && (
              <div className="space-y-2">
                <Label htmlFor="receiving_email">Receiving Email Address</Label>
                <Input
                  id="receiving_email"
                  name="receiving_email"
                  type="email"
                  defaultValue={initialReceivingEmail}
                  placeholder="Enter email for notifications"
                  required
                  className="text-white"
                />
                <p className="text-xs text-gray-500">The email address where notifications will be sent.</p>
              </div>
            )}

            {activeMethod === 'slack' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="slack_token">Slack Bot Token</Label>
                  <Input
                    id="slack_token"
                    name="slack_token"
                    type="password"
                    defaultValue={initialSlackToken}
                    placeholder="xoxb-..."
                    required
                  />
                  <p className="text-xs text-gray-500">Your Slack App Bot User OAuth Token.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slack_channel">Slack Channel ID</Label>
                  <Input
                    id="slack_channel"
                    name="slack_channel"
                    type="text"
                    defaultValue={initialSlackChannel}
                    placeholder="C0123456789"
                    required
                  />
                  <p className="text-xs text-gray-500">The ID of the channel to post alerts to.</p>
                </div>
              </div>
            )}

            {activeMethod === 'telegram' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="telegram_token">Telegram Bot Token</Label>
                  <Input
                    id="telegram_token"
                    name="telegram_token"
                    type="password"
                    defaultValue={initialTelegramToken}
                    placeholder="123456:ABC-..."
                    required
                  />
                  <p className="text-xs text-gray-500">The token you received from @BotFather.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telegram_chat_id">Telegram Chat ID</Label>
                  <Input
                    id="telegram_chat_id"
                    name="telegram_chat_id"
                    type="text"
                    defaultValue={initialTelegramChatId}
                    placeholder="123456789"
                    required
                  />
                  <p className="text-xs text-gray-500">The unique identifier for the target chat or username of the channel.</p>
                </div>
              </div>
            )}

            {state?.error && (
              <div className="text-sm text-red-500 bg-red-50 p-2 rounded">
                {state.error}
              </div>
            )}

            {state?.success && (
              <div className="text-sm text-green-500 bg-green-50 p-2 rounded">
                {state.message}
              </div>
            )}

          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}
