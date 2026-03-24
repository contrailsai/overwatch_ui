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

export function CreateUserModal({ isOpen, onClose, projectName, onSuccess }) {
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
            const result = await create_new_client(email, password, projectName)
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
            <DialogContent className="sm:max-w-[425px]">
                {isSuccess ? (
                    <div className="flex flex-col items-center justify-center py-12 animate-in zoom-in-95 duration-500">
                        <div className="bg-emerald-50 p-4 rounded-full mb-4">
                            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 text-center">User Created!</h3>
                        <p className="text-sm text-slate-500 text-center mt-2 max-w-[280px]">
                            {email} has been successfully added to {projectName}.
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>Create New User</DialogTitle>
                            <DialogDescription>
                                Add a new team member to {projectName}. They will be able to log in with the provided credentials.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">New Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={6}
                                />
                            </div>
                            {error && (
                                <div className="text-sm font-medium text-red-500 bg-red-50 p-2.5 rounded-md border border-red-100">
                                    {error}
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create User
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}
