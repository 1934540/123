export function isCronRequestAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true

  const authHeader = req.headers.get("authorization")
  if (authHeader === `Bearer ${secret}`) return true

  const userAgent = req.headers.get("user-agent") ?? ""
  return userAgent.toLowerCase().includes("vercel-cron")
}
