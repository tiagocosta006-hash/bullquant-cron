"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Search, Loader2, ArrowLeft, Compass } from "lucide-react"
import { SectorGrid } from "@/components/explore/SectorGrid"
import { IndustryList } from "@/components/explore/IndustryList"
import { CompanyCard } from "@/components/explore/CompanyCard"
import { OthersPanel, type ExploreCompany } from "@/components/explore/OthersPanel"
import { BusinessProfileSheet } from "@/components/explore/BusinessProfileSheet"
import { PageHeader } from "@/components/layout/PageHeader"

type Facets = Record<string, { count: number; industries: Record<string, number> }>

export default function ExplorePage() {
  const t = useTranslations("explore")
  
  const [facets, setFacets] = useState<Facets | null>(null)
  const [companies, setCompanies] = useState<ExploreCompany[]>([])
  const [loading, setLoading] = useState(true)
  
  // Estado de navegação: null (ver setores) -> sectorName (ver indústrias) -> {sector, industry} (ver empresas)
  const [selectedSector, setSelectedSector] = useState<string | null>(null)
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  
  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState<ExploreCompany | null>(null)

  // Carregar facets (setores/indústrias) no início
  useEffect(() => {
    fetch("/api/explore?mode=facets")
      .then(res => res.json())
      .then(data => {
        setFacets(data.sectors)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }, [])

  // Carregar empresas quando uma indústria é selecionada ou quando há pesquisa
  useEffect(() => {
    if (searchQuery.length >= 2) {
      setLoading(true)
      fetch(`/api/explore?q=${encodeURIComponent(searchQuery)}`)
        .then(res => res.json())
        .then(data => {
          setCompanies(data.companies)
          setLoading(false)
        })
      return
    }

    if (selectedSector && selectedIndustry) {
      setLoading(true)
      fetch(`/api/explore?sector=${encodeURIComponent(selectedSector)}&industry=${encodeURIComponent(selectedIndustry)}`)
        .then(res => res.json())
        .then(data => {
          setCompanies(data.companies)
          setLoading(false)
        })
    }
  }, [selectedSector, selectedIndustry, searchQuery])

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
    if (e.target.value.length > 0) {
      setSelectedSector(null)
      setSelectedIndustry(null)
    }
  }

  const goBackToSectors = () => {
    setSelectedSector(null)
    setSelectedIndustry(null)
  }

  const goBackToIndustries = () => {
    setSelectedIndustry(null)
  }

  const handleCompanyClick = (company: ExploreCompany) => {
    setSelectedCompany(company)
    setSheetOpen(true)
  }

  if (loading && !facets && !searchQuery) {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh]">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    )
  }

  const isSearching = searchQuery.length >= 2

  return (
    <div className="space-y-8">

      {/* Header & Search */}
      <PageHeader
        icon={<Compass className="h-6 w-6" />}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <div className="glass relative w-full rounded-full md:w-96">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={handleSearch}
              className="w-full rounded-full bg-transparent pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>
        }
      />

      {/* Main Content Area */}
      {isSearching ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground/90">{t("searchResults")}</h2>
          {loading ? (
            <div className="flex py-12 justify-center"><Loader2 className="animate-spin text-primary" /></div>
          ) : companies.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {companies.map(c => <CompanyCard key={c.id} company={c} onClick={handleCompanyClick} />)}
            </div>
          ) : (
            <div className="glass p-8 text-center rounded-xl text-muted-foreground">
              {t("searchEmpty")}
            </div>
          )}
        </div>
      ) : !selectedSector ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground/90">{t("sectorsTitle")}</h2>
          {facets && <SectorGrid sectors={facets} onSelect={setSelectedSector} />}
        </div>
      ) : selectedSector === "Unknown" ? (
        <div className="space-y-6">
          <button
            onClick={goBackToSectors}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} /> {t("backToSectors")}
          </button>

          {/* "Outros" não tem indústrias genuínas — vira hub de empresas
              sem setor + multi-watchlists, em vez do fluxo indústria→empresas. */}
          <OthersPanel onCompanyClick={handleCompanyClick} />
        </div>
      ) : !selectedIndustry ? (
        <div className="space-y-6">
          <button
            onClick={goBackToSectors}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} /> {t("backToSectors")}
          </button>

          <div>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              {t("industriesFor", { sector: selectedSector })}
            </h2>
            {facets && facets[selectedSector] && (
              <IndustryList
                industries={facets[selectedSector].industries}
                onSelect={setSelectedIndustry}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <button
            onClick={goBackToIndustries}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} /> {t("backToIndustries")}
          </button>

          <div>
            <h2 className="text-2xl font-semibold text-foreground mb-6">
              {t("companiesIn", { industry: selectedIndustry === "Unknown" ? t("otherIndustries") : selectedIndustry })}
            </h2>

            {loading ? (
              <div className="flex py-12 justify-center"><Loader2 className="animate-spin text-primary" /></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {companies.map(c => <CompanyCard key={c.id} company={c} onClick={handleCompanyClick} />)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slide-over Profile Sheet */}
      <BusinessProfileSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        company={selectedCompany}
      />

    </div>
  )
}
