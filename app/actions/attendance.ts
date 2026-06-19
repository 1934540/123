"use server"

import { revalidatePath } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"
import { getSession } from "@/lib/session"
import { haversineMeters, formatDuration } from "@/lib/geo"
import { appDateString, formatAppTime } from "@/lib/date"

export type AttendanceResult = {
  ok: boolean
  message: string
  action?: "check_in" | "check_out"
  distance?: number
}

type AttendanceInput = {
  lat: number | null
  lng: number | null
  deviceId: string
}

function parseTime(timeStr: string): Date {
  const [hours, minutes, seconds] = timeStr.split(":").map(Number)
  const d = new Date()
  d.setHours(hours, minutes, seconds || 0, 0)
  return d
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

  let shift = null
  if (employee.shift_id) {
    const { data } = await supabase.from("shifts").select("*").eq("id", employee.shift_id).maybeSingle()
    shift = data
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
    let status = "On Time"
    if (shift && shift.start_time) {
      const shiftStart = parseTime(shift.start_time)
      if (now > shiftStart) {
        status = "Late"
      }
    }

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

  if (log.check_out_time) {
    return { ok: false, message: "Сіз бүгін кету уақытын белгілеп қойдыңыз." }
  }

  let outStatus = log.status || "On Time"
  if (shift && shift.end_time) {
    const shiftEnd = parseTime(shift.end_time)
    if (now < shiftEnd) {
      outStatus = "Early Leave"
    }
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
