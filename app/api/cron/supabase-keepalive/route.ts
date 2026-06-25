import { NextResponse } from "next/server"
import { isCronRequestAuthorized } from "@/lib/cron-auth"
import { getAdminClient } from "@/lib/supabase/admin"

export async function GET(req: Request): Promise<Response> {
  if (!isCronRequestAuthorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const supabase = getAdminClient()
  const { error } = await supabase.from("hubs").select("id").limit(1)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() })
}
