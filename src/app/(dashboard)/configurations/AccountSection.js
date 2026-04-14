'use client'

import { useState, useActionState } from 'react'
import { updateConfiguration } from './accountActions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Loader2, Mail, Slack, MessageCircle, Settings, Bell, CheckCircle2, AlertCircle, Building2, User, Shield } from 'lucide-react'
import { format } from 'date-fns'

export default function AccountSection({ clientDetails }) {
    const [state, formAction, isPending] = useActionState(updateConfiguration, null)

    const [notificationConfig, setNotificationConfig] = useState(() => {
        const initial = clientDetails?.notification_config || {}
        return {
            active_method: initial.active_method || 'email',
            methods: {
                email: {
                    receiving_email: initial.methods?.email?.receiving_email || initial.methods?.email?.recieving_email || clientDetails?.email || ''
                },
                slack: {
                    slack_token: initial.methods?.slack?.slack_token || '',
                    slack_channel: initial.methods?.slack?.slack_channel || ''
                },
                telegram: {
                    telegram_token: initial.methods?.telegram?.telegram_token || '',
                    telegram_chat_id: initial.methods?.telegram?.telegram_chat_id || ''
                },
                ...initial.methods
            }
        }
    })

    const handleMethodChange = (method) => {
        setNotificationConfig(prev => ({ ...prev, active_method: method }))
    }

    const handleConfigChange = (method, field, value) => {
        setNotificationConfig(prev => ({
            ...prev,
            methods: {
                ...prev.methods,
                [method]: {
                    ...prev.methods?.[method],
                    [field]: value
                }
            }
        }))
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <section className="space-y-4 w-full">
                <div className="flex items-center gap-2 px-1">
                    <Settings className="w-4 h-4 text-slate-400" />
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Account Details</h2>
                </div>
                <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden p-0">
                    <CardContent className="p-4 md:p-6">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="space-y-1">
                                <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Registered Email</Label>
                                <div className="text-lg font-bold text-slate-900">{clientDetails?.email || 'N/A'}</div>
                                <p className="text-sm text-slate-500">Member since {clientDetails?.created_at ? format(new Date(clientDetails.created_at), 'MMMM d, yyyy') : 'N/A'}</p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 px-3 py-1 flex items-center gap-1.5">
                                    <Shield className="w-3.5 h-3.5" />
                                    {clientDetails?.permission === 'client' ? 'Analyst' : 
                                     clientDetails?.permission === 'client-admin' ? 'Admin' : 
                                     clientDetails?.permission === 'reviewer' ? 'Reviewer' : 'Client Access'}
                                </Badge>
                            </div>
                        </div>

                        <Separator className="bg-slate-100" />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                            <div className="space-y-1">
                                <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Building2 className="w-3.5 h-3.5" />
                                    Organization
                                </Label>
                                <div className="text-base font-medium text-slate-800">
                                    {clientDetails?.organization || 'Not set'}
                                </div>
                            </div>
                            
                            {clientDetails?.alias && (
                                <div className="space-y-1">
                                    <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <User className="w-3.5 h-3.5" />
                                        Alias
                                    </Label>
                                    <div className="text-base font-medium text-slate-800">
                                        {clientDetails.alias}
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </section>

            <section className="space-y-4 w-full max-w-3xl">
                <div className="flex items-center gap-2 px-1">
                    <Bell className="w-4 h-4 text-slate-400" />
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Notification Setup</h2>
                </div>

                <form action={formAction}>
                    {/* Hidden input to send the fully constructed JSON to the server action */}
                    <input type="hidden" name="notification_config" value={JSON.stringify(notificationConfig)} />

                    <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden p-0">
                        <CardHeader className="bg-slate-50/50 border-b border-slate-100 pt-6 px-4 pb-4 md:pt-10 md:px-6 md:pb-6">
                            <CardTitle className="text-lg font-bold text-slate-800">Alert Workflow</CardTitle>
                            <CardDescription className="text-slate-500">
                                Configure where to receive high-threat alerts and takedown requests.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="p-4 md:p-6 space-y-8">
                            <div className="space-y-3">
                                <Label className="text-sm font-bold text-slate-700">Primary Delivery Method</Label>
                                <Select
                                    value={notificationConfig.active_method}
                                    onValueChange={handleMethodChange}
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

                            <div className="space-y-6 min-h-[60px]">
                                {notificationConfig.active_method === 'email' && (
                                    <div className="space-y-3 animate-in fade-in duration-300">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="receiving_email" className="text-sm font-bold text-slate-700">Recipient Email</Label>
                                            <Input
                                                id="receiving_email"
                                                type="email"
                                                value={notificationConfig.methods.email.receiving_email}
                                                onChange={(e) => handleConfigChange('email', 'receiving_email', e.target.value)}
                                                placeholder="alerts@yourcompany.com"
                                                required
                                                className="bg-white border-slate-200 h-11"
                                            />
                                        </div>
                                    </div>
                                )}

                                {notificationConfig.active_method === 'slack' && (
                                    <div className="space-y-5 animate-in fade-in duration-300">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="slack_token" className="text-sm font-bold text-slate-700">Bot OAuth Token</Label>
                                            <Input
                                                id="slack_token"
                                                type="password"
                                                value={notificationConfig.methods.slack.slack_token}
                                                onChange={(e) => handleConfigChange('slack', 'slack_token', e.target.value)}
                                                placeholder="xoxb-..."
                                                required
                                                className="bg-white border-slate-200 h-11"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="slack_channel" className="text-sm font-bold text-slate-700">Channel ID</Label>
                                            <Input
                                                id="slack_channel"
                                                type="text"
                                                value={notificationConfig.methods.slack.slack_channel}
                                                onChange={(e) => handleConfigChange('slack', 'slack_channel', e.target.value)}
                                                placeholder="C0123456789"
                                                required
                                                className="bg-white border-slate-200 h-11"
                                            />
                                        </div>
                                    </div>
                                )}

                                {notificationConfig.active_method === 'telegram' && (
                                    <div className="space-y-5 animate-in fade-in duration-300">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="telegram_token" className="text-sm font-bold text-slate-700">Bot Token</Label>
                                            <Input
                                                id="telegram_token"
                                                type="password"
                                                value={notificationConfig.methods.telegram.telegram_token}
                                                onChange={(e) => handleConfigChange('telegram', 'telegram_token', e.target.value)}
                                                placeholder="123456:ABC-..."
                                                required
                                                className="bg-white border-slate-200 h-11"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="telegram_chat_id" className="text-sm font-bold text-slate-700">Chat ID</Label>
                                            <Input
                                                id="telegram_chat_id"
                                                type="text"
                                                value={notificationConfig.methods.telegram.telegram_chat_id}
                                                onChange={(e) => handleConfigChange('telegram', 'telegram_chat_id', e.target.value)}
                                                placeholder="123456789"
                                                required
                                                className="bg-white border-slate-200 h-11"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

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

                        <CardFooter className="bg-slate-50/50 border-t border-slate-100 p-4 md:p-6 flex justify-end">
                            <Button
                                type="submit"
                                disabled={isPending}
                                className="cursor-pointer w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 h-12 md:h-11 shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                            >
                                {isPending ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                                ) : 'Save Notification Settings'}
                            </Button>
                        </CardFooter>
                    </Card>
                </form>
            </section>
        </div>
    )
}
