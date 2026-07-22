"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Upload, Link2, ChevronDown, PlusCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Trading212Connection } from "./Trading212Connection"
import { ManualAddSearch } from "./ManualAddSearch"

interface PortfolioManageBarProps {
  onImportClick: () => void
  onSynced: () => void
  onManualAdd: (ticker: string) => void
}

export function PortfolioManageBar({ onImportClick, onSynced, onManualAdd }: PortfolioManageBarProps) {
  const t = useTranslations("portfolio.manage")
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="glass rounded-xl">
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={isExpanded}
      >
        <span className="flex items-center gap-2">
          <Link2 className="w-4 h-4" />
          {t('title')}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          <Trading212Connection onSynced={onSynced} />
          <Button variant="outline" onClick={onImportClick} className="gap-2 w-fit">
            <Upload className="w-4 h-4" />
            {t('importCsv')}
          </Button>
          <div className="pt-1 border-t border-border/40">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <PlusCircle className="w-4 h-4" />
              {t('manualAdd')}
            </span>
            <ManualAddSearch onSelect={onManualAdd} />
          </div>
        </div>
      )}
    </div>
  )
}
