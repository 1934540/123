import { NextResponse } from "next/server"
import { appDateString } from "@/lib/date"
import { haversineMeters } from "@/lib/geo"
import { verifyMobileToken } from "@/lib/mobile-auth"
import { getAdminClient } from "@/lib/supabase/admin"

type WorkLocationRequestBody = {
  reason?: string
  lat?: number | null
  lng?: number | null
  deviceId?: string
  recordedAt?: string
}

export async function POST(req: Request): Promise<Response> {
  const session = verifyMobileToken(req.headers.get("authorization"))
  if (!session?.employeeId) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as WorkLocationRequestBody
  const reason = String(body.reason ?? "").trim()

  if (reason.length < 5) {
    return NextResponse.json({ error: "Укажите причину минимум 5 символов" }, { status: 400 })
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

  const currentDeviceId = employee.device_id === "mobile-app" ? null : employee.device_id
  if (!currentDeviceId) {
    await supabase.from("employees").update({ device_id: body.deviceId }).eq("id", employee.id)
  } else if (currentDeviceId !== body.deviceId) {
    return NextResponse.json({ error: "Аккаунт привязан к другому устройству" }, { status: 403 })
  }

  const { data: hub } = await supabase
    .from("hubs")
    .select("id, latitude, longitude, geofence_radius")
    .eq("id", employee.hub_id)
    .maybeSingle()

  if (!hub) return NextResponse.json({ error: "Хаб не найден" }, { status: 400 })

  const recordedAtDate = body.recordedAt ? new Date(body.recordedAt) : new Date()
  const requestedAt = Number.isNaN(recordedAtDate.getTime()) ? new Date().toISOString() : recordedAtDate.toISOString()
  const requestDate = appDateString(new Date(requestedAt))
  const distance =
    body.lat != null && body.lng != null && hub.latitude != null && hub.longitude != null
      ? Math.round(haversineMeters(body.lat, body.lng, hub.latitude, hub.longitude))
      : null

  const { data: existingApproved } = await supabase
    .from("remote_work_requests")
    .select("id")
    .eq("employee_id", employee.id)
    .eq("hub_id", employee.hub_id)
    .eq("request_date", requestDate)
    .eq("status", "approved")
    .maybeSingle()

  if (existingApproved) {
    return NextResponse.json({ ok: true, status: "approved", message: "Разрешение директора уже активно на сегодня" })
  }

  const { data: existingPending } = await supabase
    .from("remote_work_requests")
    .select("id")
    .eq("employee_id", employee.id)
    .eq("hub_id", employee.hub_id)
    .eq("request_date", requestDate)
    .eq("status", "pending")
    .maybeSingle()

  if (existingPending) {
    const { error } = await supabase
      .from("remote_work_requests")
      .update({
        reason,
        latitude: body.lat ?? null,
        longitude: body.lng ?? null,
        distance_meters: distance,
        device_id: body.deviceId,
        requested_at: requestedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingPending.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, status: "pending", message: "Заявка обновлена и ожидает директора" })
  }

  const { error } = await supabase.from("remote_work_requests").insert({
    employee_id: employee.id,
    hub_id: employee.hub_id,
    request_date: requestDate,
    reason,
    latitude: body.lat ?? null,
    longitude: body.lng ?? null,
    distance_meters: distance,
    device_id: body.deviceId,
    requested_at: requestedAt,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status: "pending", message: "Заявка отправлена директору" })
}
