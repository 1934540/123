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
  const latitude = Number(formData.get("latitude"))
  const longitude = Number(formData.get("longitude"))
  const radius = Number(formData.get("radius")) || 150

  if (!name) return { ok: false, message: "Хаб атауы міндетті" }

  const supabase = getAdminClient()
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  const { error } = await supabase.from("hubs").insert({
    uid: `HUB-${suffix}`,
    slug: `${slugify(name)}-${suffix.toLowerCase()}`,
    name,
    city: city || null,
    latitude: Number.isNaN(latitude) ? null : latitude,
    longitude: Number.isNaN(longitude) ? null : longitude,
    geofence_radius: Math.max(20, Math.round(radius)),
    geofence_enabled: true,
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
  })

  if (error) {
    if (error.code === "23505") return { ok: false, message: "Бұл логин бос емес" }
    return { ok: false, message: error.message }
  }
  revalidatePath("/owner")
  return { ok: true, message: "Директор қосылды" }
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
