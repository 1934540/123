import "server-only"
import crypto from "crypto"

const PREFIX = "scrypt"
const KEY_LENGTH = 64

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("base64url")
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString("base64url")
  return `${PREFIX}$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false

  if (!stored.startsWith(`${PREFIX}$`)) {
    return stored === password
  }

  const [, salt, hash] = stored.split("$")
  if (!salt || !hash) return false

  const expected = Buffer.from(hash, "base64url")
  const actual = crypto.scryptSync(password, salt, expected.length)

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}
