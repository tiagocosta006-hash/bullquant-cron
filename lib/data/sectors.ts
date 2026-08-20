export const SECTORS = [
  { slug: "financials", name: "Financials", pt: "Finanças", en: "Financials" },
  { slug: "utilities", name: "Utilities", pt: "Serviços Públicos (Utilities)", en: "Utilities" },
  { slug: "materials", name: "Materials", pt: "Materiais Básicos", en: "Materials" },
  { slug: "health-care", name: "Health Care", pt: "Saúde", en: "Healthcare" },
  { slug: "consumer-discretionary", name: "Consumer Discretionary", pt: "Consumo Discricionário", en: "Consumer Discretionary" },
  { slug: "consumer-staples", name: "Consumer Staples", pt: "Bens de Consumo Essenciais", en: "Consumer Staples" },
  { slug: "information-technology", name: "Information Technology", pt: "Tecnologia", en: "Technology" },
  { slug: "industrials", name: "Industrials", pt: "Indústria", en: "Industrials" },
  { slug: "energy", name: "Energy", pt: "Energia", en: "Energy" },
  { slug: "real-estate", name: "Real Estate", pt: "Imobiliário", en: "Real Estate" },
  { slug: "communication-services", name: "Communication Services", pt: "Serviços de Comunicação", en: "Communication Services" },
] as const;

export type SectorSlug = typeof SECTORS[number]["slug"];

export function getSectorBySlug(slug: string) {
  return SECTORS.find((s) => s.slug === slug);
}

export function getSectorNameBySlug(slug: string): string | undefined {
  return SECTORS.find((s) => s.slug === slug)?.name;
}

export function getLocalizedSectorName(slug: string, locale: string): string {
  const sector = SECTORS.find((s) => s.slug === slug);
  if (!sector) return slug;
  return locale === "pt" ? sector.pt : sector.en;
}

export function getSectorSlugByName(name: string): string | undefined {
  return SECTORS.find((s) => s.name === name)?.slug;
}

