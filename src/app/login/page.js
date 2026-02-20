'use client'

import { useActionState } from 'react'
import { login } from './actions'
import { Loader2, ShieldCheck, Lock } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

const initialState = {
  error: null,
}

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, initialState)

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 relative overflow-hidden">
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 opacity-50 pointer-events-none" />
      <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-blue-50 blur-3xl opacity-40 pointer-events-none" />
      <div className="absolute -bottom-[20%] -left-[10%] w-[500px] h-[500px] rounded-full bg-indigo-50 blur-3xl opacity-40 pointer-events-none" />

      <div className="w-full max-w-md p-6 relative z-10">

        {/* Brand Header */}
        <div className="flex flex-col items-center space-y-3 mb-8 text-center">
          <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 ring-1 ring-slate-50">
            <ShieldCheck className="w-8 h-8 text-blue-600" strokeWidth={2} />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 font-sans">Overwatch</h1>
            <p className="text-base text-slate-500 font-medium">Threat Detection Intelligence</p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="border-slate-200/60 shadow-xl shadow-slate-200/50 backdrop-blur-sm bg-white/80">
          <CardHeader className="space-y-1 pb-6 text-center">
            <CardTitle className="text-xl font-semibold text-slate-800">Welcome back</CardTitle>
            <CardDescription className="text-slate-500 text-base">
              Please sign in to your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700 font-medium">Email Address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  className="h-11 bg-white border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 transition-all font-normal text-base shadow-sm"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-slate-700 font-medium">Password</Label>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  className="h-11 bg-white border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 transition-all font-normal text-base shadow-sm tracking-widest"
                />
              </div>

              {state?.error && (
                <div className="p-3 text-sm font-medium text-red-600 bg-red-50 rounded-lg border border-red-100 flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />
                  {state.error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11 mt-2 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 transition-all font-medium text-base rounded-lg"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center pb-6">
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              Secured by Contrails AI
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
