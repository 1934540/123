import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Brand } from "@/components/brand"
import { LoginForm } from "@/components/login-form"
import { getSession } from "@/lib/session"

export default async function LoginPage() {
  const session = await getSession()
  if (session) {
    if (session.role === "super_admin") redirect("/owner")
    if (session.role === "hub_admin") redirect("/admin")
    redirect("/employee")
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/">
            <Brand />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Басты бет
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight">Жүйеге кіру</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Логин мен құпиясөзіңізді енгізіңіз.
            </p>
            <div className="mt-6">
              <LoginForm />
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Демо: owner / astana_admin / aibek
          </p>
        </div>
      </main>
    </div>
  )
}
