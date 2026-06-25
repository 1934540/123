import { NextResponse } from "next/server"
import { isCronRequestAuthorized } from "@/lib/cron-auth"
import { appDateString } from "@/lib/date"
import { formatDuration } from "@/lib/geo"
import { getAdminClient } from "@/lib/supabase/admin"
import { appTimeParts, AUTO_CLOSED_STATUS, isAfterWorkEnd, isWorkday } from "@/lib/work-schedule"

type OpenAttendanceLog = {
  id: string
  check_in_time: string | null
}

export async function GET(req: Request): Promise<Response> {
  if (!isCronRequestAuthorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const now = new Date()
  const { weekday, hour, minute } = appTimeParts(now)
  const today = appDateString(now)

  if (!isWorkday(weekday)) {
    return NextResponse.json({ success: true, skipped: true, reason: "weekend", date: today })
  }

  if (!isAfterWorkEnd(hour, minute)) {
    return NextResponse.json({ success: true, skipped: true, reason: "before_work_end", date: today })
  }

  const supabase = getAdminClient()
  const { data: openLogs, error } = await supabase
    .from("attendance_logs")
    .select("id, check_in_time")
    .eq("date", today)
    .is("check_out_time", null)

  if (error) {
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 })
  }

  const logs = (openLogs ?? []) as OpenAttendanceLog[]
  const nowStr = now.toISOString()
  let closed = 0

  for (const log of logs) {
    const checkInMs = log.check_in_time ? new Date(log.check_in_time).getTime() : NaN
    const durationMs = Number.isNaN(checkInMs) ? 0 : Math.max(0, now.getTime() - checkInMs)
    const { error: updateError } = await supabase
      .from("attendance_logs")
      .update({
        check_out_time: nowStr,
        work_duration: formatDuration(durationMs),
        status: AUTO_CLOSED_STATUS,
        updated_at: nowStr,
      })
      .eq("id", log.id)
      .is("check_out_time", null)

    if (!updateError) closed++
  }

  return NextResponse.json({
    success: true,
    date: today,
    closed,
    message: `Закрыто автоматически: ${closed}`,
  })
}
