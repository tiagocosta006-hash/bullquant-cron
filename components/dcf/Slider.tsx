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

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <span className="text-sm font-bold tabular-nums text-primary">{display(clampedValue)}</span>
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
