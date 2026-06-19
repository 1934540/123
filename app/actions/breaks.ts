"use server"

import { revalidatePath } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"
import { getSession } from "@/lib/session"
import { appDateString } from "@/lib/date"

export type BreakResult = {
  ok: boolean
  message: string
  action?: "start_break" | "end_break"
}

export async function toggleBreakAction(): Promise<BreakResult> {
  const session = await getSession()
  if (!session || session.role !== "employee" || !session.employeeId) {
    return { ok: false, message: "Сессия мерзімі бітті. Қайта кіріңіз." }
  }

  const supabase = getAdminClient()
  const today = appDateString()
  const now = new Date().toISOString()

  // Find today's attendance log
  const { data: log } = await supabase
    .from("attendance_logs")
    .select("id, check_in_time, check_out_time")
    .eq("employee_id", session.employeeId)
    .eq("date", today)
    .maybeSingle()

  if (!log) {
    return { ok: false, message: "Сіз жұмысқа келуді белгілемедіңіз." }
  }
  if (log.check_out_time) {
    return { ok: false, message: "Сіз жұмыстан кетіп қалғансыз." }
  }

  // Find active break
  const { data: activeBreak } = await supabase
    .from("breaks")
    .select("id, start_time, end_time")
    .eq("attendance_log_id", log.id)
    .is("end_time", null)
    .maybeSingle()

  if (!activeBreak) {
    // Start break
    await supabase.from("breaks").insert({
      attendance_log_id: log.id,
      start_time: now,
    })
    revalidatePath("/employee")
    return { ok: true, action: "start_break", message: "Үзіліс басталды." }
  } else {
    // End break
    await supabase
      .from("breaks")
      .update({ end_time: now })
      .eq("id", activeBreak.id)
    revalidatePath("/employee")
    return { ok: true, action: "end_break", message: "Үзіліс аяқталды." }
  }
}
