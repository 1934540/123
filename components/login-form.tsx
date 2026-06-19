"use client"

import { useActionState } from "react"
import { LogIn, Loader2 } from "lucide-react"
import { loginAction, type LoginState } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {})

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="username">Логин</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          placeholder="aibek"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Құпиясөз</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </div>

      {state.error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        Кіру
      </Button>
    </form>
  )
}
