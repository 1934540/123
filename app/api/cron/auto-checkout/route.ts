import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Note: Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in env
export async function GET(req: Request) {
  // Simple check for authorization header if you want to secure the cron
  const authHeader = req.headers.get("authorization")
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase configuration missing" }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const today = new Date().toISOString().slice(0, 10)
  const nowStr = new Date().toISOString()

  // Find all open attendance logs for today
  const { data: openLogs, error } = await supabase
    .from("attendance_logs")
    .select("id")
    .eq("date", today)
    .is("check_out_time", null)

  if (error || !openLogs) {
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 })
  }

  // Update them to Auto-closed
  if (openLogs.length > 0) {
    const ids = openLogs.map((log) => log.id)
    await supabase
      .from("attendance_logs")
      .update({
        check_out_time: nowStr,
        status: "Auto-closed",
        updated_at: nowStr,
      })
      .in("id", ids)
  }

  return NextResponse.json({ 
    success: true, 
    message: `Auto-closed ${openLogs.length} sessions.` 
  })
}
