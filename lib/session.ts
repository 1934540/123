import "server-only"
import { cookies } from "next/headers"
import crypto from "crypto"
import type { SessionData } from "./types"

const COOKIE_NAME = "kzo_session"
const SECRET = process.env.SUPABASE_JWT_SECRET ?? "kzohubqr-dev-fallback-secret-change-me"
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url")
}

function encode(data: SessionData): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url")
  return `${payload}.${sign(payload)}`
}

function decode(token: string): SessionData | null {
  const [payload, sig] = token.split(".")
  if (!payload || !sig) return null
  if (sign(payload) !== sig) return null
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionData
  } catch {
    return null
  }
}

export async function createSession(data: SessionData): Promise<void> {
  const store = await cookies()
  store.set(COOKIE_NAME, encode(data), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  })
}

export async function getSession(): Promise<SessionData | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null
  return decode(token)
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}
