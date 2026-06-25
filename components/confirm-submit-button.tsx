"use client"

import type React from "react"
import { Button } from "@/components/ui/button"

type ConfirmSubmitButtonProps = React.ComponentProps<typeof Button> & {
  message: string
}

export function ConfirmSubmitButton({ message, onClick, ...props }: ConfirmSubmitButtonProps) {
  return (
    <Button
      {...props}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        if (!window.confirm(message)) event.preventDefault()
      }}
    />
  )
}
