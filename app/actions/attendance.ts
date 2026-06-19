"use server"

import { revalidatePath } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"
import { getSession } from "@/lib/session"
import { haversineMeters, formatDuration } from "@/lib/geo"

export type ScanResult = {
  ok: boolean
  message: string
  action?: "check_in" | "check_out"
  distance?: number
}

type ScanInput = {
  payload: string
  lat: number | null
  lng: number | null
  deviceId: string
}

const QR_PREFIX = "KZOHUB:"

function localDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

function parseTime(timeStr: string): Date {
  // timeStr is like "09:00:00"
  const [hours, minutes, seconds] = timeStr.split(":").map(Number)
  const d = new Date()
  d.setHours(hours, minutes, seconds || 0, 0)
  return d
}

export async function scanAction(input: ScanInput): Promise<ScanResult> {
  const session = await getSession()
  if (!session || session.role !== "employee" || !session.employeeId) {
    return { ok: false, message: "Сессия мерзімі бітті. Қайта кіріңіз." }
  }

  const raw = (input.payload ?? "").trim()
  if (!raw.startsWith(QR_PREFIX)) {
    return { ok: false, message: "QR код жарамсыз. Хаб QR кодын сканерлеңіз." }
  }
  const hubUid = raw.slice(QR_PREFIX.length).trim()

  const supabase = getAdminClient()

  const { data: hub } = await supabase
    .from("hubs")
    .select("id, uid, name, latitude, longitude, geofence_radius, geofence_enabled, is_active")
    .eq("uid", hubUid)
    .maybeSingle()

  if (!hub || !hub.is_active) {
    return { ok: false, message: "Хаб табылмады немесе белсенді емес." }
  }

  // Employee must belong to this hub and we fetch shift & device info
  const { data: employee } = await supabase
    .from("employees")
    .select("id, name, hub_id, shift_id, device_id")
    .eq("id", session.employeeId)
    .maybeSingle()

  if (!employee) {
    return { ok: false, message: "Қызметкер табылмады." }
  }
  if (employee.hub_id !== hub.id) {
    return { ok: false, message: "Сіз бұл хабқа тіркелмегенсіз." }
  }

  // Device Binding Logic
  if (!employee.device_id) {
    // First time check-in, bind this device
    await supabase.from("employees").update({ device_id: input.deviceId }).eq("id", employee.id)
  } else if (employee.device_id !== input.deviceId) {
    return { ok: false, message: "Бұл аккаунт басқа құрылғыға байланған. Алдау мүмкін емес." }
  }

  // Fetch Shift
  let shift = null
  if (employee.shift_id) {
    const { data } = await supabase.from("shifts").select("*").eq("id", employee.shift_id).maybeSingle()
    shift = data
  }

  // Geofence check
  let distance: number | undefined
  if (hub.geofence_enabled) {
    if (input.lat == null || input.lng == null) {
      return { ok: false, message: "Орналасу қажет. Геолокацияны қосыңыз." }
    }
    if (hub.latitude == null || hub.longitude == null) {
      return { ok: false, message: "Хабтың координаттары орнатылмаған." }
    }
    distance = Math.round(haversineMeters(input.lat, input.lng, hub.latitude, hub.longitude))
    if (distance > hub.geofence_radius) {
      return {
        ok: false,
        distance,
        message: `Сіз хабтан ${distance} м қашықтасыз (рұқсат етілген: ${hub.geofence_radius} м). Жақынырақ келіңіз.`,
      }
    }
  }

  const today = localDateString()
  const nowStr = new Date().toISOString()
  const now = new Date()

  const { data: log } = await supabase
    .from("attendance_logs")
    .select("id, check_in_time, check_out_time, status")
    .eq("employee_id", employee.id)
    .eq("date", today)
    .maybeSingle()

  // No log yet → check in
  if (!log) {
    let status = "On Time"
    if (shift && shift.start_time) {
      const shiftStart = parseTime(shift.start_time)
      // Allow 15 mins grace period (optional)
      // shiftStart.setMinutes(shiftStart.getMinutes() + 15)
      if (now > shiftStart) {
        status = "Late"
      }
    }

    await supabase.from("attendance_logs").insert({
      employee_id: employee.id,
      hub_id: hub.id,
      date: today,
      check_in_time: nowStr,
      status: status,
      location_in_lat: input.lat,
      location_in_lng: input.lng,
      device_id_used: input.deviceId,
    })
    revalidatePath("/employee")
    return { ok: true, action: "check_in", distance, message: `Келу белгіленді (${status}): ${formatTime(nowStr)}` }
  }

  // Already checked out today
  if (log.check_out_time) {
    return { ok: false, message: "Сіз бүгін кету уақытын белгілеп қойдыңыз." }
  }

  // Has check-in but no check-out → check out
  let outStatus = log.status || "On Time"
  if (shift && shift.end_time) {
    const shiftEnd = parseTime(shift.end_time)
    if (now < shiftEnd) {
      outStatus = "Early Leave"
    }
  }

  const checkInTime = new Date(log.check_in_time as string).getTime()
  const durationMs = now.getTime() - checkInTime
  
  // NOTE: In a full system, you would subtract break durations here.
  // We will leave this for the Break logic extension.

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
    message: `Кету белгіленді (${outStatus}): ${formatTime(nowStr)} (${formatDuration(durationMs)})`,
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
}
