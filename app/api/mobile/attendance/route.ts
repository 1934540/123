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
  recordedAt?: string
}

type ApprovedRemoteWorkRequest = {
  id: string
  reason: string
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
  if (!body.deviceId) {
    return NextResponse.json({ error: "Нужен ID устройства" }, { status: 400 })
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

  const currentDeviceId = employee.device_id === "mobile-app" ? null : employee.device_id
  if (!currentDeviceId) {
    await supabase.from("employees").update({ device_id: body.deviceId }).eq("id", employee.id)
  } else if (currentDeviceId !== body.deviceId) {
    return NextResponse.json({ error: "Аккаунт привязан к другому устройству" }, { status: 403 })
  }

  const recordedAtDate = body.recordedAt ? new Date(body.recordedAt) : new Date()
  const nowStr = Number.isNaN(recordedAtDate.getTime()) ? new Date().toISOString() : recordedAtDate.toISOString()
  const today = appDateString(new Date(nowStr))
  let distance: number | undefined
  let approvedRemoteWorkRequest: ApprovedRemoteWorkRequest | null = null

  if (hub.geofence_enabled) {
    if (body.lat == null || body.lng == null) return NextResponse.json({ error: "Нужен GPS" }, { status: 400 })
    if (hub.latitude == null || hub.longitude == null) {
      return NextResponse.json({ error: "У хаба не настроены координаты" }, { status: 400 })
    }

    distance = Math.round(haversineMeters(body.lat, body.lng, hub.latitude, hub.longitude))
    if (distance > hub.geofence_radius) {
      const { data: request } = await supabase
        .from("remote_work_requests")
        .select("id, reason")
        .eq("employee_id", employee.id)
        .eq("hub_id", hub.id)
        .eq("request_date", today)
        .eq("status", "approved")
        .order("reviewed_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      approvedRemoteWorkRequest = request
      if (!approvedRemoteWorkRequest) {
        return NextResponse.json(
          {
            error: `Вы вне радиуса хаба: ${distance} м. Отправьте заявку "Вне зоны по работе" и дождитесь разрешения директора.`,
            distance,
            needsDirectorApproval: true,
          },
          { status: 400 },
        )
      }
    }
  }

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
      status: approvedRemoteWorkRequest ? "Remote Work Approved" : "On Time",
      location_in_lat: body.lat,
      location_in_lng: body.lng,
      device_id_used: body.deviceId,
      is_excused: Boolean(approvedRemoteWorkRequest),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      ok: true,
      action: "check_in",
      distance,
      message: `Приход: ${formatAppTime(nowStr)}${approvedRemoteWorkRequest ? " (вне зоны по разрешению)" : ""}`,
    })
  }

  if (log.check_out_time) return NextResponse.json({ error: "Уход уже отмечен" }, { status: 400 })
  if (body.mode === "check_in") {
    return NextResponse.json({
      ok: true,
      action: "check_in",
      distance,
      message: "Приход уже отмечен. GPS-мониторинг включен.",
    })
  }

  const durationMs = Math.max(0, new Date(nowStr).getTime() - new Date(log.check_in_time as string).getTime())
  const updatePayload: Record<string, string | number | boolean | null> = {
    check_out_time: nowStr,
    work_duration: formatDuration(durationMs),
    status: approvedRemoteWorkRequest ? "Remote Work Approved" : log.status ?? "On Time",
    location_out_lat: body.lat ?? null,
    location_out_lng: body.lng ?? null,
    updated_at: nowStr,
  }
  if (approvedRemoteWorkRequest) updatePayload.is_excused = true

  const { error } = await supabase.from("attendance_logs").update(updatePayload).eq("id", log.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    ok: true,
    action: "check_out",
    distance,
    message: `Уход: ${formatAppTime(nowStr)} (${formatDuration(durationMs)})${approvedRemoteWorkRequest ? " (вне зоны по разрешению)" : ""}`,
  })
}
