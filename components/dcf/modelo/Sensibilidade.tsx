"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Info } from "lucide-react"
import {
  grelhaWaccG, grelhaWaccMultiplo, grelhaCrescimentoMargem, intervaloGrelha, projetar, avaliar, valorEsperado,
  NOMES_CENARIOS, type Grelha, type ContextoSensibilidade, type BarraFootball, type NomeCenario,
} from "@/lib/finance/modelo"
import type { ContextoSeparador } from "./Separadores"
import { useFormatos } from "./TabelaModelo"

/**
 * Bloco 6 do modelo FMVA: Sensitivity. Duas tabelas (WACC × g e crescimento ×
 * margem), cenários Bear/Base/Bull com probabilidade, e o football field que
 * junta os intervalos contra o preço atual. Cada número é o modelo inteiro a
 * correr outra vez com os pressupostos deslocados.
 */

function Cartao({ titulo, ajuda, children }: { titulo: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {ajuda && <span title={ajuda} className="cursor-help text-muted-foreground/60 hover:text-muted-foreground"><Info className="h-3.5 w-3.5" /></span>}
      </div>
      {children}
    </section>
  )
}

function Tabela({
  g, rotuloLinha, rotuloColuna, base, formatoLinha, formatoColuna, preco,
}: {
  g: Grelha
  rotuloLinha: string
  rotuloColuna: string
  /** Valores do analista no eixo das linhas e das colunas (os deslocamentos somam-se a estes). */
  base: { linha: number; coluna: number }
  formatoLinha: (v: number) => string
  formatoColuna: (v: number) => string
  preco: number
}) {
  const { fmt } = useFormatos()
  const meio = Math.floor(g.linhas.length / 2)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-0.5 text-xs tabular-nums">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left text-[11px] font-medium text-muted-foreground">{rotuloLinha} ↓ / {rotuloColuna} →</th>
            {g.colunas.map((dc, j) => (
              <th key={j} className={`px-2 py-1 text-right text-xs font-semibold ${j === meio ? "text-primary" : "text-muted-foreground"}`}>
                {formatoColuna(base.coluna + dc)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {g.linhas.map((dl, i) => (
            <tr key={i}>
              <th className={`px-2 py-1 text-right text-xs font-semibold ${i === meio ? "text-primary" : "text-muted-foreground"}`}>
                {formatoLinha(base.linha + dl)}
              </th>
              {g.valores[i].map((v, j) => {
                const centro = i === meio && j === meio
                const acima = v !== null && preco > 0 && v >= preco
                return (
                  <td key={j}
                    className={`rounded px-2 py-1 text-right ${v === null ? "text-muted-foreground/50" : acima ? "bg-bull/10 text-bull" : "bg-bear/10 text-bear"} ${centro ? "font-bold ring-1 ring-primary" : ""}`}>
                    {v === null ? "N/A" : `$${fmt(v, "anos")}`}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FootballField({ barras, preco, valor }: { barras: BarraFootball[]; preco: number; valor: number }) {
  const t = useTranslations("dcfModelo.sensibilidade")
  const { fmt } = useFormatos()
  if (barras.length === 0) return null
  const todos = [...barras.flatMap((b) => [b.min, b.max]), preco, valor].filter((x) => Number.isFinite(x))
  const lo = Math.max(0, Math.min(...todos) * 0.9)
  const hi = Math.max(...todos) * 1.05
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`
  // Sem rótulos nas linhas: com o preço e o modelo próximos sobrepunham-se.
  // A legenda por baixo diz qual é qual.
  const linha = (v: number, cor: string) => (
    <div className="pointer-events-none absolute bottom-0 top-0 z-10" style={{ left: pos(v) }}>
      <div className={`h-full w-0.5 ${cor}`} />
    </div>
  )
  return (
    <div className="space-y-2">
      <div className="relative space-y-2">
        {barras.map((b) => (
          <div key={b.chave} className="grid grid-cols-[9rem_1fr] items-center gap-3 text-xs">
            <span className="text-muted-foreground">{t(`barras.${b.chave}`)}</span>
            <div className="relative h-6 rounded bg-muted/40">
              <div className="absolute top-1 h-4 rounded bg-primary/30" style={{ left: pos(b.min), width: `calc(${pos(b.max)} - ${pos(b.min)})` }} />
              {b.ponto !== null && <div className="absolute top-0.5 h-5 w-0.5 bg-primary/60" style={{ left: pos(b.ponto) }} />}
              <span className="absolute left-1 top-1/2 -translate-y-1/2 tabular-nums" style={{ left: `max(0.25rem, calc(${pos(b.min)} - 3rem))` }}>${fmt(b.min, "anos")}</span>
              <span className="absolute top-1/2 -translate-y-1/2 tabular-nums" style={{ left: `calc(${pos(b.max)} + 0.4rem)` }}>${fmt(b.max, "anos")}</span>
            </div>
          </div>
        ))}
        <div className="pointer-events-none absolute inset-y-0 left-[9.75rem] right-0">
          <div className="relative h-full">
            {linha(preco, "bg-foreground/70")}
            {linha(valor, "bg-primary")}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 pl-[9.75rem] text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-0.5 bg-foreground/70" />{t("preco")}: <b className="text-foreground">${fmt(preco, "anos")}</b></span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-0.5 bg-primary" />{t("modelo")}: <b className="text-primary">${fmt(valor, "anos")}</b></span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-0.5 bg-primary/60" />{t("pontoBarra")}</span>
      </div>
    </div>
  )
}

export function SeparadorSensibilidade({ c }: { c: ContextoSeparador }) {
  const t = useTranslations("dcfModelo.sensibilidade")
  const tc = useTranslations("dcfModelo.cenario")
  const { fmt, ler, paraInput } = useFormatos()

  const ctx: ContextoSensibilidade | null = React.useMemo(() => {
    const base = c.historico[c.historico.length - 1]
    if (!base) return null
    return { base, pressupostos: c.pressupostos, mercado: c.mercado, f: c.fracaoAno1, d0: c.anosAteFimAno1 }
  }, [c.historico, c.pressupostos, c.mercado, c.fracaoAno1, c.anosAteFimAno1])

  // As tabelas de sensibilidade são do cenário ativo.
  const calculo = React.useMemo(() => {
    if (!ctx) return null
    // A tabela da WACC acompanha o método do valor terminal: com o exit multiple
    // o g não entra no valor, por isso cruza-se a WACC com o múltiplo.
    const metodo = ctx.pressupostos.avaliacao.metodoTerminal
    const waccG = metodo !== "multiplo" ? grelhaWaccG(ctx) : null
    const waccMultiplo = metodo !== "gordon" ? grelhaWaccMultiplo(ctx) : null
    const crescMargem = grelhaCrescimentoMargem(ctx)
    return { waccG, waccMultiplo, crescMargem }
  }, [ctx])

  // Cada cenário corre o modelo inteiro com os SEUS pressupostos.
  const cenarios = React.useMemo(() => {
    if (!ctx) return null
    const receitaBase = ctx.base.revenue ?? 0
    const linhas = NOMES_CENARIOS.map((nome) => {
      const p = c.conjunto.cenarios[nome]
      const proj = projetar(ctx.base, p)
      const { avaliacao } = avaliar(proj, p.avaliacao, ctx.mercado, ctx.f, ctx.d0)
      const ult = proj[proj.length - 1]
      return {
        nome,
        valor: avaliacao.valido ? avaliacao.valorPorAcao : null,
        cagr: receitaBase > 0 && ult ? Math.pow(ult.receita / receitaBase, 1 / proj.length) - 1 : null,
        margemIni: p.drivers.margemEbit[0], margemFim: p.drivers.margemEbit[p.drivers.margemEbit.length - 1],
        wacc: avaliacao.wacc.wacc,
        metodo: p.avaliacao.metodoTerminal, g: p.avaliacao.g, multiplo: p.avaliacao.multiploSaida,
      }
    })
    const valores = Object.fromEntries(linhas.map((x) => [x.nome, x.valor])) as Record<NomeCenario, number | null>
    return { linhas, esperado: valorEsperado(valores, c.conjunto.probabilidades) }
  }, [ctx, c.conjunto])

  if (!ctx || !calculo || !cenarios || !c.avaliacao.valido) return <p className="text-sm text-muted-foreground">{t("semModelo")}</p>

  const a = c.pressupostos.avaliacao
  const preco = c.mercado.preco
  const { waccG, waccMultiplo, crescMargem } = calculo
  const pct = (v: number) => fmt(v, "pct")
  const pp = (v: number) => `${v >= 0 ? "+" : ""}${fmt(v * 100, "anos")} pp`
  const somaProb = NOMES_CENARIOS.reduce((s, n) => s + c.conjunto.probabilidades[n], 0)
  const somaOk = Math.abs(somaProb - 1) < 0.0005

  const barras: BarraFootball[] = []
  const r1 = waccG && intervaloGrelha(waccG)
  if (r1) barras.push({ chave: "waccG", ...r1, ponto: c.avaliacao.valorPorAcao })
  const r1m = waccMultiplo && intervaloGrelha(waccMultiplo)
  if (r1m) barras.push({ chave: "waccMultiplo", ...r1m, ponto: c.avaliacao.valorPorAcao })
  const r2 = intervaloGrelha(crescMargem)
  if (r2) barras.push({ chave: "crescMargem", ...r2, ponto: c.avaliacao.valorPorAcao })
  const vs = cenarios.linhas.map((x) => x.valor).filter((x): x is number => x !== null)
  if (vs.length >= 2) barras.push({ chave: "cenarios", min: Math.min(...vs), max: Math.max(...vs), ponto: cenarios.esperado })

  const mudarProb = (nome: NomeCenario, texto: string) => {
    const v = ler(texto, "pct")
    if (v === null || v < 0 || v > 1) return
    c.onProbabilidade(nome, v)
  }
  const potencial = (v: number | null) => (v === null || preco <= 0 ? "N/A" : `${v >= preco ? "+" : ""}${pct(v / preco - 1)}`)
  const corPot = (v: number | null) => (v !== null && v >= preco ? "text-bull" : "text-bear")

  return (
    <div className="glass space-y-6 rounded-xl px-5 py-4">
      <Cartao titulo={t("cenarios.titulo")} ajuda={t("cenarios.ajuda")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs tabular-nums">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 text-left font-medium">{t("cenarios.cenario")}</th>
                <th className="py-1 text-right font-medium">{t("cenarios.cagr")}</th>
                <th className="py-1 text-right font-medium">{t("cenarios.margem")}</th>
                <th className="py-1 text-right font-medium">WACC</th>
                <th className="py-1 text-right font-medium">{t("cenarios.terminal")}</th>
                <th className="py-1 text-right font-medium">{t("cenarios.valor")}</th>
                <th className="py-1 text-right font-medium">{t("cenarios.potencial")}</th>
                <th className="py-1 text-right font-medium">{t("cenarios.probabilidade")}</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {cenarios.linhas.map((x) => (
                <tr key={x.nome} className={`border-t border-border/50 ${x.nome === c.cenario ? "bg-primary/5" : ""}`}>
                  <td className="py-1.5 font-semibold">{tc(`nomes.${x.nome}`)}{x.nome === c.cenario && <span className="ml-1.5 text-[10px] font-normal text-primary">{t("cenarios.aEditar")}</span>}</td>
                  <td className="py-1.5 text-right">{x.cagr === null ? "N/A" : pct(x.cagr)}</td>
                  <td className="py-1.5 text-right">{pct(x.margemIni)} → {pct(x.margemFim)}</td>
                  <td className="py-1.5 text-right">{pct(x.wacc)}</td>
                  <td className="py-1.5 text-right">
                    {x.metodo === "gordon" ? `g ${pct(x.g)}` : x.metodo === "multiplo" ? fmt(x.multiplo, "x") : `g ${pct(x.g)} · ${fmt(x.multiplo, "x")}`}
                  </td>
                  <td className="py-1.5 text-right font-semibold">{x.valor === null ? "N/A" : `$${fmt(x.valor, "anos")}`}</td>
                  <td className={`py-1.5 text-right ${corPot(x.valor)}`}>{potencial(x.valor)}</td>
                  <td className="py-1.5 text-right">
                    <input key={c.conjunto.probabilidades[x.nome]} defaultValue={paraInput(c.conjunto.probabilidades[x.nome], "pct")} inputMode="decimal"
                      aria-label={`${tc(`nomes.${x.nome}`)} ${t("cenarios.probabilidade")}`}
                      onBlur={(e) => mudarProb(x.nome, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      className="w-14 rounded border border-primary/30 bg-primary/5 px-2 py-0.5 text-right font-medium text-primary outline-none focus:border-primary" />
                    <span className="ml-1 text-muted-foreground">%</span>
                  </td>
                  <td className="py-1.5 pl-3 text-right whitespace-nowrap">
                    {x.nome !== "base" && (
                      <button type="button" onClick={() => c.derivarDoBase(x.nome)} title={t("cenarios.derivarAjuda")}
                        className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground">↺ {t("cenarios.derivar")}</button>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-border/60 font-semibold">
                <td className="py-1.5" colSpan={5}>{t("cenarios.esperado")}</td>
                <td className="py-1.5 text-right text-primary">{cenarios.esperado === null ? "N/A" : `$${fmt(cenarios.esperado, "anos")}`}</td>
                <td className={`py-1.5 text-right ${corPot(cenarios.esperado)}`}>{potencial(cenarios.esperado)}</td>
                <td className={`py-1.5 text-right ${somaOk ? "" : "text-amber-500"}`}>{pct(somaProb)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        {!somaOk && <p className="text-xs text-amber-500">{t("cenarios.somaAviso", { soma: pct(somaProb) })}</p>}
      </Cartao>

      <p className="border-t border-border/60 pt-4 text-xs text-muted-foreground">{t("doCenario", { cenario: tc(`nomes.${c.cenario}`) })}</p>
      <div className="grid gap-6 xl:grid-cols-2">
      {waccG && (
        <Cartao titulo={t("waccG.titulo")} ajuda={t("waccG.ajuda")}>
          <Tabela g={waccG} rotuloLinha="WACC" rotuloColuna={t("waccG.g")} preco={preco}
            base={{ linha: c.avaliacao.wacc.wacc, coluna: a.g }} formatoLinha={pct} formatoColuna={pct} />
        </Cartao>
      )}
      {waccMultiplo && (
        <Cartao titulo={t("waccMultiplo.titulo")} ajuda={t("waccMultiplo.ajuda")}>
          <Tabela g={waccMultiplo} rotuloLinha="WACC" rotuloColuna={t("waccMultiplo.multiplo")} preco={preco}
            base={{ linha: c.avaliacao.wacc.wacc, coluna: a.multiploSaida }} formatoLinha={pct} formatoColuna={(v) => fmt(v, "x")} />
        </Cartao>
      )}

      <Cartao titulo={t("crescMargem.titulo")} ajuda={t("crescMargem.ajuda")}>
        <Tabela g={crescMargem} rotuloLinha={t("crescMargem.crescimento")} rotuloColuna={t("crescMargem.margem")} preco={preco}
          base={{ linha: 0, coluna: 0 }} formatoLinha={pp} formatoColuna={pp} />
      </Cartao>
      </div>

      <Cartao titulo={t("football.titulo")} ajuda={t("football.ajuda")}>
        <FootballField barras={barras} preco={preco} valor={c.avaliacao.valorPorAcao} />
      </Cartao>
    </div>
  )
}
