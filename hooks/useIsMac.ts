import { useEffect, useState } from "react"

/**
 * Deteta se o utilizador está em macOS (para trocar ⌘ por Ctrl nos atalhos).
 * Começa em `false` (SSR-safe) e atualiza após montar no cliente.
 */
export function useIsMac() {
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    const platform = (navigator as any).userAgentData?.platform ?? navigator.platform ?? ""
    setIsMac(/mac/i.test(platform))
  }, [])

  return isMac
}
