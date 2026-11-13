"use client"

import { useEffect, useState } from "react"
import { Combobox } from "@base-ui/react/combobox"
import { Search } from "lucide-react"
import { useTranslations } from "next-intl"
import { Label } from "@/components/ui/label"
import { useDebounce } from "@/hooks/useDebounce"

export type MicInstrument = { ticker: string; name: string }

export function MicInstrumentSearch({ value, onChange, holdings, disabled }: {
  value: MicInstrument | null
  onChange: (value: MicInstrument | null) => void
  holdings?: MicInstrument[]
  disabled: boolean
}) {
  const t = useTranslations("mic")
  const [input, setInput] = useState("")
  const query = input.trim()
  const debounced = useDebounce(query, 220)
  const [result, setResult] = useState<{ query: string; items: MicInstrument[]; error?: boolean }>()
  const search = !holdings && !value && debounced.length >= 2 && debounced === query

  useEffect(() => {
    if (!search) return
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(`/api/search?mic=1&q=${encodeURIComponent(debounced)}`, { signal: controller.signal })
        if (!response.ok) throw new Error("Search failed")
        const items: MicInstrument[] = await response.json()
        if (!controller.signal.aborted) setResult({ query: debounced, items })
      } catch {
        if (!controller.signal.aborted) setResult({ query: debounced, items: [], error: true })
      }
    }
    void load()
    return () => controller.abort()
  }, [search, debounced])

  const current = result?.query === query ? result : undefined
  const items = holdings?.filter(item => `${item.name} ${item.ticker}`.toLowerCase().includes(query.toLowerCase())) ?? current?.items ?? []

  return (
    <div className="col-span-2">
      <Label htmlFor="mic-instrument">{t("instrumentLabel")}</Label>
      <Combobox.Root items={items} filter={null} value={value} inputValue={input} disabled={disabled}
        itemToStringLabel={(item) => item.name}
        itemToStringValue={(item) => item.ticker}
        isItemEqualToValue={(a, b) => a.ticker === b.ticker}
        onValueChange={(item) => {
          onChange(item)
          setInput(item?.name ?? "")
        }}
        onInputValueChange={(text, details) => {
          if (details.reason !== "input-change" && details.reason !== "input-clear") return
          setInput(text)
          if (value) onChange(null)
        }}>
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
          <Combobox.Input id="mic-instrument" placeholder={t("instrumentPlaceholder")} maxLength={80} autoComplete="off"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={5} className="z-[70] w-(--anchor-width)">
            <Combobox.Popup className="overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
              <Combobox.Empty className="px-3 py-2 text-sm text-muted-foreground empty:hidden">
                {holdings ? t("noHeldMatches") : query.length < 2 ? t("searchHint") : !current ? t("searching") : current.error ? t("searchError") : t("noMatches")}
              </Combobox.Empty>
              <Combobox.List className="max-h-56 overflow-y-auto">
                {(item: MicInstrument) => (
                  <Combobox.Item key={item.ticker} value={item} className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm data-highlighted:bg-accent">
                    <span>{item.name}</span><span className="shrink-0 text-xs font-semibold text-muted-foreground">{item.ticker}</span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  )
}
