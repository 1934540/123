"use client"

import { useState, useTransition } from "react"
import { LogIn, LogOut, Loader2, MapPin } from "lucide-react"
import {
  markDirectorAttendanceAction,
  type DirectorAttendanceResult,
} from "@/app/actions/director-attendance"
import { Button } from "@/components/ui/button"

type DirectorAttendanceButtonProps = {
  hasCheckedIn: boolean
  hasCheckedOut: boolean
}

export function DirectorAttendanceButton({ hasCheckedIn, hasCheckedOut }: DirectorAttendanceButtonProps) {
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function markAttendance(mode: "check_in" | "check_out") {
    startTransition(async () => {
      setMessage("Запрашиваем доступ к GPS...")
      const position = await getPosition()
      const result: DirectorAttendanceResult = await markDirectorAttendanceAction({
        mode,
        lat: position?.coords.latitude ?? null,
        lng: position?.coords.longitude ?? null,
      })
      setMessage(result.message)
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <Button
          type="button"
          onClick={() => markAttendance("check_in")}
          disabled={pending || hasCheckedIn}
          className="h-11"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Прибытие
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => markAttendance("check_out")}
          disabled={pending || !hasCheckedIn || hasCheckedOut}
          className="h-11"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          Отбытие
        </Button>
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-border bg-background/50 p-3 text-sm text-muted-foreground">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>{message ?? "При отметке браузер запросит GPS и сверит координаты с геозоной хаба."}</p>
      </div>
    </div>
  )
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
