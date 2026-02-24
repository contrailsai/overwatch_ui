'use client'

import { useEffect, useState, useActionState } from 'react'
import { getConfiguration, updateConfiguration } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Loader2, Mail, Slack, MessageCircle, Settings, Bell, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

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
      <div className="flex items-center justify-center h-full w-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-slate-500">Loading your settings...</p>
        </div>
      </div>
    )
  }

  const getMethodConfig = (method) => config?.notification_config?.methods?.[method] || {}
  const emailConfig = getMethodConfig('email')
  const initialReceivingEmail = emailConfig.receiving_email || emailConfig.recieving_email || ''
  const slackConfig = getMethodConfig('slack')
  const initialSlackToken = slackConfig.slack_token || ''
  const initialSlackChannel = slackConfig.slack_channel || ''
  const telegramConfig = getMethodConfig('telegram')
  const initialTelegramToken = telegramConfig.telegram_token || ''
  const initialTelegramChatId = telegramConfig.telegram_chat_id || ''

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-5 px-8 shrink-0 flex justify-between items-center z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System Configuration</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your notification workflows and account preferences</p>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto space-y-8 pb-12">
          
          {/* Section 1: Account */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Settings className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Account</h2>
            </div>
            <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Registered Email</Label>
                    <div className="text-lg font-bold text-slate-900">{config?.email}</div>
                  </div>
                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 px-3 py-1">
                    Active Account
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Section 2: Notifications */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Bell className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Notifications</h2>
            </div>
            
            <form action={formAction}>
              <input type="hidden" name="active_method" value={activeMethod || 'email'} />
              <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-6">
                  <CardTitle className="text-lg font-bold text-slate-800">Alert Workflow</CardTitle>
                  <CardDescription className="text-slate-500">
                    Configure where to receive high-threat alerts and takedown requests.
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="p-6 space-y-8">
                  {/* Method Selection */}
                  <div className="space-y-3">
                    <Label className="text-sm font-bold text-slate-700">Primary Delivery Method</Label>
                    <Select
                      value={activeMethod}
                      onValueChange={setActiveMethod}
                    >
                      <SelectTrigger className="w-full bg-white border-slate-200 h-11 focus:ring-blue-500/20">
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email" className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
                              <Mail className="h-4 w-4" />
                            </div>
                            <span className="font-semibold">Email Correspondence</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="slack" className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 bg-purple-50 text-purple-600 rounded-md">
                              <Slack className="h-4 w-4" />
                            </div>
                            <span className="font-semibold">Slack Webhook</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="telegram" className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 bg-sky-50 text-sky-600 rounded-md">
                              <MessageCircle className="h-4 w-4" />
                            </div>
                            <span className="font-semibold">Telegram Bot</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator className="bg-slate-100" />

                  {/* Contextual Config Fields */}
                  <div className="space-y-6 min-h-[160px] animate-in fade-in slide-in-from-top-2 duration-300">
                    {activeMethod === 'email' && (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="receiving_email" className="text-sm font-bold text-slate-700">Recipient Email</Label>
                          <Input
                            id="receiving_email"
                            name="receiving_email"
                            type="email"
                            defaultValue={initialReceivingEmail}
                            placeholder="alerts@yourcompany.com"
                            required
                            className="bg-white border-slate-200 h-11"
                          />
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          All high-risk case reports and takedown requests will be sent to this address.
                        </p>
                      </div>
                    )}

                    {activeMethod === 'slack' && (
                      <div className="space-y-5">
                        <div className="space-y-1.5">
                          <Label htmlFor="slack_token" className="text-sm font-bold text-slate-700">Bot OAuth Token</Label>
                          <Input
                            id="slack_token"
                            name="slack_token"
                            type="password"
                            defaultValue={initialSlackToken}
                            placeholder="xoxb-..."
                            required
                            className="bg-white border-slate-200 h-11"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="slack_channel" className="text-sm font-bold text-slate-700">Channel ID</Label>
                          <Input
                            id="slack_channel"
                            name="slack_channel"
                            type="text"
                            defaultValue={initialSlackChannel}
                            placeholder="C0123456789"
                            required
                            className="bg-white border-slate-200 h-11"
                          />
                        </div>
                      </div>
                    )}

                    {activeMethod === 'telegram' && (
                      <div className="space-y-5">
                        <div className="space-y-1.5">
                          <Label htmlFor="telegram_token" className="text-sm font-bold text-slate-700">Bot Token</Label>
                          <Input
                            id="telegram_token"
                            name="telegram_token"
                            type="password"
                            defaultValue={initialTelegramToken}
                            placeholder="123456:ABC-..."
                            required
                            className="bg-white border-slate-200 h-11"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="telegram_chat_id" className="text-sm font-bold text-slate-700">Chat ID</Label>
                          <Input
                            id="telegram_chat_id"
                            name="telegram_chat_id"
                            type="text"
                            defaultValue={initialTelegramChatId}
                            placeholder="123456789"
                            required
                            className="bg-white border-slate-200 h-11"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Feedback Messages */}
                  {state?.error && (
                    <div className="flex items-center gap-3 p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 animate-in zoom-in-95 duration-200">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <p className="text-sm font-bold">{state.error}</p>
                    </div>
                  )}

                  {state?.success && (
                    <div className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 animate-in zoom-in-95 duration-200">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      <p className="text-sm font-bold">{state.message}</p>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="bg-slate-50/50 border-t border-slate-100 p-6 flex justify-end">
                  <Button 
                    type="submit" 
                    disabled={isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 h-11 shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving Configuration...
                      </>
                    ) : (
                      'Save Notification Settings'
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </section>
        </div>
      </div>
    </main>
  )
}
