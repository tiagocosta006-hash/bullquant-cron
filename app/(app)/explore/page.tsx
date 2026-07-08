"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Search, Loader2, ArrowLeft } from "lucide-react"
import { SectorGrid } from "@/components/explore/SectorGrid"
import { IndustryList } from "@/components/explore/IndustryList"
import { CompanyCard } from "@/components/explore/CompanyCard"
import { BusinessProfileSheet } from "@/components/explore/BusinessProfileSheet"

type Facets = Record<string, { count: number; industries: Record<string, number> }>

export default function ExplorePage() {
  const t = useTranslations("explore")
  
  const [facets, setFacets] = useState<Facets | null>(null)
  const [companies, setCompanies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Estado de navegação: null (ver setores) -> sectorName (ver indústrias) -> {sector, industry} (ver empresas)
  const [selectedSector, setSelectedSector] = useState<string | null>(null)
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  
  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null)

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

  const handleCompanyClick = (company: any) => {
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
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">{t("title")}</h1>
          <p className="text-white/60 mt-1">{t("subtitle")}</p>
        </div>
        
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={handleSearch}
            className="w-full bg-black/20 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </div>
      </div>

      {/* Main Content Area */}
      {isSearching ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-white/90">Resultados da pesquisa</h2>
          {loading ? (
            <div className="flex py-12 justify-center"><Loader2 className="animate-spin text-primary" /></div>
          ) : companies.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {companies.map(c => <CompanyCard key={c.id} company={c} onClick={handleCompanyClick} />)}
            </div>
          ) : (
            <div className="p-8 text-center bg-card rounded-xl border border-white/5 text-white/50">
              Nenhuma empresa encontrada para a tua pesquisa.
            </div>
          )}
        </div>
      ) : !selectedSector ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-white/90">{t("sectorsTitle")}</h2>
          {facets && <SectorGrid sectors={facets} onSelect={setSelectedSector} />}
        </div>
      ) : !selectedIndustry ? (
        <div className="space-y-6">
          <button 
            onClick={goBackToSectors}
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} /> {t("backToSectors")}
          </button>
          
          <div>
            <h2 className="text-2xl font-semibold text-white mb-4">
              {t("industriesFor", { sector: selectedSector === "Unknown" ? "Outros" : selectedSector })}
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
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} /> {t("backToIndustries")}
          </button>
          
          <div>
            <h2 className="text-2xl font-semibold text-white mb-6">
              {t("companiesIn", { industry: selectedIndustry === "Unknown" ? "Outras Indústrias" : selectedIndustry })}
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
