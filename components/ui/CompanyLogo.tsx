"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Helper para gerar o URL otimizado do Next.js sem usar o componente pesado <Image>.
 * O componente <Image> injetado repetidas vezes (ex: marquees) destroi o Main Thread
 * devido aos Observers nativos do React.
 */
export function getOptimizedUrl(src: string, size: number) {
  // Devido ao limite do plano gratuito do Vercel ter sido atingido (Erro 402), 
  // bypassamos a otimização de imagens e servimos a imagem original diretamente.
  return src;
}

/**
 * CompanyLogo — o único sítio onde logos de empresas são renderizados.
 * Fundo neutro subtil (nunca caixa branca forçada): logos transparentes
 * assentam no neutro em light e dark; logos do Finnhub com fundo branco
 * embutido ficam como vêm (CSS não remove fundo opaco).
 * Fallback: primeira letra do ticker quando não há logo ou o load falha.
 */
export function CompanyLogo({
  src,
  alt,
  fallback,
  size = 40,
  className,
  imgClassName,
}: {
  src?: string | null
  alt: string
  /** texto de recurso (normalmente o ticker) — usa-se a 1.ª letra */
  fallback: string
  /** lado do quadrado em px */
  size?: number
  className?: string
  imgClassName?: string
}) {
  const [errored, setErrored] = React.useState(false)
  const showImage = !!src && !errored
  const letter = (fallback || alt || "?").charAt(0).toUpperCase()

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/50",
        showImage ? "bg-muted/40" : "bg-primary/10",
        className
      )}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={getOptimizedUrl(src, size)}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setErrored(true)}
          className={cn("h-full w-full object-contain p-1", imgClassName)}
        />
      ) : (
        <span
          aria-hidden
          className="font-bold text-primary"
          style={{ fontSize: Math.max(10, Math.round(size * 0.45)) }}
        >
          {letter}
        </span>
      )}
    </div>
  )
}
