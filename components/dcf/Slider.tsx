"use client"

import * as React from "react"

interface SliderProps {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  /** formata o valor mostrado à direita do label (ex: "10.0%") */
  display: (value: number) => string
  /** tooltip/ajuda opcional sob o label */
  hint?: string
}

export function Slider({ label, value, onChange, min, max, step, display, hint }: SliderProps) {
  // Se o valor vier fora do range (ex: Reverse DCF a devolver um crescimento
  // implícito extremo), o <input type="range"> nativo prende o cursor visual
  // num extremo mas continua a receber o valor real — clamamos aqui para que
  // o cursor e o texto mostrado nunca discordem.
  const clampedValue = Math.min(max, Math.max(min, value))
  // posição do preenchimento (0-100%) para o gradiente da track
  const pct = max > min ? ((clampedValue - min) / (max - min)) * 100 : 0

  // Edição inline do valor: clicar no número abre um input para escrever um
  // valor exato — clamped ao range mas SEM snap ao step do slider.
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState("")

  const startEditing = () => {
    setDraft(String(clampedValue))
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const parsed = Number.parseFloat(draft.replace(",", "."))
    if (Number.isNaN(parsed)) return
    onChange(Math.min(max, Math.max(min, parsed)))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {editing ? (
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit()
              if (e.key === "Escape") setEditing(false)
            }}
            onFocus={(e) => e.target.select()}
            autoFocus
            aria-label={label}
            className="w-20 bg-transparent text-right text-sm font-bold tabular-nums text-primary border-b border-primary/40 outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            title={`${label}: ${display(clampedValue)}`}
            className="cursor-text rounded-sm text-sm font-bold tabular-nums text-primary underline-offset-4 hover:underline decoration-primary/40 decoration-dashed focus-visible:underline outline-none"
          >
            {display(clampedValue)}
          </button>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={clampedValue}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="dcf-slider w-full"
        style={{
          background: `linear-gradient(to right, var(--primary) ${pct}%, var(--muted) ${pct}%)`,
        }}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
