"use server"

import { revalidatePath } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"
import { getSession } from "@/lib/session"
import { hashPassword } from "@/lib/password"

type ActionResult = { ok: boolean; message: string }

async function requireSuper(): Promise<boolean> {
  const session = await getSession()
  return session?.role === "super_admin"
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40)
}

export async function createHubAction(formData: FormData): Promise<ActionResult> {
  if (!(await requireSuper())) return { ok: false, message: "Рұқсат жоқ" }

  const name = String(formData.get("name") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim()

  if (!name) return { ok: false, message: "Хаб атауы міндетті" }

  const supabase = getAdminClient()
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  const { error } = await supabase.from("hubs").insert({
    uid: `HUB-${suffix}`,
    slug: `${slugify(name)}-${suffix.toLowerCase()}`,
    name,
    city: city || null,
    latitude: null,
    longitude: null,
    geofence_radius: 150,
    geofence_enabled: false,
  })

  if (error) return { ok: false, message: error.message }
  revalidatePath("/owner")
  return { ok: true, message: "Хаб құрылды" }
}

export async function createHubAdminAction(formData: FormData): Promise<ActionResult> {
  if (!(await requireSuper())) return { ok: false, message: "Рұқсат жоқ" }

  const hubId = String(formData.get("hubId") ?? "")
  const username = String(formData.get("username") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  const displayName = String(formData.get("displayName") ?? "").trim()
  const position = String(formData.get("position") ?? "").trim()

  if (!hubId || !username || !password) {
    return { ok: false, message: "Хаб, логин және құпиясөз міндетті" }
  }

  const supabase = getAdminClient()
  const { error } = await supabase.from("users").insert({
    username,
    password: hashPassword(password),
    role: "hub_admin",
    hub_id: hubId,
    display_name: displayName || username,
    position: position || null,
  })

  if (error) {
    if (error.code === "23505") return { ok: false, message: "Бұл логин бос емес" }
    return { ok: false, message: error.message }
  }
  revalidatePath("/owner")
  return { ok: true, message: "Директор қосылды" }
}

export async function updateHubAdminAction(formData: FormData): Promise<ActionResult> {
  if (!(await requireSuper())) return { ok: false, message: "Нет доступа" }

  const adminId = String(formData.get("adminId") ?? "")
  const hubId = String(formData.get("hubId") ?? "")
  const username = String(formData.get("username") ?? "").trim().toLowerCase().replace(/\s+/g, "")
  const password = String(formData.get("password") ?? "")
  const displayName = String(formData.get("displayName") ?? "").trim()
  const position = String(formData.get("position") ?? "").trim()

  if (!adminId || !hubId || !username || !displayName) {
    return { ok: false, message: "Имя, логин и хаб обязательны" }
  }

  const updates: Record<string, string | null> = {
    username,
    display_name: displayName,
    position: position || null,
    updated_at: new Date().toISOString(),
  }

  if (password.trim()) {
    updates.password = hashPassword(password)
  }

  const supabase = getAdminClient()
  const { error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", adminId)
    .eq("hub_id", hubId)
    .eq("role", "hub_admin")

  if (error) {
    if (error.code === "23505") return { ok: false, message: "Этот логин уже занят" }
    return { ok: false, message: error.message }
  }

  revalidatePath("/owner")
  revalidatePath(`/owner/hubs/${hubId}`)
  return { ok: true, message: "Директор обновлен" }
}

export async function updateHubAction(formData: FormData): Promise<ActionResult> {
  if (!(await requireSuper())) return { ok: false, message: "Рұқсат жоқ" }

  const hubId = String(formData.get("hubId") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim()

  if (!hubId || !name) {
    return { ok: false, message: "Хаб және атауы міндетті" }
  }

  const supabase = getAdminClient()
  const { error } = await supabase
    .from("hubs")
    .update({
      name,
      city: city || null,
      slug: slugify(name) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", hubId)

  if (error) return { ok: false, message: error.message }
  revalidatePath("/owner")
  revalidatePath(`/owner/hubs/${hubId}`)
  return { ok: true, message: "Хаб жаңартылды" }
}

export async function toggleHubAction(formData: FormData): Promise<ActionResult> {
  if (!(await requireSuper())) return { ok: false, message: "Рұқсат жоқ" }

  const hubId = String(formData.get("hubId") ?? "")
  const isActive = formData.get("isActive") === "true"

  const supabase = getAdminClient()
  await supabase
    .from("hubs")
    .update({ is_active: !isActive, updated_at: new Date().toISOString() })
    .eq("id", hubId)

  revalidatePath("/owner")
  return { ok: true, message: !isActive ? "Хаб қосылды" : "Хаб өшірілді" }
}
