"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Upload, Link2, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Trading212Connection } from "./Trading212Connection"

interface PortfolioManageBarProps {
  onImportClick: () => void
  onSynced: () => void
}

export function PortfolioManageBar({ onImportClick, onSynced }: PortfolioManageBarProps) {
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
        </div>
      )}
    </div>
  )
}
