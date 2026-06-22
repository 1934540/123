import { getSession } from "@/lib/session"
import { getAdminClient } from "@/lib/supabase/admin"
import type { AttendanceLog, DirectorAttendanceLog, Employee, Hub } from "@/lib/types"
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

  const [{ data: hub }, { data: employees }, { data: employeeLogs }, { data: directorLogs }] = await Promise.all([
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
  const employeeRows = ((employeeLogs ?? []) as AttendanceLog[]).map((log) => {
    const employee = employeeById.get(log.employee_id)
    return [
      log.date,
      employee?.name ?? "-",
      employee?.username ?? "-",
      employee?.department ?? employee?.organization ?? "-",
      formatReportDateTime(log.check_in_time),
      formatReportDateTime(log.check_out_time),
      log.work_duration ?? "-",
      log.is_excused ? "Excused" : (log.status ?? "-"),
    ]
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
      title: "Сотрудники хаба",
      headers: ["Дата", "Сотрудник", "Логин", "Отдел", "Приход", "Уход", "Длительность", "Статус"],
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
