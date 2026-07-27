import { useTranslations } from "next-intl"
import { LayoutGrid, List } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { SortKey, ViewMode } from "./types"

interface PortfolioToolbarProps {
  sortKey: SortKey
  onSortKeyChange: (key: SortKey) => void
  sectorFilter: string
  onSectorFilterChange: (sector: string) => void
  sectors: string[]
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export function PortfolioToolbar({
  sortKey,
  onSortKeyChange,
  sectorFilter,
  onSectorFilterChange,
  sectors,
  viewMode,
  onViewModeChange,
}: PortfolioToolbarProps) {
  const t = useTranslations("portfolio")

  const sortLabels: Record<SortKey, string> = {
    addedAt: t('toolbar.sort.addedAt'),
    name: t('toolbar.sort.name'),
    changePercent: t('toolbar.sort.changePercent'),
    sector: t('toolbar.sort.sector'),
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={sortKey} onValueChange={(value) => value && onSortKeyChange(value as SortKey)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t('toolbar.sortBy')}>
              {(value: SortKey | null) => value ? sortLabels[value] : t('toolbar.sortBy')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="addedAt">{t('toolbar.sort.addedAt')}</SelectItem>
            <SelectItem value="name">{t('toolbar.sort.name')}</SelectItem>
            <SelectItem value="changePercent">{t('toolbar.sort.changePercent')}</SelectItem>
            <SelectItem value="sector">{t('toolbar.sort.sector')}</SelectItem>
          </SelectContent>
        </Select>

        {sectors.length > 0 && (
          <Select value={sectorFilter} onValueChange={(value) => value && onSectorFilterChange(value)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('toolbar.allSectors')}>
                {(value: string | null) => !value || value === "ALL" ? t('toolbar.allSectors') : value}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('toolbar.allSectors')}</SelectItem>
              {sectors.map(sector => (
                <SelectItem key={sector} value={sector}>{sector}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex items-center gap-1 bg-muted/50 border border-border/60 rounded-lg p-1 self-start sm:self-auto">
        <button
          type="button"
          onClick={() => onViewModeChange("grid")}
          aria-label={t('toolbar.gridView')}
          aria-pressed={viewMode === "grid"}
          className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange("table")}
          aria-label={t('toolbar.tableView')}
          aria-pressed={viewMode === "table"}
          className={`p-1.5 rounded-md transition-colors ${viewMode === "table" ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <List className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
