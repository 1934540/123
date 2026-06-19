import "server-only"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let cached: SupabaseClient | null = null

/**
 * Server-only Supabase client using the service role key.
 * AstanaHub Employee uses its own username/password auth (users + employees tables),
 * so all data access happens server-side with the service role and is
 * authorized by our own session logic. The key is never exposed to clients.
 */
export function getAdminClient(): SupabaseClient {
  if (cached) return cached

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables")
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
