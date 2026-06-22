"use server"

import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/session"
import { appDateString, formatAppTime } from "@/lib/date"
import { formatDuration, haversineMeters } from "@/lib/geo"
import { getAdminClient } from "@/lib/supabase/admin"

export type DirectorAttendanceResult = {
  ok: boolean
  message: string
  action?: "check_in" | "check_out"
  distance?: number
}

type DirectorAttendanceInput = {
  mode: "check_in" | "check_out"
  lat: number | null
  lng: number | null
}

export async function markDirectorAttendanceAction(
  input: DirectorAttendanceInput,
): Promise<DirectorAttendanceResult> {
  const session = await getSession()
  if (!session || session.role !== "hub_admin" || !session.hubId) {
    return { ok: false, message: "Нет доступа." }
  }

  const supabase = getAdminClient()
  const { data: hub } = await supabase
    .from("hubs")
    .select("id, name, latitude, longitude, geofence_radius, geofence_enabled, is_active")
    .eq("id", session.hubId)
    .maybeSingle()

  if (!hub || !hub.is_active) {
    return { ok: false, message: "Хаб не найден или отключен." }
  }

  let distance: number | undefined
  if (hub.geofence_enabled) {
    if (input.lat == null || input.lng == null) {
      return { ok: false, message: "Нужен доступ к GPS для отметки." }
    }
    if (hub.latitude == null || hub.longitude == null) {
      return { ok: false, message: "Для хаба не настроены координаты." }
    }

    distance = Math.round(haversineMeters(input.lat, input.lng, hub.latitude, hub.longitude))
    if (distance > hub.geofence_radius) {
      return {
        ok: false,
        distance,
        message: `Вы на расстоянии ${distance} м от хаба. Разрешено: ${hub.geofence_radius} м.`,
      }
    }
  }

  const today = appDateString()
  const nowStr = new Date().toISOString()
  const now = new Date()

  const { data: log } = await supabase
    .from("director_attendance_logs")
    .select("id, check_in_time, check_out_time, status")
    .eq("user_id", session.userId)
    .eq("date", today)
    .maybeSingle()

  if (!log) {
    if (input.mode === "check_out") {
      return { ok: false, message: "Сначала отметьте прибытие." }
    }

    const status = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 0) ? "Late" : "On Time"
    const { error } = await supabase.from("director_attendance_logs").insert({
      user_id: session.userId,
      hub_id: session.hubId,
      date: today,
      check_in_time: nowStr,
      status,
      location_in_lat: input.lat,
      location_in_lng: input.lng,
    })

    if (error) return { ok: false, message: error.message }
    revalidatePath("/admin")
    return { ok: true, action: "check_in", distance, message: `Прибытие отмечено: ${formatAppTime(nowStr)}` }
  }

  if (input.mode === "check_in") {
    return { ok: false, message: "Прибытие уже отмечено." }
  }

  if (log.check_out_time) {
    return { ok: false, message: "Отбытие уже отмечено." }
  }

  const checkInTime = new Date(log.check_in_time as string).getTime()
  const durationMs = Math.max(0, now.getTime() - checkInTime)
  const outStatus = now.getHours() < 18 ? "Early Leave" : (log.status ?? "On Time")

  const { error } = await supabase
    .from("director_attendance_logs")
    .update({
      check_out_time: nowStr,
      work_duration: formatDuration(durationMs),
      status: outStatus,
      location_out_lat: input.lat,
      location_out_lng: input.lng,
      updated_at: nowStr,
    })
    .eq("id", log.id)

  if (error) return { ok: false, message: error.message }
  revalidatePath("/admin")
  return {
    ok: true,
    action: "check_out",
    distance,
    message: `Отбытие отмечено: ${formatAppTime(nowStr)} (${formatDuration(durationMs)})`,
  }
}
