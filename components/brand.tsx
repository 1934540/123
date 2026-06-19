import { MapPinned } from "lucide-react"
import { cn } from "@/lib/utils"

export function Brand({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <MapPinned className="h-5 w-5" />
      </div>
      {showText && <span className="text-lg font-semibold tracking-tight">AstanaHub Employee</span>}
    </div>
  )
}
