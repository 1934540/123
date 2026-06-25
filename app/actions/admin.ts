"use server"

import { revalidatePath } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"
import { getSession } from "@/lib/session"
import { hashPassword } from "@/lib/password"
import { parseEmployeeImport } from "@/lib/employee-import"

type ActionResult = { ok: boolean; message: string }

async function requireHubAccess(hubId: string): Promise<{ ok: boolean; isSuper: boolean }> {
  const session = await getSession()
  if (!session) return { ok: false, isSuper: false }
  if (session.role === "super_admin") return { ok: true, isSuper: true }
  if (session.role === "hub_admin" && session.hubId === hubId) return { ok: true, isSuper: false }
  return { ok: false, isSuper: false }
}

export async function reviewRemoteWorkRequestAction(formData: FormData): Promise<ActionResult> {
  const hubId = String(formData.get("hubId") ?? "")
  const requestId = String(formData.get("requestId") ?? "")
  const decision = String(formData.get("decision") ?? "")
  const directorReason = String(formData.get("directorReason") ?? "").trim()
  const access = await requireHubAccess(hubId)

  if (!access.ok) return { ok: false, message: "Нет доступа" }
  if (!requestId) return { ok: false, message: "Заявка не выбрана" }
  if (decision !== "approved" && decision !== "rejected") return { ok: false, message: "Неверное решение" }
  if (decision === "rejected" && directorReason.length < 3) {
    return { ok: false, message: "Для отказа укажите причину" }
  }

  const session = await getSession()
  const supabase = getAdminClient()
  const { error } = await supabase
    .from("remote_work_requests")
    .update({
      status: decision,
      director_reason: directorReason || null,
      reviewed_by: session?.userId ?? null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("hub_id", hubId)
    .eq("status", "pending")

  if (error) return { ok: false, message: error.message }

  revalidatePath("/admin")
  return { ok: true, message: decision === "approved" ? "Заявка подтверждена" : "Заявка отклонена" }
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

export async function importEmployeesAction(formData: FormData): Promise<ActionResult> {
  const hubId = String(formData.get("hubId") ?? "")
  const access = await requireHubAccess(hubId)
  if (!access.ok) return { ok: false, message: "Нет доступа" }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Выберите Excel-файл" }
  }

  const { employees, skipped } = await parseEmployeeImport(file)
  if (employees.length === 0) {
    return { ok: false, message: "Не найдено строк для импорта. Проверьте заголовки: name, username, password." }
  }

  const supabase = getAdminClient()
  const rows = employees.map((employee) => ({ ...employee, hub_id: hubId }))
  const { error } = await supabase.from("employees").insert(rows)

  if (error) {
    if (error.code === "23505") return { ok: false, message: "В файле есть логин, который уже занят" }
    return { ok: false, message: error.message }
  }

  revalidatePath("/admin")
  return {
    ok: true,
    message: `Импортировано: ${employees.length}${skipped ? `. Пропущено строк: ${skipped}` : ""}`,
  }
}

export async function updateEmployeeAction(formData: FormData): Promise<ActionResult> {
  const hubId = String(formData.get("hubId") ?? "")
  const employeeId = String(formData.get("employeeId") ?? "")
  const access = await requireHubAccess(hubId)
  if (!access.ok) return { ok: false, message: "Нет доступа" }

  const name = String(formData.get("name") ?? "").trim()
  const username = String(formData.get("username") ?? "").trim().toLowerCase().replace(/\s+/g, "")
  const password = String(formData.get("password") ?? "")
  const department = String(formData.get("department") ?? "").trim()

  if (!employeeId || !name || !username) {
    return { ok: false, message: "Имя и логин обязательны" }
  }

  const updates: Record<string, string | null> = {
    name,
    username,
    public_id: username.toUpperCase(),
    department: department || null,
    updated_at: new Date().toISOString(),
  }

  if (password.trim()) {
    updates.password = hashPassword(password)
  }

  const supabase = getAdminClient()
  const { error } = await supabase.from("employees").update(updates).eq("id", employeeId).eq("hub_id", hubId)

  if (error) {
    if (error.code === "23505") return { ok: false, message: "Этот логин уже занят" }
    return { ok: false, message: error.message }
  }

  revalidatePath("/admin")
  revalidatePath(`/owner/hubs/${hubId}`)
  return { ok: true, message: "Сотрудник обновлен" }
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

export async function deleteEmployeeAction(formData: FormData): Promise<ActionResult> {
  const hubId = String(formData.get("hubId") ?? "")
  const employeeId = String(formData.get("employeeId") ?? "")
  const access = await requireHubAccess(hubId)
  if (!access.ok) return { ok: false, message: "Нет доступа" }
  if (!employeeId) return { ok: false, message: "Сотрудник не выбран" }

  const supabase = getAdminClient()
  const { error } = await supabase.from("employees").delete().eq("id", employeeId).eq("hub_id", hubId)

  if (error) return { ok: false, message: error.message }

  revalidatePath("/admin")
  revalidatePath(`/owner/hubs/${hubId}`)
  return { ok: true, message: "Сотрудник удален" }
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
