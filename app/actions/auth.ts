"use server"

import { redirect } from "next/navigation"
import { getAdminClient } from "@/lib/supabase/admin"
import { createSession, destroySession, getSession } from "@/lib/session"
import { verifyPassword } from "@/lib/password"
import type { Role, SessionData } from "@/lib/types"

export type LoginState = { error?: string }

function pathForRole(role: Role): string {
  switch (role) {
    case "super_admin":
      return "/owner"
    case "hub_admin":
      return "/admin"
    default:
      return "/employee"
  }
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")

  if (!username || !password) {
    return { error: "Логин мен құпиясөзді енгізіңіз" }
  }

  const supabase = getAdminClient()

  // 1) Admin / owner accounts live in the users table
  const { data: user } = await supabase
    .from("users")
    .select("id, username, password, role, hub_id, display_name")
    .eq("username", username)
    .maybeSingle()

  if (user && verifyPassword(password, user.password)) {
    const session: SessionData = {
      userId: user.id,
      role: user.role as Role,
      name: user.display_name ?? user.username,
      hubId: user.hub_id ?? null,
      employeeId: null,
    }
    await createSession(session)
    redirect(pathForRole(session.role))
  }

  // 2) Employees authenticate against the employees table
  const { data: employee } = await supabase
    .from("employees")
    .select("id, username, password, name, hub_id, is_active")
    .eq("username", username)
    .maybeSingle()

  if (employee && verifyPassword(password, employee.password)) {
    if (!employee.is_active) {
      return { error: "Бұл аккаунт өшірілген. Әкімшіге хабарласыңыз." }
    }
    const session: SessionData = {
      userId: employee.id,
      role: "employee",
      name: employee.name,
      hubId: employee.hub_id ?? null,
      employeeId: employee.id,
    }
    await createSession(session)
    redirect("/employee")
  }

  return { error: "Логин немесе құпиясөз қате" }
}

export async function logoutAction(): Promise<void> {
  await destroySession()
  redirect("/login")
}

export async function requireRole(...allowed: Role[]): Promise<SessionData> {
  const session = await getSession()
  if (!session) redirect("/login")
  if (allowed.length && !allowed.includes(session.role)) {
    redirect(pathForRole(session.role))
  }
  return session
}
