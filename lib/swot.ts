/**
 * O SWOT como deve chegar ao ecrã.
 *
 * A coluna `companies.swot` chegou a ter TRÊS formatos ao mesmo tempo, e o
 * painel do explorador só sabia ler um:
 *
 *   {forcas, fraquezas, oportunidades, ameacas}      o que aparecia
 *   {strengths, weaknesses, opportunities, threats}  invisível
 *   [{type, description}, …]                         invisível
 *
 * As duas últimas desenhavam a caixa com os quatro títulos e nada por baixo —
 * um `?.map` sobre uma chave que não existe não rende nada, e a única guarda
 * da secção era `typeof === 'object'`, que todas passam.
 *
 * Os dados foram uniformizados (ver `scripts/reparar_swot.ts`), mas a leitura
 * fica tolerante na mesma: uma ingestão futura que volte a escrever noutro
 * formato passa a aparecer em vez de desaparecer em silêncio.
 */
export type Swot = {
  forcas: string[]
  fraquezas: string[]
  oportunidades: string[]
  ameacas: string[]
}

const CATEGORIAS: Record<string, keyof Swot> = {
  forcas: "forcas", strengths: "forcas", strength: "forcas",
  fraquezas: "fraquezas", weaknesses: "fraquezas", weakness: "fraquezas",
  oportunidades: "oportunidades", opportunities: "oportunidades", opportunity: "oportunidades",
  ameacas: "ameacas", threats: "ameacas", threat: "ameacas",
}

/** Devolve null quando não há nada para mostrar — e aí não se mostra secção. */
export function lerSwot(bruto: unknown): Swot | null {
  const fora: Swot = { forcas: [], fraquezas: [], oportunidades: [], ameacas: [] }

  const juntar = (categoria: unknown, valor: unknown) => {
    const chave = CATEGORIAS[String(categoria ?? "").toLowerCase().trim()]
    if (!chave) return
    for (const v of Array.isArray(valor) ? valor : [valor]) {
      if (typeof v === "string" && v.trim()) fora[chave].push(v.trim())
    }
  }

  if (Array.isArray(bruto)) {
    for (const item of bruto) {
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>
        juntar(o.type, o.description)
      }
    }
  } else if (bruto && typeof bruto === "object") {
    for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) juntar(k, v)
  }

  return Object.values(fora).some((l) => l.length > 0) ? fora : null
}
