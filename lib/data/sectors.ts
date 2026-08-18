export const SECTORS = [
  { slug: "financials", name: "Financials" },
  { slug: "utilities", name: "Utilities" },
  { slug: "materials", name: "Materials" },
  { slug: "health-care", name: "Health Care" },
  { slug: "consumer-discretionary", name: "Consumer Discretionary" },
  { slug: "consumer-staples", name: "Consumer Staples" },
  { slug: "information-technology", name: "Information Technology" },
  { slug: "industrials", name: "Industrials" },
  { slug: "energy", name: "Energy" },
  { slug: "real-estate", name: "Real Estate" },
  { slug: "communication-services", name: "Communication Services" },
] as const;

export type SectorSlug = typeof SECTORS[number]["slug"];

export function getSectorNameBySlug(slug: string): string | undefined {
  return SECTORS.find((s) => s.slug === slug)?.name;
}

export function getSectorSlugByName(name: string): string | undefined {
  return SECTORS.find((s) => s.name === name)?.slug;
}
