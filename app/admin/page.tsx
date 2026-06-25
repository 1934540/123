import type React from "react"
import { AlertTriangle, Download, MapPin, Power, Trash2, Upload, UserPlus } from "lucide-react"
import {
  addEmployeeAction,
  deleteEmployeeAction,
  excuseLogAction,
  importEmployeesAction,
  reviewRemoteWorkRequestAction,
  toggleEmployeeAction,
  updateEmployeeAction,
  updateGeofenceAction,
} from "@/app/actions/admin"
import { DirectorAttendanceButton } from "@/app/admin/director-attendance-button"
import { requireRole } from "@/app/actions/auth"
import { DashboardShell } from "@/components/dashboard-shell"
import { EmptyState } from "@/components/empty-state"
import { GeofenceMapField } from "@/components/geofence-map-field"
import { PresenceMap } from "@/components/presence-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmSubmitButton } from "@/components/confirm-submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { appDateString, formatAppDateTime } from "@/lib/date"
import { currentMonth } from "@/lib/excel-report"
import { getAdminClient } from "@/lib/supabase/admin"
import type { AttendanceLog, DirectorAttendanceLog, Employee, EmployeeLocationPoint, GeofenceEvent, Hub, RemoteWorkRequest } from "@/lib/types"

const LOCATION_POINT_MAX_AGE_MS = 35 * 60 * 1000

export default async function AdminPage() {
  const session = await requireRole("hub_admin", "super_admin")
  const supabase = getAdminClient()
  const today = appDateString()
  const reportMonth = currentMonth()

  let hubId = session.hubId
  if (!hubId && session.role === "super_admin") {
    const { data: firstHub } = await supabase.from("hubs").select("id").order("created_at").limit(1).maybeSingle()
    hubId = firstHub?.id ?? null
  }

  if (!hubId) {
    return (
      <DashboardShell session={session} title="Хаб директоры панелі">
        <EmptyState>Алдымен бас әкімші панелінде хаб құрыңыз.</EmptyState>
      </DashboardShell>
    )
  }

  const [
    { data: hub },
    { data: employees },
    { data: logs },
    { data: directorLog },
    { data: geofenceEvents },
    { data: locationPoints },
    { data: remoteWorkRequests },
  ] =
    await Promise.all([
    supabase.from("hubs").select("*").eq("id", hubId).maybeSingle(),
    supabase.from("employees").select("*").eq("hub_id", hubId).order("created_at", { ascending: false }),
    supabase
      .from("attendance_logs")
      .select("*")
      .eq("hub_id", hubId)
      .order("date", { ascending: false })
      .order("check_in_time", { ascending: false })
      .limit(30),
    session.role === "hub_admin"
      ? supabase
          .from("director_attendance_logs")
          .select("*")
          .eq("user_id", session.userId)
          .eq("date", today)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("geofence_events")
      .select("*")
      .eq("hub_id", hubId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("employee_location_points")
      .select("*")
      .eq("hub_id", hubId)
      .order("recorded_at", { ascending: false })
      .limit(500),
    supabase
      .from("remote_work_requests")
      .select("*")
      .eq("hub_id", hubId)
      .order("requested_at", { ascending: false })
      .limit(20),
  ])

  const currentHub = hub as Hub | null
  const employeeList = (employees ?? []) as Employee[]
  const logList = (logs ?? []) as AttendanceLog[]
  const todayDirectorLog = directorLog as DirectorAttendanceLog | null
  const eventList = (geofenceEvents ?? []) as GeofenceEvent[]
  const pointList = (locationPoints ?? []) as EmployeeLocationPoint[]
  const remoteWorkRequestList = (remoteWorkRequests ?? []) as RemoteWorkRequest[]
  const pendingRemoteWorkRequests = remoteWorkRequestList.filter((request) => request.status === "pending")
  const nowMs = Date.now()
  const latestPointByEmployee = new Map<string, EmployeeLocationPoint>()
  for (const point of pointList) {
    if (!latestPointByEmployee.has(point.employee_id)) latestPointByEmployee.set(point.employee_id, point)
  }
  const mapEmployees = employeeList
    .map((employee) => {
      const point = latestPointByEmployee.get(employee.id)
      if (!point) return null
      const isFresh = nowMs - new Date(point.recorded_at).getTime() <= LOCATION_POINT_MAX_AGE_MS
      return {
        id: employee.id,
        name: employee.name,
        latitude: point.latitude,
        longitude: point.longitude,
        isFresh,
        ageMinutes: Math.max(0, Math.floor((nowMs - new Date(point.recorded_at).getTime()) / 60000)),
        isInside: isFresh && point.is_inside_geofence,
        distanceMeters: point.distance_meters,
        recordedAt: point.recorded_at,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  return (
    <DashboardShell session={session} title={currentHub?.name ?? "Хаб директоры панелі"}>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Карта присутствия</CardTitle>
              <CardDescription>Последние GPS-точки сотрудников относительно радиуса хаба.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentHub?.latitude == null || currentHub.longitude == null ? (
                <EmptyState>Сначала настройте координаты хаба в геозоне.</EmptyState>
              ) : (
                <PresenceMap
                  hub={{
                    name: currentHub.name,
                    latitude: currentHub.latitude,
                    longitude: currentHub.longitude,
                    radius: currentHub.geofence_radius,
                  }}
                  employees={mapEmployees}
                />
              )}
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <InfoRow label="На территории" value={String(mapEmployees.filter((item) => item.isInside).length)} />
                <InfoRow label="Вне радиуса" value={String(mapEmployees.filter((item) => item.isFresh && !item.isInside).length)} />
                <InfoRow label="Нет GPS" value={String(employeeList.length - mapEmployees.filter((item) => item.isFresh).length)} />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Қызметкерлер" value={employeeList.length} />
            <StatCard label="Белсенді" value={employeeList.filter((employee) => employee.is_active).length} />
            <StatCard label="Соңғы жазбалар" value={logList.length} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Қызметкерлер</CardTitle>
              <CardDescription>Логиндер, құрылғы байланысы және белсенділік.</CardDescription>
            </CardHeader>
            <CardContent>
              {employeeList.length === 0 ? (
                <EmptyState>Бұл хабта қызметкер жоқ.</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Аты</TableHead>
                      <TableHead>Логин</TableHead>
                      <TableHead>Бөлім</TableHead>
                      <TableHead>Құрылғы</TableHead>
                      <TableHead>Күй</TableHead>
                      <TableHead className="text-right">Әрекет</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employeeList.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell className="font-medium">{employee.name}</TableCell>
                        <TableCell>{employee.username ?? "—"}</TableCell>
                        <TableCell>{employee.department ?? employee.organization ?? "—"}</TableCell>
                        <TableCell className="max-w-36 truncate font-mono text-xs">
                          {employee.device_id ?? "байланбаған"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={employee.is_active ? "default" : "secondary"}>
                            {employee.is_active ? "Белсенді" : "Өшірілген"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <form action={formAction(toggleEmployeeAction)}>
                              <input type="hidden" name="hubId" value={hubId} />
                              <input type="hidden" name="employeeId" value={employee.id} />
                              <input type="hidden" name="isActive" value={String(employee.is_active)} />
                              <Button size="sm" variant="outline" type="submit">
                                <Power className="h-4 w-4" />
                                {employee.is_active ? "Отключить" : "Включить"}
                              </Button>
                            </form>
                            <form action={formAction(deleteEmployeeAction)}>
                              <input type="hidden" name="hubId" value={hubId} />
                              <input type="hidden" name="employeeId" value={employee.id} />
                              <ConfirmSubmitButton
                                size="sm"
                                variant="outline"
                                type="submit"
                                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                                message={`Удалить сотрудника ${employee.name}? Это действие нельзя отменить.`}
                              >
                                <Trash2 className="h-4 w-4" />
                                Удалить
                              </ConfirmSubmitButton>
                            </form>
                          </div>
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
              <CardTitle>Редактировать сотрудников</CardTitle>
              <CardDescription>Имя, должность, логин и новый пароль сотрудников вашего хаба.</CardDescription>
            </CardHeader>
            <CardContent>
              {employeeList.length === 0 ? (
                <EmptyState>Сотрудников пока нет.</EmptyState>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {employeeList.map((employee) => (
                    <form
                      key={employee.id}
                      action={formAction(updateEmployeeAction)}
                      className="rounded-lg border border-border bg-background/40 p-3"
                    >
                      <input type="hidden" name="hubId" value={hubId} />
                      <input type="hidden" name="employeeId" value={employee.id} />
                      <div className="grid gap-3">
                        <Field label="Имя" name="name" defaultValue={employee.name} required />
                        <Field label="Должность" name="department" defaultValue={employee.department ?? ""} />
                        <Field label="Логин" name="username" defaultValue={employee.username ?? ""} required />
                        <Field label="Новый пароль" name="password" type="password" placeholder="Оставьте пустым" />
                        <Button type="submit" variant="outline" className="w-full">
                          Сохранить
                        </Button>
                      </div>
                    </form>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Заявки вне зоны</CardTitle>
              <CardDescription>Сотрудники, которые работают вне радиуса хаба и ждут ручного решения директора.</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingRemoteWorkRequests.length === 0 ? (
                <EmptyState>Ожидающих заявок нет.</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Время</TableHead>
                      <TableHead>Сотрудник</TableHead>
                      <TableHead>Причина</TableHead>
                      <TableHead>Дистанция</TableHead>
                      <TableHead className="text-right">Решение</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRemoteWorkRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>{formatAppDateTime(request.requested_at)}</TableCell>
                        <TableCell>
                          {employeeList.find((employee) => employee.id === request.employee_id)?.name ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-72 whitespace-normal">{request.reason}</TableCell>
                        <TableCell>{request.distance_meters == null ? "—" : `${request.distance_meters} м`}</TableCell>
                        <TableCell>
                          <form action={formAction(reviewRemoteWorkRequestAction)} className="ml-auto grid max-w-80 gap-2">
                            <input type="hidden" name="hubId" value={hubId} />
                            <input type="hidden" name="requestId" value={request.id} />
                            <Input name="directorReason" placeholder="Комментарий директора" />
                            <div className="flex justify-end gap-2">
                              <Button size="sm" type="submit" name="decision" value="approved">
                                Подтвердить
                              </Button>
                              <Button size="sm" type="submit" name="decision" value="rejected" variant="outline">
                                Отклонить
                              </Button>
                            </div>
                          </form>
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
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                GPS-тревоги
              </CardTitle>
              <CardDescription>Последние выходы сотрудников за радиус хаба.</CardDescription>
            </CardHeader>
            <CardContent>
              {eventList.length === 0 ? (
                <EmptyState>Тревог пока нет.</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Время</TableHead>
                      <TableHead>Сотрудник</TableHead>
                      <TableHead>Дистанция</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventList.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>{formatAppDateTime(event.created_at)}</TableCell>
                        <TableCell>
                          {employeeList.find((employee) => employee.id === event.employee_id)?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          {event.distance_meters} м / {event.radius_meters} м
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
              <CardTitle>Келу-кету журналы</CardTitle>
              <CardDescription>Соңғы 30 жазба.</CardDescription>
            </CardHeader>
            <CardContent>
              {logList.length === 0 ? (
                <EmptyState>Журналда жазба жоқ.</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Күні</TableHead>
                      <TableHead>Қызметкер</TableHead>
                      <TableHead>Келді</TableHead>
                      <TableHead>Кетті</TableHead>
                      <TableHead>Ұзақтығы</TableHead>
                      <TableHead>Күй</TableHead>
                      <TableHead className="text-right">Себепті</TableHead>
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
                          <Badge variant={log.is_excused ? "secondary" : statusVariant(log.status)}>
                            {log.is_excused ? "Себепті" : log.status ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {!log.is_excused && (
                            <form action={formAction(excuseLogAction)}>
                              <input type="hidden" name="hubId" value={hubId} />
                              <input type="hidden" name="logId" value={log.id} />
                              <Button size="sm" variant="outline" type="submit">
                                Белгілеу
                              </Button>
                            </form>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4">
          {session.role === "hub_admin" && (
            <Card>
              <CardHeader>
                <CardTitle>Моя отметка</CardTitle>
                <CardDescription>Прибытие и отбытие директора хаба за сегодня.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 text-sm">
                  <InfoRow label="Прибытие" value={formatAppDateTime(todayDirectorLog?.check_in_time)} />
                  <InfoRow label="Отбытие" value={formatAppDateTime(todayDirectorLog?.check_out_time)} />
                  <InfoRow label="Длительность" value={todayDirectorLog?.work_duration ?? "—"} />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Статус</span>
                    <Badge variant={statusVariant(todayDirectorLog?.status ?? null)}>
                      {todayDirectorLog?.status ?? "—"}
                    </Badge>
                  </div>
                </div>
                <DirectorAttendanceButton
                  hasCheckedIn={Boolean(todayDirectorLog?.check_in_time)}
                  hasCheckedOut={Boolean(todayDirectorLog?.check_out_time)}
                />
              </CardContent>
            </Card>
          )}

          {session.role === "hub_admin" && (
            <Card>
              <CardHeader>
                <CardTitle>Месячный отчет</CardTitle>
                <CardDescription>Один Excel-файл: отдельная таблица сотрудников и отдельная таблица директора.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action="/admin/reports/monthly" method="get" className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="report-month">Месяц</Label>
                    <Input id="report-month" name="month" type="month" defaultValue={reportMonth} />
                  </div>
                  <Button type="submit" variant="outline" className="w-full">
                    <Download className="h-4 w-4" />
                    Скачать Excel
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Геозона
              </CardTitle>
              <CardDescription>Қызметкер батырманы басқанда GPS осы аймақпен салыстырылады.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={formAction(updateGeofenceAction)} className="space-y-3">
                <input type="hidden" name="hubId" value={hubId} />
                <GeofenceMapField
                  latitude={currentHub?.latitude}
                  longitude={currentHub?.longitude}
                  radius={currentHub?.geofence_radius}
                  enabled={currentHub?.geofence_enabled ?? true}
                />
                <Button type="submit" className="w-full">
                  <MapPin className="h-4 w-4" />
                  Сақтау
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                Қызметкер қосу
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={formAction(addEmployeeAction)} className="space-y-3">
                <input type="hidden" name="hubId" value={hubId} />
                <Field label="Аты" name="name" placeholder="Айбек" required />
                <Field label="Логин" name="username" placeholder="aibek" required />
                <Field label="Құпиясөз" name="password" type="password" required />
                <Field label="Ұйым" name="organization" placeholder="AstanaHub" />
                <Field label="Бөлім" name="department" placeholder="Reception" />
                <Button type="submit" className="w-full">
                  <UserPlus className="h-4 w-4" />
                  Қосу
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                Импорт сотрудников
              </CardTitle>
              <CardDescription>Excel-файл с колонками: name, username, password, organization, department.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={formAction(importEmployeesAction)} className="space-y-3">
                <input type="hidden" name="hubId" value={hubId} />
                <div className="space-y-1.5">
                  <Label htmlFor="employee-import">Excel-файл</Label>
                  <Input id="employee-import" name="file" type="file" accept=".xlsx,.csv,.tsv" required />
                </div>
                <Button type="submit" variant="outline" className="w-full">
                  <Upload className="h-4 w-4" />
                  Импортировать
                </Button>
              </form>
            </CardContent>
          </Card>
        </aside>
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
  if (status === "Auto-closed" || status === "Закрыто автоматически") return "outline"
  if (status === "В пределах 10 минут") return "secondary"
  return "default"
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

function formAction(action: (formData: FormData) => Promise<unknown>) {
  return action as (formData: FormData) => Promise<void>
}

function Field(props: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  const { label, name, ...inputProps } = props
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...inputProps} />
    </div>
  )
}
