import { NextResponse } from "next/server"
import { createMobileToken } from "@/lib/mobile-auth"
import { verifyPassword } from "@/lib/password"
import { getAdminClient } from "@/lib/supabase/admin"
import type { Hub } from "@/lib/types"

export async function POST(req: Request): Promise<Response> {
  const { username, password } = (await req.json().catch(() => ({}))) as {
    username?: string
    password?: string
  }

  if (!username || !password) {
    return NextResponse.json({ error: "Введите логин и пароль" }, { status: 400 })
  }

  const supabase = getAdminClient()
  const { data: employee } = await supabase
    .from("employees")
    .select("id, username, password, name, hub_id, is_active")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle()

  if (!employee || !verifyPassword(password, employee.password)) {
    return NextResponse.json({ error: "Логин или пароль неверный" }, { status: 401 })
  }

  if (!employee.is_active) {
    return NextResponse.json({ error: "Аккаунт отключен" }, { status: 403 })
  }

  const { data: hub } = employee.hub_id
    ? await supabase
        .from("hubs")
        .select("id, name, latitude, longitude, geofence_radius, geofence_enabled")
        .eq("id", employee.hub_id)
        .maybeSingle()
    : { data: null }

  const session = {
    userId: employee.id,
    role: "employee" as const,
    name: employee.name,
    hubId: employee.hub_id ?? null,
    employeeId: employee.id,
  }

  return NextResponse.json({
    token: createMobileToken(session),
    employee: { id: employee.id, name: employee.name, username: employee.username },
    hub: hub as Pick<Hub, "id" | "name" | "latitude" | "longitude" | "geofence_radius" | "geofence_enabled"> | null,
  })
}
