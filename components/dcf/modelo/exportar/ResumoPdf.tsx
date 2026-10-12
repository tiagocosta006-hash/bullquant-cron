import React from "react"
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { correrCenarios } from "@/lib/finance/modelo"
import type { ContextoSeparador } from "../Separadores"

/**
 * Resumo do modelo em PDF (A4): resultado, cenários, pressupostos principais,
 * projeção do FCFF, ponte EV → valor por ação, tese e aviso legal. Todos os
 * números vêm do mesmo cálculo que o ecrã.
 */

type T = (chave: string, valores?: Record<string, string | number>) => string
type Fmt = (v: number | null | undefined, formato: "m" | "pct" | "x" | "anos") => string

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 9, color: "#18181b" },
  cab: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#1f6f54", paddingBottom: 8, marginBottom: 12 },
  titulo: { fontSize: 18, fontWeight: "bold" },
  sub: { fontSize: 9, color: "#71717a", marginTop: 2 },
  marca: { fontSize: 9, color: "#1f6f54", fontWeight: "bold", textAlign: "right" },
  kpis: { flexDirection: "row", gap: 8, marginBottom: 12 },
  kpi: { flex: 1, borderWidth: 1, borderColor: "#e4e4e7", borderRadius: 4, padding: 8 },
  kpiR: { fontSize: 7, color: "#71717a", textTransform: "uppercase", marginBottom: 3 },
  kpiV: { fontSize: 15, fontWeight: "bold" },
  h2: { fontSize: 10, fontWeight: "bold", marginTop: 10, marginBottom: 4, color: "#1f6f54" },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e4e4e7", paddingVertical: 2.5 },
  cel: { flex: 1, textAlign: "right" },
  cel0: { flex: 2.2, textAlign: "left" },
  forte: { fontWeight: "bold" },
  tese: { fontSize: 9, lineHeight: 1.4 },
  aviso: { marginTop: 14, padding: 8, backgroundColor: "#f4f4f5", borderRadius: 4, fontSize: 7, lineHeight: 1.4, color: "#52525b" },
  rodape: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 7, color: "#a1a1aa", flexDirection: "row", justifyContent: "space-between" },
})

function Linha({ cols, forte }: { cols: string[]; forte?: boolean }) {
  return (
    <View style={s.linha}>
      {cols.map((c, i) => <Text key={i} style={[i === 0 ? s.cel0 : s.cel, forte ? s.forte : {}]}>{c}</Text>)}
    </View>
  )
}

export function ResumoPdf({ c, t, fmt, geradoEm }: { c: ContextoSeparador; t: T; fmt: Fmt; geradoEm: string }) {
  const v = c.avaliacao
  const a = c.pressupostos.avaliacao
  const m = c.mercado
  const base = c.historico[c.historico.length - 1]
  const cen = correrCenarios(base, c.conjunto, m, c.fracaoAno1, c.anosAteFimAno1)
  const usd = (x: number | null) => (x === null ? "N/A" : `$${fmt(x, "anos")}`)
  const pot = (x: number | null) => (x === null || m.preco <= 0 ? "N/A" : `${x >= m.preco ? "+" : ""}${fmt(x / m.preco - 1, "pct")}`)
  const pr = c.projecoes
  const d = c.pressupostos.drivers
  const n = pr.length
  const tese = c.conjunto.tese?.trim()

  return (
    <Document title={`${c.ticker} — DCF`} author="BullValue">
      <Page size="A4" style={s.page}>
        <View style={s.cab}>
          <View>
            <Text style={s.titulo}>{c.empresa.nome} ({c.ticker})</Text>
            <Text style={s.sub}>{[c.empresa.setor, c.empresa.industria].filter(Boolean).join(" · ")}</Text>
            <Text style={s.sub}>{t("resumo.cenarioAtivo")}: {t(`cenario.nomes.${c.cenario}`)} · {geradoEm} · {t("unidade")}</Text>
          </View>
          <View>
            <Text style={s.marca}>BullValue</Text>
            <Text style={s.sub}>{t("resumo.tituloPdf")}</Text>
          </View>
        </View>

        <View style={s.kpis}>
          {[
            [t("avaliacao.valorPorAcao"), usd(v.valorPorAcao)],
            [t("avaliacao.preco"), usd(v.preco)],
            [t("avaliacao.potencial"), `${v.potencial >= 0 ? "+" : ""}${fmt(v.potencial, "pct")}`],
            [t("avaliacao.margemSeguranca"), fmt(v.margemSeguranca, "pct")],
          ].map(([r, x]) => (
            <View key={r} style={s.kpi}><Text style={s.kpiR}>{r}</Text><Text style={s.kpiV}>{x}</Text></View>
          ))}
        </View>

        <Text style={s.h2}>{t("sensibilidade.cenarios.titulo")}</Text>
        <Linha forte cols={[t("cenario.rotulo"), t("avaliacao.valorPorAcao"), t("avaliacao.potencial"), t("sensibilidade.cenarios.probabilidade")]} />
        {cen.linhas.map((l) => (
          <Linha key={l.nome} cols={[t(`cenario.nomes.${l.nome}`), usd(l.valor), pot(l.valor), fmt(c.conjunto.probabilidades[l.nome], "pct")]} />
        ))}
        <Linha forte cols={[t("sensibilidade.cenarios.esperado"), usd(cen.esperado), pot(cen.esperado), ""]} />

        <Text style={s.h2}>{t("pressupostos.avaliacao")}</Text>
        <Linha cols={[t("drivers.crescimentoReceita"), `${fmt(d.crescimentoReceita[0], "pct")} → ${fmt(d.crescimentoReceita[n - 1], "pct")}`]} />
        <Linha cols={[t("drivers.margemEbit"), `${fmt(d.margemEbit[0], "pct")} → ${fmt(d.margemEbit[n - 1], "pct")}`]} />
        <Linha cols={[t("avaliacao.wacc"), fmt(v.wacc.wacc, "pct")]} />
        <Linha cols={[t("pressupostos.metodo"), t(`pressupostos.metodos.${a.metodoTerminal}`)]} />
        <Linha cols={[t("pressupostos.g"), fmt(a.g, "pct")]} />
        <Linha cols={[t("pressupostos.multiplo"), fmt(a.multiploSaida, "x")]} />
        <Linha cols={[t("avaliacao.pesoTerminal"), fmt(v.pesoTerminal, "pct")]} />

        <Text style={s.h2}>{t("linhas.fcff")}</Text>
        <Linha forte cols={["", ...pr.map((p) => `${p.fiscalYear}E`)]} />
        <Linha cols={[t("linhas.receita"), ...pr.map((p) => fmt(p.receita, "m"))]} />
        <Linha cols={[t("linhas.ebit"), ...pr.map((p) => fmt(p.ebit, "m"))]} />
        <Linha forte cols={[t("linhas.fcff"), ...pr.map((p) => fmt(p.fcff, "m"))]} />

        <Text style={s.h2}>{t("avaliacao.ponte")}</Text>
        <Linha cols={[t("avaliacao.somaVp"), fmt(v.somaVpFcff, "m")]} />
        <Linha cols={[t("avaliacao.vpTerminal"), fmt(v.vpTerminal, "m")]} />
        <Linha forte cols={[t("avaliacao.ev"), fmt(v.enterpriseValue, "m")]} />
        <Linha cols={[t("avaliacao.divida"), fmt(m.dividaTotal, "m")]} />
        <Linha cols={[t("avaliacao.caixa"), fmt(m.caixa, "m")]} />
        <Linha cols={[t("avaliacao.minoritarios"), fmt(m.interessesMinoritarios, "m")]} />
        <Linha forte cols={[t("avaliacao.capitalProprio"), fmt(v.valorCapitalProprio, "m")]} />
        <Linha cols={[t("avaliacao.acoes"), fmt(m.acoes, "m")]} />

        {tese ? (
          <View wrap={false}>
            <Text style={s.h2}>{t("resumo.tese")}</Text>
            <Text style={s.tese}>{tese}</Text>
          </View>
        ) : null}

        <Text style={s.aviso}>{t("legal.aviso")}</Text>
        <View style={s.rodape} fixed>
          <Text>{t("legal.rodapePdf")}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
