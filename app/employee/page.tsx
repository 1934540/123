import { Coffee, QrCode } from "lucide-react"
import { requireRole } from "@/app/actions/auth"
import { EmployeeScan } from "@/app/employee/employee-scan"
import { DashboardShell } from "@/components/dashboard-shell"
import { EmptyState } from "@/components/empty-state"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { appDateString, formatAppDateTime } from "@/lib/date"
import { getAdminClient } from "@/lib/supabase/admin"
import type { AttendanceLog, Break, Employee, Hub } from "@/lib/types"

export default async function EmployeePage() {
  const session = await requireRole("employee")
  const supabase = getAdminClient()
  const today = appDateString()

  const { data: employee } = await supabase
    .from("employees")
    .select("*")
    .eq("id", session.employeeId)
    .maybeSingle()

  const currentEmployee = employee as Employee | null

  const [{ data: hub }, { data: todayLog }, { data: recentLogs }] = await Promise.all([
    currentEmployee?.hub_id
      ? supabase.from("hubs").select("*").eq("id", currentEmployee.hub_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("attendance_logs")
      .select("*")
      .eq("employee_id", session.employeeId)
      .eq("date", today)
      .maybeSingle(),
    supabase
      .from("attendance_logs")
      .select("*")
      .eq("employee_id", session.employeeId)
      .order("date", { ascending: false })
      .limit(10),
  ])

  const currentHub = hub as Hub | null
  const log = todayLog as AttendanceLog | null
  const logs = (recentLogs ?? []) as AttendanceLog[]

  const { data: breaks } = log
    ? await supabase.from("breaks").select("*").eq("attendance_log_id", log.id).order("start_time", { ascending: false })
    : { data: [] }
  const breakList = (breaks ?? []) as Break[]
  const activeBreak = breakList.some((item) => !item.end_time)

  return (
    <DashboardShell session={session} title="Қызметкер кабинеті">
      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-primary" />
                QR белгілеу
              </CardTitle>
              <CardDescription>{currentHub?.name ?? "Хаб бекітілмеген"}</CardDescription>
            </CardHeader>
            <CardContent>
              {currentEmployee?.is_active === false ? (
                <EmptyState>Аккаунт өшірілген. Әкімшіге хабарласыңыз.</EmptyState>
              ) : (
                <EmployeeScan hubUid={currentHub?.uid ?? null} activeBreak={activeBreak} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Бүгін</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <InfoRow label="Келді" value={formatAppDateTime(log?.check_in_time)} />
              <InfoRow label="Кетті" value={formatAppDateTime(log?.check_out_time)} />
              <InfoRow label="Ұзақтығы" value={log?.work_duration ?? "—"} />
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Күй</span>
                <Badge variant={statusVariant(log?.status ?? null)}>{log?.status ?? "—"}</Badge>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coffee className="h-4 w-4 text-primary" />
                Үзілістер
              </CardTitle>
            </CardHeader>
            <CardContent>
              {breakList.length === 0 ? (
                <EmptyState>Бүгін үзіліс тіркелмеді.</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Басталды</TableHead>
                      <TableHead>Аяқталды</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakList.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{formatAppDateTime(item.start_time)}</TableCell>
                        <TableCell>{formatAppDateTime(item.end_time)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Соңғы жазбалар</CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <EmptyState>Журнал бос.</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Күні</TableHead>
                      <TableHead>Келді</TableHead>
                      <TableHead>Кетті</TableHead>
                      <TableHead>Ұзақтығы</TableHead>
                      <TableHead>Күй</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.date}</TableCell>
                        <TableCell>{formatAppDateTime(item.check_in_time)}</TableCell>
                        <TableCell>{formatAppDateTime(item.check_out_time)}</TableCell>
                        <TableCell>{item.work_duration ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(item.status)}>{item.status ?? "—"}</Badge>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function statusVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Late" || status === "Early Leave") return "destructive"
  if (status === "Auto-closed") return "outline"
  return status ? "default" : "secondary"
}
