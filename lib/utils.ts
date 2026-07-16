import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Iniciais para avatares: 2 letras do nome ("Alex Martins" → "AM"),
 * com fallback para a 1.ª letra do email quando não há nome.
 */
export function userInitials(name: string | null | undefined, email?: string) {
  const source = (name || "").trim()
  if (source) {
    const parts = source.split(/\s+/)
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase()
  }
  return (email?.charAt(0) ?? "?").toUpperCase()
}
