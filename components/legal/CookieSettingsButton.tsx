"use client"

import { EVENTO_DEFINICOES_COOKIES } from "@/lib/legal/cookiePrefs"

export function CookieSettingsButton({ label, className }: { label: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(EVENTO_DEFINICOES_COOKIES))}>
      {label}
    </button>
  )
}
