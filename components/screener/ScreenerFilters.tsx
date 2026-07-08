"use client"

import { useTranslations } from "next-intl"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchCode, Castle, FlaskConical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export type ScreenerFiltersType = {
  sector: string
  minGrossMargin: number
  minRoic: number
  minRevenue: number
  minEarningsYield: number
}

interface ScreenerFiltersProps {
  filters: ScreenerFiltersType
  onChange: (filters: ScreenerFiltersType) => void
}

const SECTORS = [
  "ALL",
  "Information Technology",
  "Health Care",
  "Financials",
  "Consumer Discretionary",
  "Communication Services",
  "Industrials",
  "Consumer Staples",
  "Energy",
  "Utilities",
  "Real Estate",
  "Materials",
]

export function ScreenerFilters({ filters, onChange }: ScreenerFiltersProps) {
  const t = useTranslations("screener")

  const handleSliderChange = (key: keyof ScreenerFiltersType, value: number | readonly number[]) => {
    const numValue = Array.isArray(value) || typeof value === 'object' ? value[0] : value;
    onChange({ ...filters, [key]: numValue })
  }

  const handleSectorChange = (value: string | null) => {
    onChange({ ...filters, sector: value || "ALL" })
  }

  return (
    <div className="flex flex-col gap-6 p-6 rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 mb-2">
        <SearchCode className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-lg">{t("filters.title")}</h2>
      </div>

      <div className="space-y-3 pb-4 border-b border-border">
        <Label className="text-muted-foreground">{t("filters.guruStrategies")}</Label>
        <TooltipProvider>
          <div className="space-y-2">
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 bg-primary/5 hover:bg-primary/10 hover:text-primary transition-colors border-primary/20"
                  onClick={() => onChange({
                    ...filters,
                    minGrossMargin: 0.4,
                    minRoic: 0.15,
                  })}
                >
                  <Castle className="h-4 w-4 text-primary" />
                  {t("filters.moatCompounders")}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="max-w-[200px] text-xs">{t("filters.moatTooltip")}</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 bg-primary/5 hover:bg-primary/10 hover:text-primary transition-colors border-primary/20"
                  onClick={() => onChange({
                    ...filters,
                    minGrossMargin: 0,
                    minRoic: 0.20,
                    minEarningsYield: 0.05,
                  })}
                >
                  <FlaskConical className="h-4 w-4 text-primary" />
                  {t("filters.magicFormula")}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="max-w-[200px] text-xs">{t("filters.magicTooltip")}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t("filters.sector")}</Label>
          <Select value={filters.sector} onValueChange={handleSectorChange}>
            <SelectTrigger>
              <SelectValue placeholder={t("filters.sectorPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {SECTORS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "ALL" ? t("filters.allSectors") : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3 pt-2">
          <div className="flex justify-between">
            <Label>{t("filters.minGrossMargin")}</Label>
            <span className="text-sm text-muted-foreground">{(filters.minGrossMargin * 100).toFixed(0)}%</span>
          </div>
          <Slider
            value={[filters.minGrossMargin]}
            onValueChange={(val) => handleSliderChange("minGrossMargin", val)}
            max={1}
            step={0.05}
          />
        </div>

        <div className="space-y-3 pt-2">
          <div className="flex justify-between">
            <Label>{t("filters.minRoic")}</Label>
            <span className="text-sm text-muted-foreground">{(filters.minRoic * 100).toFixed(0)}%</span>
          </div>
          <Slider
            value={[filters.minRoic]}
            onValueChange={(val) => handleSliderChange("minRoic", val)}
            max={0.5}
            step={0.01}
          />
        </div>

        <div className="space-y-3 pt-2">
          <div className="flex justify-between">
            <Label>{t("filters.minEarningsYield")} <span className="text-xs text-muted-foreground ml-1">(Em Teste)</span></Label>
            <span className="text-sm text-muted-foreground">{(filters.minEarningsYield * 100).toFixed(0)}%</span>
          </div>
          <Slider
            value={[filters.minEarningsYield]}
            onValueChange={(val) => handleSliderChange("minEarningsYield", val)}
            max={0.25}
            step={0.01}
          />
        </div>

        <div className="space-y-3 pt-2">
          <div className="flex justify-between">
            <Label>{t("filters.minRevenue")}</Label>
            <span className="text-sm text-muted-foreground">
              {filters.minRevenue === 0 ? "0" : `$${(filters.minRevenue / 1e9).toFixed(0)}B`}
            </span>
          </div>
          <Slider
            value={[filters.minRevenue]}
            onValueChange={(val) => handleSliderChange("minRevenue", val)}
            max={100_000_000_000}
            step={1_000_000_000}
          />
        </div>
      </div>
    </div>
  )
}
