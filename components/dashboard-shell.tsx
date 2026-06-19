import Link from "next/link"
import { LogOut } from "lucide-react"
import { logoutAction } from "@/app/actions/auth"
import { Brand } from "@/components/brand"
import { Button } from "@/components/ui/button"
import type { SessionData } from "@/lib/types"

export function DashboardShell({
  session,
  title,
  children,
}: {
  session: SessionData
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/">
            <Brand />
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <div className="truncate text-sm font-medium">{session.name}</div>
              <div className="text-xs text-muted-foreground">{roleLabel(session.role)}</div>
            </div>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                <LogOut className="h-4 w-4" />
                Шығу
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        {children}
      </main>
    </div>
  )
}

function roleLabel(role: SessionData["role"]): string {
  if (role === "super_admin") return "Бас әкімші"
  if (role === "hub_admin") return "Хаб директоры"
  return "Қызметкер"
}
