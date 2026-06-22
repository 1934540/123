import crypto from "node:crypto"
import type { SessionData } from "@/lib/types"

const SECRET = process.env.SUPABASE_JWT_SECRET ?? "astanahub-employee-dev-fallback-secret-change-me"

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url")
}

export function createMobileToken(data: SessionData): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url")
  return `${payload}.${sign(payload)}`
}

export function verifyMobileToken(authHeader: string | null): SessionData | null {
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
  if (!token) return null

  const [payload, sig] = token.split(".")
  if (!payload || !sig || sign(payload) !== sig) return null

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionData
  } catch {
    return null
  }
}
