const APP_TIME_ZONE = "Asia/Qyzylorda"

export const WORK_START_HOUR = 9
export const WORK_START_MINUTE = 0
export const WORK_END_HOUR = 18
export const WORK_END_MINUTE = 30
export const LATE_GRACE_MINUTES = 10
export const WEEKLY_GRACE_LIMIT = 2
export const GRACE_STATUS = "В пределах 10 минут"
export const LATE_STATUS = "Late"
export const ON_TIME_STATUS = "On Time"
export const AUTO_CLOSED_STATUS = "Закрыто автоматически"

export function appTimeParts(date: Date): { weekday: string; hour: number; minute: number; year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    weekday: values.weekday,
    hour: Number(values.hour),
    minute: Number(values.minute),
    year: Number(values.year),
    month: Number(values.month),
  }
}

export function isWorkday(weekday: string): boolean {
  return weekday !== "Sat" && weekday !== "Sun"
}

export function isAfterWorkEnd(hour: number, minute: number): boolean {
  return hour > WORK_END_HOUR || (hour === WORK_END_HOUR && minute >= WORK_END_MINUTE)
}

export function attendanceStatusForCheckIn(date: Date, usedWeeklyGraceCount: number): string {
  const { weekday, hour, minute } = appTimeParts(date)
  if (!isWorkday(weekday)) return ON_TIME_STATUS
  const minutes = hour * 60 + minute
  const start = WORK_START_HOUR * 60 + WORK_START_MINUTE
  const graceEnd = start + LATE_GRACE_MINUTES

  if (minutes <= start) return ON_TIME_STATUS
  if (minutes <= graceEnd && usedWeeklyGraceCount < WEEKLY_GRACE_LIMIT) return GRACE_STATUS
  return LATE_STATUS
}

export function appWeekRange(date: Date): { start: string; nextStart: string } {
  const { year, month } = appTimeParts(date)
  const localNoon = new Date(Date.UTC(year, month - 1, Number(new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
  }).format(date)), 12))
  const day = localNoon.getUTCDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(localNoon)
  monday.setUTCDate(localNoon.getUTCDate() + mondayOffset)
  const nextMonday = new Date(monday)
  nextMonday.setUTCDate(monday.getUTCDate() + 7)
  const start = monday.toISOString().slice(0, 10)
  const nextStart = nextMonday.toISOString().slice(0, 10)
  return { start, nextStart }
}
