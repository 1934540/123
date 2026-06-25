"use server"

import { revalidatePath } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"
import { getSession } from "@/lib/session"
import { haversineMeters, formatDuration } from "@/lib/geo"
import { appDateString, formatAppTime } from "@/lib/date"
import { appWeekRange, attendanceStatusForCheckIn, GRACE_STATUS } from "@/lib/work-schedule"

export type AttendanceResult = {
  ok: boolean
  message: string
  action?: "check_in" | "check_out"
  distance?: number
}

type AttendanceInput = {
  mode: "check_in" | "check_out"
  lat: number | null
  lng: number | null
  deviceId: string
}

export async function markAttendanceAction(input: AttendanceInput): Promise<AttendanceResult> {
  const session = await getSession()
  if (!session || session.role !== "employee" || !session.employeeId) {
    return { ok: false, message: "Сессия мерзімі бітті. Қайта кіріңіз." }
  }

  const supabase = getAdminClient()

  const { data: employee } = await supabase
    .from("employees")
    .select("id, name, hub_id, shift_id, device_id")
    .eq("id", session.employeeId)
    .maybeSingle()

  if (!employee) {
    return { ok: false, message: "Қызметкер табылмады." }
  }
  if (!employee.hub_id) {
    return { ok: false, message: "Қызметкерге жұмыс нүктесі бекітілмеген." }
  }

  const { data: hub } = await supabase
    .from("hubs")
    .select("id, name, latitude, longitude, geofence_radius, geofence_enabled, is_active")
    .eq("id", employee.hub_id)
    .maybeSingle()

  if (!hub || !hub.is_active) {
    return { ok: false, message: "Жұмыс нүктесі табылмады немесе белсенді емес." }
  }

  if (!employee.device_id) {
    await supabase.from("employees").update({ device_id: input.deviceId }).eq("id", employee.id)
  } else if (employee.device_id !== input.deviceId) {
    return { ok: false, message: "Бұл аккаунт басқа құрылғыға байланысқан. Әкімшіге хабарласыңыз." }
  }

  let distance: number | undefined
  if (hub.geofence_enabled) {
    if (input.lat == null || input.lng == null) {
      return { ok: false, message: "Орналасу қажет. GPS рұқсатын қосыңыз." }
    }
    if (hub.latitude == null || hub.longitude == null) {
      return { ok: false, message: "Жұмыс нүктесінің координаттары орнатылмаған." }
    }
    distance = Math.round(haversineMeters(input.lat, input.lng, hub.latitude, hub.longitude))
    if (distance > hub.geofence_radius) {
      return {
        ok: false,
        distance,
        message: `Сіз жұмыс нүктесінен ${distance} м қашықтасыз (рұқсат етілген: ${hub.geofence_radius} м). Жақынырақ келіңіз.`,
      }
    }
  }

  const today = appDateString()
  const nowStr = new Date().toISOString()
  const now = new Date()

  const { data: log } = await supabase
    .from("attendance_logs")
    .select("id, check_in_time, check_out_time, status")
    .eq("employee_id", employee.id)
    .eq("date", today)
    .maybeSingle()

  if (!log) {
    if (input.mode === "check_out") {
      return { ok: false, message: "Сначала отметьте приход, потом уход." }
    }

    const weekRange = appWeekRange(now)
    const { count: weeklyGraceCount } = await supabase
      .from("attendance_logs")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employee.id)
      .gte("date", weekRange.start)
      .lt("date", weekRange.nextStart)
      .eq("status", GRACE_STATUS)
    const status = attendanceStatusForCheckIn(now, weeklyGraceCount ?? 0)

    await supabase.from("attendance_logs").insert({
      employee_id: employee.id,
      hub_id: hub.id,
      date: today,
      check_in_time: nowStr,
      status,
      location_in_lat: input.lat,
      location_in_lng: input.lng,
      device_id_used: input.deviceId,
    })
    revalidatePath("/employee")
    return { ok: true, action: "check_in", distance, message: `Келу белгіленді (${status}): ${formatAppTime(nowStr)}` }
  }

  if (input.mode === "check_in") {
    return { ok: false, message: "Приход уже отмечен. Для завершения дня нажмите «Ушел»." }
  }

  if (log.check_out_time) {
    return { ok: false, message: "Сіз бүгін кету уақытын белгілеп қойдыңыз." }
  }

  let outStatus = log.status || "On Time"
  const appParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Qyzylorda",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now)
  const values = Object.fromEntries(appParts.map((part) => [part.type, part.value]))
  const checkoutMinutes = Number(values.hour) * 60 + Number(values.minute)
  if (checkoutMinutes < 18 * 60 + 30) {
    outStatus = "Early Leave"
  }

  const checkInTime = new Date(log.check_in_time as string).getTime()
  const { data: completedBreaks } = await supabase
    .from("breaks")
    .select("start_time, end_time")
    .eq("attendance_log_id", log.id)
    .not("end_time", "is", null)

  const breakMs = (completedBreaks ?? []).reduce((total, item) => {
    if (!item.start_time || !item.end_time) return total
    return total + Math.max(0, new Date(item.end_time).getTime() - new Date(item.start_time).getTime())
  }, 0)
  const durationMs = Math.max(0, now.getTime() - checkInTime - breakMs)

  await supabase
    .from("attendance_logs")
    .update({
      check_out_time: nowStr,
      work_duration: formatDuration(durationMs),
      status: outStatus,
      location_out_lat: input.lat,
      location_out_lng: input.lng,
      updated_at: nowStr,
    })
    .eq("id", log.id)

  revalidatePath("/employee")
  return {
    ok: true,
    action: "check_out",
    distance,
    message: `Кету белгіленді (${outStatus}): ${formatAppTime(nowStr)} (${formatDuration(durationMs)})`,
  }
}
