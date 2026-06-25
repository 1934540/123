import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Building2, UserCheck, Users } from "lucide-react"
import { requireRole } from "@/app/actions/auth"
import { DashboardShell } from "@/components/dashboard-shell"
import { EmptyState } from "@/components/empty-state"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatAppDateTime } from "@/lib/date"
import { getAdminClient } from "@/lib/supabase/admin"
import type { AttendanceLog, Employee, Hub } from "@/lib/types"

type HubDirector = {
  id: string
  username: string
  display_name: string | null
  hub_id: string | null
  position: string | null
}

export default async function OwnerHubPage({
  params,
}: {
  params: Promise<{ hubId: string }>
}) {
  const session = await requireRole("super_admin")
  const { hubId } = await params
  const supabase = getAdminClient()

  const [{ data: hub }, { data: directors }, { data: employees }, { data: logs }] = await Promise.all([
    supabase.from("hubs").select("*").eq("id", hubId).maybeSingle(),
    supabase
      .from("users")
      .select("id, username, display_name, hub_id, position")
      .eq("role", "hub_admin")
      .eq("hub_id", hubId)
      .order("username"),
    supabase.from("employees").select("*").eq("hub_id", hubId).order("created_at", { ascending: false }),
    supabase
      .from("attendance_logs")
      .select("*")
      .eq("hub_id", hubId)
      .order("date", { ascending: false })
      .order("check_in_time", { ascending: false })
      .limit(50),
  ])

  if (!hub) notFound()

  const currentHub = hub as Hub
  const directorList = (directors ?? []) as HubDirector[]
  const employeeList = (employees ?? []) as Employee[]
  const logList = (logs ?? []) as AttendanceLog[]

  return (
    <DashboardShell session={session} title={`Проверка хаба: ${currentHub.name}`}>
      <div className="mb-4">
        <Link className={buttonVariants({ variant: "outline", size: "sm" })} href="/owner">
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Директора" value={directorList.length} icon={UserCheck} />
        <StatCard label="Сотрудники" value={employeeList.length} icon={Users} />
        <StatCard label="Активные" value={employeeList.filter((employee) => employee.is_active).length} icon={Users} />
        <StatCard label="Записи" value={logList.length} icon={Building2} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[360px_1fr]">
        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Региональные директора</CardTitle>
              <CardDescription>Аккаунты, закрепленные за этим хабом.</CardDescription>
            </CardHeader>
            <CardContent>
              {directorList.length === 0 ? (
                <EmptyState>Директор еще не назначен.</EmptyState>
              ) : (
                <div className="space-y-2">
                  {directorList.map((director) => (
                    <div key={director.id} className="rounded-lg border border-border bg-background/40 p-3">
                      <div className="font-medium">{director.display_name ?? director.username}</div>
                      <div className="text-sm text-muted-foreground">{director.position ?? "Директор"}</div>
                      <div className="font-mono text-xs text-muted-foreground">{director.username}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Геозона</CardTitle>
              <CardDescription>Настраивается директором в кабинете `/admin`.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <InfoRow label="Статус" value={currentHub.geofence_enabled ? "Включена" : "Выключена"} />
              <InfoRow label="Latitude" value={currentHub.latitude?.toString() ?? "Не задано"} />
              <InfoRow label="Longitude" value={currentHub.longitude?.toString() ?? "Не задано"} />
              <InfoRow label="Радиус" value={`${currentHub.geofence_radius} м`} />
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Сотрудники директора</CardTitle>
              <CardDescription>Список сотрудников выбранного хаба.</CardDescription>
            </CardHeader>
            <CardContent>
              {employeeList.length === 0 ? (
                <EmptyState>Сотрудников пока нет.</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Имя</TableHead>
                      <TableHead>Логин</TableHead>
                      <TableHead>Отдел</TableHead>
                      <TableHead>Устройство</TableHead>
                      <TableHead>Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employeeList.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell className="font-medium">{employee.name}</TableCell>
                        <TableCell>{employee.username ?? "—"}</TableCell>
                        <TableCell>{employee.department ?? employee.organization ?? "—"}</TableCell>
                        <TableCell className="max-w-40 truncate font-mono text-xs">
                          {employee.device_id ?? "Не привязано"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={employee.is_active ? "default" : "secondary"}>
                            {employee.is_active ? "Активен" : "Отключен"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Последние отметки</CardTitle>
              <CardDescription>Последние 50 записей сотрудников этого хаба.</CardDescription>
            </CardHeader>
            <CardContent>
              {logList.length === 0 ? (
                <EmptyState>Отметок пока нет.</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Сотрудник</TableHead>
                      <TableHead>Приход</TableHead>
                      <TableHead>Уход</TableHead>
                      <TableHead>Длительность</TableHead>
                      <TableHead>Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logList.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{log.date}</TableCell>
                        <TableCell>{employeeList.find((employee) => employee.id === log.employee_id)?.name ?? "—"}</TableCell>
                        <TableCell>{formatAppDateTime(log.check_in_time)}</TableCell>
                        <TableCell>{formatAppDateTime(log.check_out_time)}</TableCell>
                        <TableCell>{log.work_duration ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(log.status)}>{log.status ?? "—"}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </DashboardShell>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: typeof Users
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          {label}
        </CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

function statusVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Late" || status === "Early Leave") return "destructive"
  if (status === "Auto-closed" || status === "Закрыто автоматически") return "outline"
  if (status === "В пределах 10 минут") return "secondary"
  return status ? "default" : "secondary"
}
