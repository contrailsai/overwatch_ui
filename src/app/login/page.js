'use client'

import { useActionState } from 'react'
import { login } from './actions'
import { Loader2, ShieldCheck } from 'lucide-react'
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
    <div className="min-h-screen flex justify-center bg-slate-50/50 p-4">
      <div className="w-full max-w-sm space-y-6 mt-30">

        {/* Brand Header */}
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/20">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Overwatch</h1>
            <p className="text-sm text-slate-500">Threat Detection Intelligence</p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="border-slate-200 shadow-xl shadow-slate-200/40">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>
              Enter your credentials to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  className="h-11 bg-slate-50/50 border-slate-200 focus:bg-white focus-visible:ring-slate-200 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="********"
                  required
                  className="h-11 bg-slate-50/50 border-slate-200 focus:bg-white focus-visible:ring-slate-200 transition-colors"
                />
              </div>

              {state?.error && (
                <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md border border-red-100 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  {state.error}
                </div>
              )}

              <Button
                type="submit"
                className=" cursor-pointer mt-10 w-full h-11 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 transition-all hover:shadow-blue-600/40"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
