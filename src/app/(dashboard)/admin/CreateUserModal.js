"use client"

import React, { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { create_new_client } from './actions'
import { Loader2, CheckCircle2 } from 'lucide-react'

export function CreateUserModal({ isOpen, onClose, projectDisplayName, onSuccess }) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [isSuccess, setIsSuccess] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const result = await create_new_client(email, password)
            if (result.error) {
                setError(result.error)
            } else {
                setIsSuccess(true)
                onSuccess()
                setTimeout(() => {
                    handleClose()
                    setIsSuccess(false)
                }, 1500)
            }
        } catch (err) {
            setError("An unexpected error occurred.")
        } finally {
            setLoading(false)
        }
    }

    const handleClose = () => {
        setEmail('')
        setPassword('')
        setError(null)
        onClose()
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden bg-white shadow-2xl border-slate-100 rounded-2xl">
                {isSuccess ? (
                    <div className="flex flex-col items-center justify-center py-16 animate-in zoom-in-95 duration-500">
                        <div className="bg-emerald-50 p-4 rounded-full mb-5 shadow-inner">
                            <CheckCircle2 className="w-14 h-14 text-emerald-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 text-center tracking-tight">User Created!</h3>
                        <p className="text-sm text-slate-500 text-center mt-3 max-w-[280px] leading-relaxed">
                            <span className="font-medium text-slate-700">{email}</span> has been successfully added to {projectDisplayName}.
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col h-full">
                        <div className="px-6 py-6 pb-0">
                            <DialogHeader>
                                <DialogTitle className="text-xl font-bold text-slate-900">Create New User</DialogTitle>
                                <DialogDescription className="text-slate-500 mt-1.5 leading-relaxed">
                                    Add a new team member to <span className="font-medium text-slate-700">{projectDisplayName}</span>. They will be able to log in with the provided credentials.
                                </DialogDescription>
                            </DialogHeader>
                        </div>
                        <div className="p-6 grid gap-5">
                            <div className="space-y-2.5">
                                <Label htmlFor="email" className="text-sm font-semibold text-slate-700">Email address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all duration-200"
                                />
                            </div>
                            <div className="space-y-2.5">
                                <Label htmlFor="password" className="text-sm font-semibold text-slate-700">New Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    className="bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all duration-200"
                                />
                            </div>
                            {error && (
                                <div className="text-sm font-medium text-red-600 bg-red-50/80 p-3 rounded-lg border border-red-100 flex items-start gap-2">
                                    <div className="mt-0.5">•</div>
                                    <div className="flex-1">{error}</div>
                                </div>
                            )}
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 mt-auto">
                            <Button type="button" variant="outline" onClick={handleClose} disabled={loading} className="bg-white hover:bg-slate-50 text-slate-600 border-slate-200">
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all duration-200">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create User
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}
