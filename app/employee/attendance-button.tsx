"use client"

import { useState, useTransition } from "react"
import { Coffee, LogIn, LogOut, Loader2, MapPin } from "lucide-react"
import { markAttendanceAction, type AttendanceResult } from "@/app/actions/attendance"
import { toggleBreakAction, type BreakResult } from "@/app/actions/breaks"
import { Button } from "@/components/ui/button"

type AttendanceButtonProps = {
  activeBreak: boolean
  hasCheckedIn: boolean
  hasCheckedOut: boolean
}

export function AttendanceButton({ activeBreak, hasCheckedIn, hasCheckedOut }: AttendanceButtonProps) {
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function markAttendance(mode: "check_in" | "check_out") {
    startTransition(async () => {
      setMessage("Запрашиваем доступ к GPS...")
      const deviceId = getDeviceId()
      const position = await getPosition()
      const result: AttendanceResult = await markAttendanceAction({
        mode,
        deviceId,
        lat: position?.coords.latitude ?? null,
        lng: position?.coords.longitude ?? null,
      })
      setMessage(result.message)
    })
  }

  function toggleBreak() {
    startTransition(async () => {
      const result: BreakResult = await toggleBreakAction()
      setMessage(result.message)
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          onClick={() => markAttendance("check_in")}
          disabled={pending || hasCheckedIn}
          className="h-12 text-base"
        >
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
          Пришел
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => markAttendance("check_out")}
          disabled={pending || !hasCheckedIn || hasCheckedOut}
          className="h-12 text-base"
        >
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
          Ушел
        </Button>
      </div>
      <Button type="button" variant="outline" onClick={toggleBreak} disabled={pending} className="w-full">
        <Coffee className="h-4 w-4" />
        {activeBreak ? "Завершить перерыв" : "Начать перерыв"}
      </Button>
      <div className="flex items-start gap-2 rounded-lg border border-border bg-background/50 p-3 text-sm text-muted-foreground">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          {message ??
            "При нажатии браузер запросит доступ к GPS. Координаты сравниваются с рабочей зоной хаба."}
        </p>
      </div>
    </div>
  )
}

function getDeviceId(): string {
  const key = "astanahub_employee_device_id"
  const existing = window.localStorage.getItem(key)
  if (existing) return existing

  const next =
    typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  window.localStorage.setItem(key, next)
  return next
}

function getPosition(): Promise<GeolocationPosition | null> {
  if (!navigator.geolocation) return Promise.resolve(null)

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 },
    )
  })
}
