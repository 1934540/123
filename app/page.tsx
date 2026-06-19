import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowRight, MapPin, QrCode, ScanLine, ShieldCheck, Users, Building2 } from "lucide-react"
import { Brand } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/session"

export default async function HomePage() {
  const session = await getSession()
  if (session) {
    if (session.role === "super_admin") redirect("/owner")
    if (session.role === "hub_admin") redirect("/admin")
    redirect("/employee")
  }

  const features = [
    {
      icon: ScanLine,
      title: "QR сканерлеу",
      desc: "Қызметкер хабтың QR кодын сканерлеп, бір қозғалыста келу немесе кету уақытын белгілейді.",
    },
    {
      icon: MapPin,
      title: "Геозона тексеруі",
      desc: "GPS координаттары арқылы қызметкердің хаб аумағында екенін автоматты түрде тексереді.",
    },
    {
      icon: Users,
      title: "Үш рөл",
      desc: "Қызметкер кабинеті, хаб директоры панелі және бас әкімшінің басқару орталығы.",
    },
    {
      icon: ShieldCheck,
      title: "Сенімді есеп",
      desc: "Әр келу-кету уақыты сервер жағында тексеріліп, өзгертуге болмайтын журналға жазылады.",
    },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Brand />
          <Button asChild>
            <Link href="/login">
              Кіру
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              <QrCode className="h-3.5 w-3.5 text-primary" />
              Коворкинг-хабтарға арналған есеп жүйесі
            </div>
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              QR және геозона арқылы{" "}
              <span className="text-primary">келу-кету есебі</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
              KzoHubQR — қызметкерлердің жұмыс уақытын дәл әрі алаяқтыққа жол бермей есептейтін жүйе.
              Бір QR сканерлеу жеткілікті, орналасуды жүйе өзі тексереді.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/login">
                  Жүйеге кіру
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-2xl border border-border bg-card p-6 sm:p-8">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Building2 className="h-4 w-4 text-primary" />
              Демо аккаунттар
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <DemoAccount role="Бас әкімші" login="owner" pass="owner123" />
              <DemoAccount role="Хаб директоры" login="astana_admin" pass="admin123" />
              <DemoAccount role="Қызметкер" login="aibek" pass="emp123" />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
          KzoHubQR — QR негізіндегі қатысу есебі.
        </div>
      </footer>
    </div>
  )
}

function DemoAccount({ role, login, pass }: { role: string; login: string; pass: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="text-xs text-muted-foreground">{role}</div>
      <div className="mt-1 font-mono text-sm">{login}</div>
      <div className="font-mono text-xs text-muted-foreground">{pass}</div>
    </div>
  )
}
