import { getSession } from "@/lib/session"
import { getAdminClient } from "@/lib/supabase/admin"
import type { AttendanceLog, DirectorAttendanceLog, Employee, EmployeeLocationPoint, Hub } from "@/lib/types"
import {
  excelWorkbookResponse,
  formatReportDateTime,
  nextMonth,
  normalizeMonth,
  type ReportSection,
} from "@/lib/excel-report"

export async function GET(req: Request): Promise<Response> {
  const session = await getSession()
  if (!session || session.role !== "hub_admin" || !session.hubId) {
    return new Response("Forbidden", { status: 403 })
  }

  const url = new URL(req.url)
  const month = normalizeMonth(url.searchParams.get("month"))
  const startDate = `${month}-01`
  const endDate = `${nextMonth(month)}-01`
  const supabase = getAdminClient()

  const [
    { data: hub },
    { data: employees },
    { data: employeeLogs },
    { data: locationPoints },
    { data: directorLogs },
  ] = await Promise.all([
    supabase.from("hubs").select("*").eq("id", session.hubId).maybeSingle(),
    supabase.from("employees").select("*").eq("hub_id", session.hubId).order("name", { ascending: true }),
    supabase
      .from("attendance_logs")
      .select("*")
      .eq("hub_id", session.hubId)
      .gte("date", startDate)
      .lt("date", endDate)
      .order("date", { ascending: true })
      .order("check_in_time", { ascending: true }),
    supabase
      .from("employee_location_points")
      .select("*")
      .eq("hub_id", session.hubId)
      .gte("recorded_at", `${startDate}T00:00:00.000Z`)
      .lt("recorded_at", `${endDate}T00:00:00.000Z`)
      .order("recorded_at", { ascending: true }),
    supabase
      .from("director_attendance_logs")
      .select("*")
      .eq("user_id", session.userId)
      .gte("date", startDate)
      .lt("date", endDate)
      .order("date", { ascending: true }),
  ])

  const currentHub = hub as Hub | null
  const employeeList = (employees ?? []) as Employee[]
  const employeeById = new Map(employeeList.map((employee) => [employee.id, employee]))
  const attendanceByEmployeeDate = new Map<string, AttendanceLog>()
  for (const log of (employeeLogs ?? []) as AttendanceLog[]) {
    attendanceByEmployeeDate.set(reportKey(log.employee_id, log.date), log)
  }

  const gpsStatsByEmployeeDate = new Map<string, { total: number; inside: number; outside: number }>()
  for (const point of (locationPoints ?? []) as EmployeeLocationPoint[]) {
    const date = formatReportDate(point.recorded_at)
    const key = reportKey(point.employee_id, date)
    const stats = gpsStatsByEmployeeDate.get(key) ?? { total: 0, inside: 0, outside: 0 }
    stats.total += 1
    if (point.is_inside_geofence) {
      stats.inside += 1
    } else {
      stats.outside += 1
    }
    gpsStatsByEmployeeDate.set(key, stats)
  }

  const employeeReportKeys = new Set<string>([...attendanceByEmployeeDate.keys(), ...gpsStatsByEmployeeDate.keys()])
  const employeeRows = [...employeeReportKeys]
    .map((key) => {
      const [employeeId, date] = key.split("|")
      const employee = employeeById.get(employeeId)
      const attendance = attendanceByEmployeeDate.get(key)
      const gpsStats = gpsStatsByEmployeeDate.get(key) ?? { total: 0, inside: 0, outside: 0 }
      const lateStatus = attendance ? (attendance.status === "Late" ? "да" : "нет") : "-"

      return [
        employee?.name ?? "-",
        date,
        lateStatus,
        gpsStats.total,
        gpsStats.inside,
        gpsStats.outside,
      ]
    })
    .sort((left, right) => {
      const nameCompare = String(left[0]).localeCompare(String(right[0]), "ru")
      if (nameCompare !== 0) return nameCompare
      return String(left[1]).localeCompare(String(right[1]))
    })

  const directorRows = ((directorLogs ?? []) as DirectorAttendanceLog[]).map((log) => [
    log.date,
    session.name,
    currentHub?.name ?? "-",
    formatReportDateTime(log.check_in_time),
    formatReportDateTime(log.check_out_time),
    log.work_duration ?? "-",
    log.status ?? "-",
  ])

  const sections: ReportSection[] = [
    {
      title: "GPS-отчет сотрудников",
      headers: ["Сотрудник", "День", "Опоздание", "Всего GPS отметок", "В радиусе", "Вне радиуса"],
      rows: employeeRows,
    },
    {
      title: "Отчет директора",
      headers: ["Дата", "Директор", "Хаб", "Прибытие", "Отбытие", "Длительность", "Статус"],
      rows: directorRows,
    },
  ]

  const hubSlug = (currentHub?.slug || currentHub?.name || "hub").toLowerCase().replace(/[^a-z0-9]+/g, "-")
  return excelWorkbookResponse(
    `Месячный отчет ${currentHub?.name ?? "хаба"} за ${month}`,
    `monthly-report-${hubSlug}-${month}.xls`,
    sections,
  )
}

function reportKey(employeeId: string, date: string): string {
  return `${employeeId}|${date}`
}

function formatReportDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Qyzylorda",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value))

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}
