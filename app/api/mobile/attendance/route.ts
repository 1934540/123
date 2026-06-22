import { NextResponse } from "next/server"
import { appDateString, formatAppTime } from "@/lib/date"
import { formatDuration, haversineMeters } from "@/lib/geo"
import { verifyMobileToken } from "@/lib/mobile-auth"
import { getAdminClient } from "@/lib/supabase/admin"

type AttendanceBody = {
  mode?: "check_in" | "check_out"
  lat?: number | null
  lng?: number | null
  deviceId?: string
}

export async function POST(req: Request): Promise<Response> {
  const session = verifyMobileToken(req.headers.get("authorization"))
  if (!session || session.role !== "employee" || !session.employeeId) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as AttendanceBody
  if (body.mode !== "check_in" && body.mode !== "check_out") {
    return NextResponse.json({ error: "Неверное действие" }, { status: 400 })
  }

  const supabase = getAdminClient()
  const { data: employee } = await supabase
    .from("employees")
    .select("id, hub_id, device_id")
    .eq("id", session.employeeId)
    .maybeSingle()

  if (!employee?.hub_id) return NextResponse.json({ error: "Хаб не назначен" }, { status: 400 })

  const { data: hub } = await supabase
    .from("hubs")
    .select("id, latitude, longitude, geofence_radius, geofence_enabled, is_active")
    .eq("id", employee.hub_id)
    .maybeSingle()

  if (!hub?.is_active) return NextResponse.json({ error: "Хаб отключен" }, { status: 400 })

  if (!employee.device_id && body.deviceId) {
    await supabase.from("employees").update({ device_id: body.deviceId }).eq("id", employee.id)
  } else if (employee.device_id && body.deviceId && employee.device_id !== body.deviceId) {
    return NextResponse.json({ error: "Аккаунт привязан к другому устройству" }, { status: 403 })
  }

  let distance: number | undefined
  if (hub.geofence_enabled) {
    if (body.lat == null || body.lng == null) return NextResponse.json({ error: "Нужен GPS" }, { status: 400 })
    if (hub.latitude == null || hub.longitude == null) {
      return NextResponse.json({ error: "У хаба не настроены координаты" }, { status: 400 })
    }
    distance = Math.round(haversineMeters(body.lat, body.lng, hub.latitude, hub.longitude))
    if (distance > hub.geofence_radius) {
      return NextResponse.json({ error: `Вы вне радиуса хаба: ${distance} м`, distance }, { status: 400 })
    }
  }

  const today = appDateString()
  const nowStr = new Date().toISOString()
  const { data: log } = await supabase
    .from("attendance_logs")
    .select("id, check_in_time, check_out_time, status")
    .eq("employee_id", employee.id)
    .eq("date", today)
    .maybeSingle()

  if (!log) {
    if (body.mode === "check_out") return NextResponse.json({ error: "Сначала отметьте приход" }, { status: 400 })

    const { error } = await supabase.from("attendance_logs").insert({
      employee_id: employee.id,
      hub_id: hub.id,
      date: today,
      check_in_time: nowStr,
      status: "On Time",
      location_in_lat: body.lat,
      location_in_lng: body.lng,
      device_id_used: body.deviceId,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action: "check_in", distance, message: `Приход: ${formatAppTime(nowStr)}` })
  }

  if (body.mode === "check_in") return NextResponse.json({ error: "Приход уже отмечен" }, { status: 400 })
  if (log.check_out_time) return NextResponse.json({ error: "Уход уже отмечен" }, { status: 400 })

  const durationMs = Math.max(0, new Date(nowStr).getTime() - new Date(log.check_in_time as string).getTime())
  const { error } = await supabase
    .from("attendance_logs")
    .update({
      check_out_time: nowStr,
      work_duration: formatDuration(durationMs),
      status: log.status ?? "On Time",
      location_out_lat: body.lat,
      location_out_lng: body.lng,
      updated_at: nowStr,
    })
    .eq("id", log.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    ok: true,
    action: "check_out",
    distance,
    message: `Уход: ${formatAppTime(nowStr)} (${formatDuration(durationMs)})`,
  })
}
