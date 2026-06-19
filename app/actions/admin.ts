"use server"

import { revalidatePath } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"
import { getSession } from "@/lib/session"
import { hashPassword } from "@/lib/password"

type ActionResult = { ok: boolean; message: string }

async function requireHubAccess(hubId: string): Promise<{ ok: boolean; isSuper: boolean }> {
  const session = await getSession()
  if (!session) return { ok: false, isSuper: false }
  if (session.role === "super_admin") return { ok: true, isSuper: true }
  if (session.role === "hub_admin" && session.hubId === hubId) return { ok: true, isSuper: false }
  return { ok: false, isSuper: false }
}

export async function updateGeofenceAction(formData: FormData): Promise<ActionResult> {
  const hubId = String(formData.get("hubId") ?? "")
  const access = await requireHubAccess(hubId)
  if (!access.ok) return { ok: false, message: "Рұқсат жоқ" }

  const latitude = Number(formData.get("latitude"))
  const longitude = Number(formData.get("longitude"))
  const radius = Number(formData.get("radius"))
  const enabled = formData.get("enabled") === "on" || formData.get("enabled") === "true"

  if (Number.isNaN(latitude) || Number.isNaN(longitude) || Number.isNaN(radius)) {
    return { ok: false, message: "Координаттар мен радиус дұрыс емес" }
  }

  const supabase = getAdminClient()
  const { error } = await supabase
    .from("hubs")
    .update({
      latitude,
      longitude,
      geofence_radius: Math.max(20, Math.round(radius)),
      geofence_enabled: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", hubId)

  if (error) return { ok: false, message: error.message }
  revalidatePath("/admin")
  revalidatePath("/owner")
  return { ok: true, message: "Геозона жаңартылды" }
}

export async function addEmployeeAction(formData: FormData): Promise<ActionResult> {
  const hubId = String(formData.get("hubId") ?? "")
  const access = await requireHubAccess(hubId)
  if (!access.ok) return { ok: false, message: "Рұқсат жоқ" }

  const name = String(formData.get("name") ?? "").trim()
  const username = String(formData.get("username") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  const organization = String(formData.get("organization") ?? "").trim()
  const department = String(formData.get("department") ?? "").trim()

  if (!name || !username || !password) {
    return { ok: false, message: "Аты, логин және құпиясөз міндетті" }
  }

  const supabase = getAdminClient()
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase()
  const { error } = await supabase.from("employees").insert({
    hub_id: hubId,
    uid: `EMP-${suffix}`,
    public_id: username.toUpperCase(),
    name,
    username,
    password: hashPassword(password),
    organization: organization || null,
    department: department || null,
    role: "employee",
  })

  if (error) {
    if (error.code === "23505") return { ok: false, message: "Бұл логин бос емес" }
    return { ok: false, message: error.message }
  }
  revalidatePath("/admin")
  return { ok: true, message: "Қызметкер қосылды" }
}

export async function toggleEmployeeAction(formData: FormData): Promise<ActionResult> {
  const hubId = String(formData.get("hubId") ?? "")
  const employeeId = String(formData.get("employeeId") ?? "")
  const isActive = formData.get("isActive") === "true"
  const access = await requireHubAccess(hubId)
  if (!access.ok) return { ok: false, message: "Рұқсат жоқ" }

  const supabase = getAdminClient()
  await supabase
    .from("employees")
    .update({ is_active: !isActive, updated_at: new Date().toISOString() })
    .eq("id", employeeId)
    .eq("hub_id", hubId)

  revalidatePath("/admin")
  return { ok: true, message: !isActive ? "Қызметкер қосылды" : "Қызметкер өшірілді" }
}

export async function excuseLogAction(formData: FormData): Promise<ActionResult> {
  const hubId = String(formData.get("hubId") ?? "")
  const logId = String(formData.get("logId") ?? "")
  const access = await requireHubAccess(hubId)
  if (!access.ok) return { ok: false, message: "Рұқсат жоқ" }

  const supabase = getAdminClient()
  await supabase
    .from("attendance_logs")
    .update({ is_excused: true, status: "excused", updated_at: new Date().toISOString() })
    .eq("id", logId)
    .eq("hub_id", hubId)

  revalidatePath("/admin")
  return { ok: true, message: "Себепті деп белгіленді" }
}
