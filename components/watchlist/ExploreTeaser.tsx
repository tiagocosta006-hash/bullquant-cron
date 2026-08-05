"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { SectorGrid } from "@/components/explore/SectorGrid"

type Facets = Record<string, { count: number; industries: Record<string, number> }>

/** Preview real do /explore (não decorativo) na watchlist vazia: reutiliza o
 *  SectorGrid com dados em vivo do /api/explore, para a página não ficar
 *  reduzida a um cartão pequeno a meio de um ecrã vazio. Clicar num setor
 *  leva a /explore?sector=... já pré-selecionado (ver ExplorePage). */
export function ExploreTeaser() {
  const t = useTranslations("watchlist.explorePreview")
  const router = useRouter()
  const [facets, setFacets] = useState<Facets | null>(null)

  useEffect(() => {
    fetch("/api/explore?mode=facets")
      .then((res) => res.json())
      .then((data) => setFacets(data.sectors))
      .catch((err) => console.error("Failed to fetch explore facets", err))
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-semibold text-foreground/90">{t("title")}</h3>
        <Link
          href="/explore"
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t("viewAll")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {facets ? (
        <SectorGrid
          sectors={facets}
          onSelect={(sector) => router.push(`/explore?sector=${encodeURIComponent(sector)}`)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass h-[152px] animate-pulse rounded-xl" />
          ))}
        </div>
      )}
    </div>
  )
}
