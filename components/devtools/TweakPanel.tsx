"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import ptMessages from "@/messages/pt.json"
import {
  TWEAK_GROUPS,
  TWEAK_RULES,
  type TweakToken,
} from "@/lib/devtools/tweak-tokens"
import { VARIANT_DIMENSIONS } from "@/lib/devtools/tweak-variants"

/**
 * Painel "Tweak" — só em desenvolvimento.
 *
 * Barra lateral para afinar o design AO VIVO sem recompilar: cor, tipografia,
 * raio, largura, ar entre secções, velocidade das animações — e ainda editar o
 * texto diretamente na página, com o painel a descobrir sozinho a CHAVE i18n
 * correspondente para depois se colar em messages/pt.json.
 *
 * Regras de implementação importantes:
 * - O painel NÃO usa tokens da app (nada de bg-background/text-foreground). Se
 *   usasse, mexer no --background partia o próprio painel. Cores em inline
 *   style, fixas, com o seu próprio esquema escuro.
 * - Os tokens são aplicados em `document.documentElement.style`, que ganha à
 *   folha de estilos. As regras (largura, escala) precisam de um <style>
 *   injetado porque o alvo são utilitários Tailwind espalhados pelo markup.
 * - Tudo persiste em localStorage: recarregar a página não perde o ensaio.
 */

const LS_KEY = "bullvalue.tweak.v1"
const STYLE_ID = "bullvalue-tweak-rules"

/* ── esquema de cor do próprio painel (independente da app) ─────────── */
const UI = {
  bg: "#141412",
  bg2: "#1e1d1a",
  bg3: "#2a2825",
  line: "#38352f",
  text: "#f2f1eb",
  dim: "#a9a59b",
  accent: "#d6a64a",
  danger: "#ff5a4d",
}

type Persisted = {
  tokens: Record<string, string>
  rules: Record<string, number>
  texts: TextEdit[]
  /** Variante escolhida por dimensão: { icon: "b", kicker: "d", … } */
  variants: Record<string, string>
}

type TextEdit = {
  /** Texto original, tal como estava na página. */
  from: string
  /** Texto novo. */
  to: string
  /** Chave i18n encontrada por pesquisa inversa (se encontrada). */
  key: string | null
}

/* ── índice inverso texto → chave i18n ─────────────────────────────── */

/** Achata messages/pt.json em [caminho.com.pontos, valor]. */
function buildIndex(): Map<string, string> {
  const index = new Map<string, string>()
  const walk = (node: unknown, path: string) => {
    if (typeof node === "string") {
      // Primeira chave a ganhar: strings repetidas (ex: "Grátis") mapeiam para
      // a primeira ocorrência, e o painel mostra-a como palpite.
      if (!index.has(node)) index.set(node, path)
      return
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`))
      return
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k)
      }
    }
  }
  walk(ptMessages, "")
  return index
}

/* ── utilitários de valor ──────────────────────────────────────────── */

/** Resolve `var(--x)` em cadeia até chegar a um valor literal. */
function resolveVar(value: string, depth = 0): string {
  const v = value.trim()
  if (depth > 10 || !v.startsWith("var(")) return v
  const name = v.slice(4, v.indexOf(")")).trim()
  const next = getComputedStyle(document.documentElement).getPropertyValue(name)
  return next ? resolveVar(next, depth + 1) : v
}

function readToken(name: string): string {
  if (typeof window === "undefined") return ""
  return resolveVar(getComputedStyle(document.documentElement).getPropertyValue(name))
}

/** `#rgb` → `#rrggbb`; qualquer outra coisa passa como está. */
function normalizeHex(value: string): string {
  const v = value.trim()
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  }
  return v
}

function parseNumber(value: string, fallback: number): number {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Converte um valor de tempo para a unidade do slider.
 *
 * O motor de estilos normaliza durações para segundos, por isso o
 * `--dur-base: 320ms` do globals.css chega aqui como "0.32s". Sem esta
 * conversão o painel mostrava "0.32ms" e punha o slider no mínimo — um
 * arrasto passava de 320ms para centenas de ms de uma vez.
 */
function toUnit(value: string, unit: string): number | null {
  const n = Number.parseFloat(value)
  if (!Number.isFinite(n)) return null
  const isSeconds = /\ds\s*$/.test(value.trim())
  if (unit === "ms") return Math.round(isSeconds ? n * 1000 : n)
  return n
}

/* ── componente ────────────────────────────────────────────────────── */

export function TweakPanel() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"variantes" | "design" | "layout" | "texto">("variantes")
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [rules, setRules] = useState<Record<string, number>>({})
  const [texts, setTexts] = useState<TextEdit[]>([])
  const [variants, setVariants] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const index = useMemo(buildIndex, [])
  /** Valores originais, lidos uma vez, para o "repor" e para os inputs. */
  const baseline = useRef<Record<string, string>>({})

  /* ── carregar o ensaio guardado ─────────────────────────────────── */
  useEffect(() => {
    for (const group of TWEAK_GROUPS) {
      for (const token of group.tokens) {
        baseline.current[token.name] = readToken(token.name)
      }
    }
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as Persisted
        setTokens(saved.tokens ?? {})
        setRules(saved.rules ?? {})
        setTexts(saved.texts ?? [])
        setVariants(saved.variants ?? {})
      }
    } catch {
      /* localStorage indisponível ou JSON corrompido — começa limpo */
    }
    setHydrated(true)
  }, [])

  /* ── aplicar + persistir ────────────────────────────────────────── */
  useEffect(() => {
    if (!hydrated) return
    const root = document.documentElement

    for (const group of TWEAK_GROUPS) {
      for (const token of group.tokens) {
        const value = tokens[token.name]
        if (value) root.style.setProperty(token.name, value)
        else root.style.removeProperty(token.name)
      }
    }

    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement("style")
      style.id = STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = TWEAK_RULES.filter((r) => rules[r.id] !== undefined)
      .map((r) => r.css(`${rules[r.id]}${r.unit}`))
      .join("\n")

    // Variantes: um atributo por dimensão. "a" (original) remove o atributo,
    // para o CSS de app/design-variants.css ficar completamente inerte.
    for (const dim of VARIANT_DIMENSIONS) {
      const picked = variants[dim.attr]
      if (!picked || picked === "a") root.removeAttribute(`data-v-${dim.attr}`)
      else root.setAttribute(`data-v-${dim.attr}`, picked)
    }

    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ tokens, rules, texts, variants } satisfies Persisted),
      )
    } catch {
      /* quota cheia — o ensaio continua a funcionar nesta sessão */
    }
  }, [tokens, rules, texts, variants, hydrated])

  /* ── modo de edição de texto ────────────────────────────────────── */
  useEffect(() => {
    if (!editing) return

    const isInPanel = (el: Element | null) => !!el?.closest("[data-tweak-panel]")

    /** Só elementos-folha de texto: evita tornar editável um <section> inteiro. */
    const isTextLeaf = (el: Element) => {
      if (!el.textContent?.trim()) return false
      return Array.from(el.childNodes).every((n) => n.nodeType === Node.TEXT_NODE)
    }

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target || isInPanel(target)) return
      const leaf = target.closest("*")
      if (!leaf || !isTextLeaf(leaf)) return

      e.preventDefault()
      e.stopPropagation()

      const el = leaf as HTMLElement
      const from = el.textContent?.trim() ?? ""
      el.contentEditable = "true"
      el.focus()

      const finish = () => {
        el.contentEditable = "false"
        el.removeEventListener("blur", finish)
        const to = el.textContent?.trim() ?? ""
        if (to === from) return
        setTexts((prev) => [
          ...prev.filter((t) => t.from !== from),
          { from, to, key: index.get(from) ?? null },
        ])
      }
      el.addEventListener("blur", finish)
    }

    document.addEventListener("click", onClick, true)
    document.body.style.cursor = "text"
    return () => {
      document.removeEventListener("click", onClick, true)
      document.body.style.cursor = ""
    }
  }, [editing, index])

  const flash = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 1800)
  }, [])

  const copy = useCallback(
    (text: string, message: string) => {
      navigator.clipboard.writeText(text).then(
        () => flash(message),
        () => flash("Não consegui copiar"),
      )
    },
    [flash],
  )

  const resetAll = useCallback(() => {
    setTokens({})
    setRules({})
    setTexts([])
    setVariants({})
    flash("Reposto")
  }, [flash])

  /** Bloco CSS pronto a colar em app/globals.css. */
  const cssExport = useMemo(() => {
    const lines = Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`)
    const ruleLines = TWEAK_RULES.filter((r) => rules[r.id] !== undefined).map(
      (r) => `/* ${r.label}: ${rules[r.id]}${r.unit} */`,
    )
    const chosen = VARIANT_DIMENSIONS.filter((d) => variants[d.attr] && variants[d.attr] !== "a")
    const variantLines = chosen.length
      ? [
          "",
          "/* Variantes escolhidas — promover em app/design-variants.css:",
          ...chosen.map((d) => {
            const opt = d.options.find((o) => o.id === variants[d.attr])
            return `   ${d.label}: "${opt?.label}" (data-v-${d.attr}="${variants[d.attr]}") — corrige ${d.finding}`
          }),
          "*/",
        ]
      : []
    if (!lines.length && !ruleLines.length && !variantLines.length) return "/* sem alterações */"
    return [
      ...(lines.length ? [":root {", ...lines, "}"] : []),
      ...ruleLines,
      ...variantLines,
    ].join("\n")
  }, [tokens, rules, variants])

  /** Patch i18n: só as edições cuja chave foi encontrada. */
  const i18nExport = useMemo(() => {
    if (!texts.length) {
      // Distinguir "não editaste texto" de "editaste mas não achei a chave":
      // a mensagem antiga dizia sempre a segunda coisa e confundia quem só
      // tinha mexido em variantes/tokens (que saem no "Copiar CSS").
      return [
        "// Ainda não editaste texto nenhum.",
        '// Separador "Texto" → "Ligar modo de edição" → clica numa frase da página.',
        "// (Variantes, cores e layout saem no botão \"Copiar CSS\".)",
      ].join("\n")
    }
    const withKey = texts.filter((t) => t.key)
    if (!withKey.length) {
      return [
        `// ${texts.length} edição(ões), nenhuma com chave i18n encontrada.`,
        "// Esse texto está hardcoded no componente — procura-o e move-o para messages/pt.json.",
        ...texts.map((t) => `//   ${JSON.stringify(t.from)} -> ${JSON.stringify(t.to)}`),
      ].join("\n")
    }
    const lines = withKey.map((t) => `"${t.key}": ${JSON.stringify(t.to)}`).join(",\n")
    const orphans = texts.filter((t) => !t.key)
    return orphans.length
      ? `${lines}\n\n// sem chave i18n (hardcoded no componente):\n${orphans
          .map((t) => `//   ${JSON.stringify(t.from)} -> ${JSON.stringify(t.to)}`)
          .join("\n")}`
      : lines
  }, [texts])

  if (!open) {
    return (
      <button
        data-tweak-panel
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 2147483000,
          padding: "10px 16px",
          borderRadius: 999,
          border: `1px solid ${UI.line}`,
          background: UI.bg,
          color: UI.accent,
          font: "600 13px/1 ui-sans-serif, system-ui, sans-serif",
          cursor: "pointer",
          boxShadow: "0 8px 30px rgba(0,0,0,.45)",
        }}
        title="Abrir painel de design (só em dev)"
      >
        Tweak
      </button>
    )
  }

  return (
    <aside
      data-tweak-panel
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 372,
        maxWidth: "100vw",
        zIndex: 2147483000,
        background: UI.bg,
        borderLeft: `1px solid ${UI.line}`,
        color: UI.text,
        font: "13px/1.45 ui-sans-serif, system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        boxShadow: "-16px 0 50px rgba(0,0,0,.5)",
      }}
    >
      {/* cabeçalho */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px",
          borderBottom: `1px solid ${UI.line}`,
        }}
      >
        <strong style={{ color: UI.accent, fontSize: 13, letterSpacing: ".02em" }}>Tweak</strong>
        <span style={{ color: UI.dim, fontSize: 11 }}>dev</span>
        <div style={{ flex: 1 }} />
        <PanelButton onClick={resetAll} tone="danger">
          Repor
        </PanelButton>
        <PanelButton onClick={() => setOpen(false)}>Fechar</PanelButton>
      </header>

      {/* separadores */}
      <nav style={{ display: "flex", borderBottom: `1px solid ${UI.line}` }}>
        {(["variantes", "design", "layout", "texto"] as const).map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1,
              padding: "9px 2px",
              fontSize: 11,
              background: tab === id ? UI.bg2 : "transparent",
              color: tab === id ? UI.text : UI.dim,
              border: "none",
              borderBottom: tab === id ? `2px solid ${UI.accent}` : "2px solid transparent",
              cursor: "pointer",
              font: "600 12px/1 ui-sans-serif, system-ui, sans-serif",
              textTransform: "capitalize",
            }}
          >
            {id}
          </button>
        ))}
      </nav>

      {/* data-lenis-prevent: o Lenis interceta a roda do rato à escala da
          janela (é ele que faz o smooth scroll da página). Sem este atributo,
          rodar a roda sobre o painel movia a PÁGINA por trás e o painel nunca
          fazia scroll — que era o que tornava impossível chegar às dimensões
          de baixo. */}
      <div
        data-lenis-prevent
        style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "4px 14px 16px" }}
      >
        {tab === "variantes" && (
          <section style={{ marginTop: 14 }}>
            <p style={{ color: UI.dim, fontSize: 11.5, margin: "0 0 12px", lineHeight: 1.5 }}>
              Alternativas a cada padrão que o detector marcou como AI slop. Clica para
              trocar ao vivo, em todas as páginas. <strong style={{ color: UI.text }}>A</strong>{" "}
              é sempre o original.
            </p>
            {VARIANT_DIMENSIONS.map((dim) => {
              const picked = variants[dim.attr] ?? "a"
              return (
                <div key={dim.attr} style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{dim.label}</span>
                    <div style={{ flex: 1 }} />
                    <span
                      style={{
                        fontSize: 10,
                        padding: "1px 5px",
                        borderRadius: 4,
                        color: dim.kind === "slop" ? "#ff9d8f" : UI.dim,
                        background: dim.kind === "slop" ? "rgba(255,90,77,.12)" : UI.bg2,
                      }}
                    >
                      {dim.count}×
                    </span>
                  </div>
                  <div
                    style={{
                      color: UI.dim,
                      fontSize: 10,
                      fontFamily: "ui-monospace, Menlo, monospace",
                      margin: "2px 0 7px",
                    }}
                  >
                    {dim.finding}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {dim.options.map((opt) => {
                      const active = picked === opt.id
                      return (
                        <button
                          key={opt.id}
                          title={opt.hint}
                          onClick={() => setVariants((p) => ({ ...p, [dim.attr]: opt.id }))}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: "6px 3px",
                            background: active ? "rgba(214,166,74,.16)" : UI.bg2,
                            border: `1px solid ${active ? UI.accent : UI.line}`,
                            borderRadius: 6,
                            color: active ? UI.accent : UI.dim,
                            cursor: "pointer",
                            font: `${active ? 700 : 500} 10.5px/1.25 ui-sans-serif, system-ui, sans-serif`,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ color: UI.dim, fontSize: 10.5, marginTop: 5 }}>
                    {dim.options.find((o) => o.id === picked)?.hint}
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {tab === "design" &&
          TWEAK_GROUPS.map((group) => (
            <section key={group.id} style={{ marginTop: 16 }}>
              <GroupLabel>{group.label}</GroupLabel>
              {group.tokens.map((token) => (
                <TokenRow
                  key={token.name}
                  token={token}
                  value={tokens[token.name] ?? baseline.current[token.name] ?? ""}
                  dirty={tokens[token.name] !== undefined}
                  onChange={(v) => setTokens((p) => ({ ...p, [token.name]: v }))}
                  onReset={() =>
                    setTokens((p) => {
                      const next = { ...p }
                      delete next[token.name]
                      return next
                    })
                  }
                />
              ))}
            </section>
          ))}

        {tab === "layout" && (
          <section style={{ marginTop: 16 }}>
            <GroupLabel>Grelha e ritmo</GroupLabel>
            {TWEAK_RULES.map((rule) => {
              const value = rules[rule.id] ?? rule.fallback
              return (
                <div key={rule.id} style={{ margin: "12px 0" }}>
                  <RowLabel
                    label={rule.label}
                    value={`${value}${rule.unit}`}
                    dirty={rules[rule.id] !== undefined}
                    onReset={() =>
                      setRules((p) => {
                        const next = { ...p }
                        delete next[rule.id]
                        return next
                      })
                    }
                  />
                  <input
                    type="range"
                    min={rule.min}
                    max={rule.max}
                    step={rule.step}
                    value={value}
                    onChange={(e) =>
                      setRules((p) => ({ ...p, [rule.id]: Number(e.target.value) }))
                    }
                    style={{ width: "100%", accentColor: UI.accent }}
                  />
                </div>
              )
            })}
          </section>
        )}

        {tab === "texto" && (
          <section style={{ marginTop: 16 }}>
            <GroupLabel>Editar na página</GroupLabel>
            <p style={{ color: UI.dim, fontSize: 12, margin: "6px 0 10px" }}>
              Liga o modo e clica em qualquer texto da página para o reescrever. O painel
              procura a chave i18n correspondente em <code>messages/pt.json</code>.
            </p>
            <PanelButton onClick={() => setEditing((v) => !v)} tone={editing ? "accent" : "plain"}>
              {editing ? "● Modo de edição ligado" : "Ligar modo de edição"}
            </PanelButton>

            <div style={{ marginTop: 16 }}>
              <GroupLabel>Alterações ({texts.length})</GroupLabel>
              {texts.length === 0 && (
                <p style={{ color: UI.dim, fontSize: 12 }}>Ainda nada editado.</p>
              )}
              {texts.map((t) => (
                <div
                  key={t.from}
                  style={{
                    margin: "8px 0",
                    padding: 8,
                    background: UI.bg2,
                    border: `1px solid ${UI.line}`,
                    borderRadius: 8,
                  }}
                >
                  <div style={{ color: UI.dim, fontSize: 11, textDecoration: "line-through" }}>
                    {t.from}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 2 }}>{t.to}</div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 10.5,
                      color: t.key ? UI.accent : UI.danger,
                      fontFamily: "ui-monospace, Menlo, monospace",
                      wordBreak: "break-all",
                    }}
                  >
                    {t.key ?? "chave não encontrada — texto não vem do i18n"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* rodapé: exportar */}
      <footer style={{ borderTop: `1px solid ${UI.line}`, padding: 12, display: "flex", gap: 8 }}>
        <PanelButton onClick={() => copy(cssExport, "CSS copiado")} grow>
          Copiar CSS
        </PanelButton>
        <PanelButton onClick={() => copy(i18nExport, "Chaves copiadas")} grow>
          Copiar i18n
        </PanelButton>
      </footer>

      {toast && (
        <div
          style={{
            position: "absolute",
            bottom: 62,
            left: 12,
            right: 12,
            padding: "8px 10px",
            background: UI.bg3,
            border: `1px solid ${UI.line}`,
            borderRadius: 8,
            fontSize: 12,
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}
    </aside>
  )
}

/* ── peças de UI do painel ─────────────────────────────────────────── */

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: UI.dim,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: ".12em",
        textTransform: "uppercase",
        margin: "0 0 6px",
      }}
    >
      {children}
    </div>
  )
}

function RowLabel({
  label,
  value,
  dirty,
  onReset,
}: {
  label: string
  value: string
  dirty: boolean
  onReset: () => void
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: 12 }}>{label}</span>
      <div style={{ flex: 1 }} />
      <span
        style={{
          color: UI.dim,
          fontSize: 11,
          fontFamily: "ui-monospace, Menlo, monospace",
        }}
      >
        {value}
      </span>
      {dirty && (
        <button
          onClick={onReset}
          title="Repor este valor"
          style={{
            background: "none",
            border: "none",
            color: UI.accent,
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ↺
        </button>
      )}
    </div>
  )
}

function TokenRow({
  token,
  value,
  dirty,
  onChange,
  onReset,
}: {
  token: TweakToken
  value: string
  dirty: boolean
  onChange: (v: string) => void
  onReset: () => void
}) {
  if (token.kind === "color") {
    const hex = normalizeHex(value)
    const valid = /^#[0-9a-f]{6}$/i.test(hex)
    return (
      <div style={{ margin: "10px 0" }}>
        <RowLabel label={token.label} value={hex || "—"} dirty={dirty} onReset={onReset} />
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="color"
            value={valid ? hex : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: 40,
              height: 28,
              padding: 0,
              border: `1px solid ${UI.line}`,
              borderRadius: 6,
              background: UI.bg2,
              cursor: "pointer",
            }}
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1,
              minWidth: 0,
              height: 28,
              padding: "0 8px",
              background: UI.bg2,
              border: `1px solid ${UI.line}`,
              borderRadius: 6,
              color: UI.text,
              font: "11px/1 ui-monospace, Menlo, monospace",
            }}
          />
        </div>
      </div>
    )
  }

  if (token.kind === "select") {
    /* `value` vem RESOLVIDO (o nome real da família), por isso nunca batia
       certo com os `var(--font-*)` das opções e o <select> caía sempre na
       primeira — dava a entender que a fonte display era a de UI. Enquanto
       o utilizador não escolher, mostramos uma opção sintética "actual". */
    const known = token.options?.some((o) => o.value === value)
    return (
      <div style={{ margin: "10px 0" }}>
        <RowLabel label={token.label} value="" dirty={dirty} onReset={onReset} />
        <select
          value={known ? value : "__current__"}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            height: 28,
            padding: "0 6px",
            background: UI.bg2,
            border: `1px solid ${UI.line}`,
            borderRadius: 6,
            color: UI.text,
            fontSize: 12,
          }}
        >
          {!known && (
            <option value="__current__" disabled>
              Actual do tema ({value.split(",")[0].replace(/["']/g, "").trim() || "—"})
            </option>
          )}
          {token.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // length
  const unit = token.unit ?? "px"
  const numeric = toUnit(value, unit) ?? parseNumber(value, token.min ?? 0)
  return (
    <div style={{ margin: "10px 0" }}>
      <RowLabel
        label={token.label}
        value={`${numeric}${unit}`}
        dirty={dirty}
        onReset={onReset}
      />
      <input
        type="range"
        min={token.min}
        max={token.max}
        step={token.step}
        value={numeric}
        onChange={(e) => onChange(`${e.target.value}${unit}`)}
        style={{ width: "100%", accentColor: UI.accent }}
      />
    </div>
  )
}

function PanelButton({
  children,
  onClick,
  tone = "plain",
  grow,
}: {
  children: React.ReactNode
  onClick: () => void
  tone?: "plain" | "accent" | "danger"
  grow?: boolean
}) {
  const color = tone === "danger" ? UI.danger : tone === "accent" ? UI.accent : UI.text
  return (
    <button
      onClick={onClick}
      style={{
        flex: grow ? 1 : undefined,
        padding: "7px 10px",
        background: tone === "accent" ? "rgba(214,166,74,.14)" : UI.bg2,
        border: `1px solid ${tone === "accent" ? UI.accent : UI.line}`,
        borderRadius: 7,
        color,
        cursor: "pointer",
        font: "600 11.5px/1 ui-sans-serif, system-ui, sans-serif",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  )
}
