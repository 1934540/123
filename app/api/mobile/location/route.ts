import { NextResponse } from "next/server"
import { haversineMeters } from "@/lib/geo"
import { verifyMobileToken } from "@/lib/mobile-auth"
import { getAdminClient } from "@/lib/supabase/admin"

type LocationBody = {
  lat?: number | null
  lng?: number | null
  accuracy?: number | null
}

export async function POST(req: Request): Promise<Response> {
  const session = verifyMobileToken(req.headers.get("authorization"))
  if (!session || session.role !== "employee" || !session.employeeId) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as LocationBody
  if (body.lat == null || body.lng == null) {
    return NextResponse.json({ error: "Нужен GPS" }, { status: 400 })
  }

  const supabase = getAdminClient()
  const { data: employee } = await supabase
    .from("employees")
    .select("id, name, hub_id")
    .eq("id", session.employeeId)
    .maybeSingle()

  if (!employee?.hub_id) return NextResponse.json({ error: "Хаб не назначен" }, { status: 400 })

  const { data: hub } = await supabase
    .from("hubs")
    .select("id, latitude, longitude, geofence_radius, geofence_enabled")
    .eq("id", employee.hub_id)
    .maybeSingle()

  if (!hub?.geofence_enabled || hub.latitude == null || hub.longitude == null) {
    return NextResponse.json({ ok: true, inside: true })
  }

  const distance = Math.round(haversineMeters(body.lat, body.lng, hub.latitude, hub.longitude))
  const inside = distance <= hub.geofence_radius
  const recordedAt = new Date().toISOString()

  await supabase.from("employee_location_points").insert({
    employee_id: employee.id,
    hub_id: hub.id,
    latitude: body.lat,
    longitude: body.lng,
    accuracy: body.accuracy ?? null,
    distance_meters: distance,
    radius_meters: hub.geofence_radius,
    is_inside_geofence: inside,
    recorded_at: recordedAt,
  })

  if (!inside) {
    await supabase.from("geofence_events").insert({
      employee_id: employee.id,
      hub_id: hub.id,
      event_type: "outside_geofence",
      latitude: body.lat,
      longitude: body.lng,
      accuracy: body.accuracy ?? null,
      distance_meters: distance,
      radius_meters: hub.geofence_radius,
      created_at: recordedAt,
    })
  }

  return NextResponse.json({ ok: true, inside, distance, radius: hub.geofence_radius })
}
