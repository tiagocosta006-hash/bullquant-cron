# Plano — Página "Explorar" (substitui o Screener)

> Estado: proposta para validação. Nenhum código escrito ainda.
> Data: 2026-07-08. Autor: sessão de design com Costa.

---

## 1. Porquê (o problema)

A página atual `/screener` é um **filtro por métricas** (margem, ROIC, P/E via sliders).
Nunca soou bem porque o instinto real do utilizador não é filtrar por números — é:

> **"Explorar por tipo de negócio: mostra-me que empresas existem, deixa-me
> perceber o que fazem, e só depois olho para os números."**

Um filtro `ROIC >= 15%` responde a *"é eficiente?"*, não a *"percebo o negócio?"*.
São perguntas diferentes. A página estava a resolver a errada.

**Decisões fechadas nesta sessão:**
- A página passa a chamar-se **Explorar** (Explore/Discover), não Screener.
- É uma ferramenta de **descoberta orientada por negócio**, não de filtragem por métrica.
- Conteúdo do negócio é **gerado por IA (Gemini), cacheado, e regenerado periodicamente por cron** (o negócio de uma empresa muda com o tempo — ver §3.1).
- A descrição é **simples**: 2-3 frases (o que faz + como ganha dinheiro), em PT.
- A página `/stock/[ticker]` (fundamentals) **NÃO se toca** — é o destino, já está boa.

---

## 2. O que a BD já tem (verificado, 2026-07-08)

Query direta à BD de produção (530 empresas ativas):

| Campo | Cobertura | Nota |
|---|---|---|
| `sector` | 530 / 530 (100%) | 11 setores reais + 15 "Unknown" |
| `industry` | 503 / 530 (95%) | **127 indústrias distintas** — granularidade a sério |
| `logoUrl` | 501 / 530 (95%) | bom para navegação visual |
| `description` | **2 / 530 (0%)** | ❌ **vazio — é o que a IA vai preencher** |

Distribuição de setores (nº empresas):
```
80 Industrials      76 Information Technology   76 Financials
64 Health Care      48 Consumer Discretionary   37 Consumer Staples
31 Utilities        31 Real Estate              26 Materials
23 Energy           23 Communication Services   15 Unknown
```

Métricas-âncora (para mostrar 2-3 números por empresa no card, já validadas noutra query):
`revenue` 98%, `netMargin` 98%, `roic` 84%, `grossMargin` 78%, preço recente 96%.

**Conclusão:** temos tudo para navegar por setor→indústria e mostrar âncoras.
Só falta a **descrição do negócio**, que a IA gera.

---

## 3. Custo de IA — a preocupação do "temos créditos?"

**Resposta: praticamente não custa, e cabe no free tier — mesmo regenerando.**

- Já usam `gemini-2.5-flash` via Vercel AI SDK (`app/api/ai/brief/route.ts`,
  `app/api/management/[ticker]/route.ts`), com padrão de cache maduro.
- Custo por geração: ~$0.001/empresa × 530 ≈ **$0.60 por passagem completa**.
- Free tier Gemini (15 req/min) chega: 530 empresas ≈ 35 min de batch, **a 0€**.

**Regra de ouro (a mesma do resto da app):** IA no batch de ingestão, NUNCA no
page-load. O utilizador lê descrições **pré-geradas e cacheadas**. Chamar Gemini a
cada exploração é que rebentaria créditos — e não vamos fazer isso.

### 3.1. O negócio muda — cache periódico, não eterno ⚠️

**Correção a uma premissa inicial errada.** O negócio de uma empresa NÃO é estático:
- Meta: rede social → rede social + metaverso + IA.
- Amazon: loja online → o lucro vem hoje quase todo da AWS (cloud).
- Netflix: DVDs → streaming → produtora → publicidade + jogos.

Por isso a descrição **não** se gera "1× para sempre". Gera-se e **regenera-se por
cron periódico** — a mesma lógica dos fundamentais (cron semanal) e preços (cron diário).

- Distinção útil: **o essencial** ("o que a empresa faz") muda a ritmo de *anos*;
  **o que está a mudar agora** (notícias, último trimestre) muda a ritmo de *meses*.
  Esta feature captura o **essencial** — logo, regenerar a cada 1-3 meses chega.
  (O "o que muda agora" já é servido pelo AI Brief de notícias que existe.)
- **Custo mesmo regenerando mensalmente:** ~$0.60 × 12 = **~$7/ano**. Continua a
  caber no free tier. A viabilidade de custos mantém-se; muda só "1×" → "cron".

---

## 4. Arquitetura

### 4.1. Schema Prisma

O campo de texto já existe:
```prisma
// model Company (prisma/schema.prisma:48)
description String? @db.Text   // ← preenchido/atualizado pela ingestão IA
```

**Migration necessária (aditiva) para o cron de regeneração:**
```prisma
descriptionGeneratedAt DateTime?   // quando a IA gerou; cron regera se for antigo
```
Sem este campo, o cron não sabe o que está fresco vs. velho e regeraria tudo
sempre (desperdício). É o que torna o "regenerar periodicamente" (§3.1) eficiente.

> ⚠️ Migration: usar `prisma db push` (aditivo), **não** `migrate dev` — a BD tem
> drift conhecido (CLAUDE.md §10). Carregar `.env.local` antes.

### 4.2. Ingestão IA (batch, novo script)

`scripts/ingest_descriptions.py` — segue o padrão de `ingest_ceos.py`:
- Corre por **cron periódico** (ex: mensal ou trimestral via GitHub Actions,
  como `ingest-fundamentals.yml`), para apanhar mudanças no negócio (§3.1).
  Primeira execução é manual para popular tudo.
- **Regeneração, não só preenchimento:** processa empresas sem `description` E
  as que têm descrição mais velha que N meses (guardar `descriptionGeneratedAt` —
  ver §4.1). Assim não gasta tokens a regerar o que ainda está fresco.
- Para cada empresa a (re)gerar:
  1. Junta contexto barato: `name`, `sector`, `industry`, ticker.
  2. Chama Gemini (`GEMINI_MODEL` do env, **nunca hardcoded** — CLAUDE.md §1) com
     prompt PT: *"Em 2-3 frases, explica o que a {name} faz e como ganha dinheiro.
     Linguagem simples para um investidor iniciante português. Se não souberes,
     responde 'Dados insuficientes' — não inventes."* (guard anti-alucinação, CLAUDE.md §9).
  3. Upsert `company.description` + `descriptionGeneratedAt`. Sleep p/ 15 req/min.
- **Alternativa mais barata ainda** a avaliar na PoC: Finnhub `/stock/profile2`
  devolve uma `finnhubIndustry` + por vezes um resumo curto — mas é seco e em EN.
  A IA dá melhor PT e "como ganha dinheiro". Decisão: **IA** (já fechada).

> ⚠️ Reutilizar o helper de chamada Gemini que já existe no lado TS não dá (é
> Python no batch). Replicar o prompt/modelo via env. Ou, alternativa, fazer a
> ingestão como **route TS** protegida + script que itera tickers — decidir na
> implementação. Padrão Python é o mais alinhado com o resto da ingestão.

### 4.3. API

`GET /api/explore` (novo) — **zero IA em runtime**, só lê a BD:
- Query params: `sector?`, `industry?`, `q?` (texto), `sort?`.
- Devolve empresas com: `ticker, name, logoUrl, sector, industry, description`
  + 2-3 âncoras (`revenue`, `netMargin`, `roic`) do último anual.
- Agrupa/conta por setor e indústria para a navegação (ou endpoint separado
  `/api/explore/facets` para as contagens).
- Auth: exige utilizador (como as outras rotas do grupo `(app)`).

Reescreve-se do zero — **não** reaproveitar `app/api/screener/route.ts` (tem a
query partida com `distinct`+`take:500`). Ver §6.

### 4.4. Página `/explore` (renomear de `/screener`)

Fluxo de navegação (o "explorar por negócio"):
```
Entra → vê os 11 SETORES (cards com contagem + ícone)
      → clica "Tecnologia" → vê as INDÚSTRIAS (Software, Semicondutores…)
      → vê as EMPRESAS: logo + nome + descrição (1-2 frases) + 2-3 âncoras
      → clica → /stock/[ticker]  (visão completa, intocada)
```
+ Barra de pesquisa por texto no topo (nome/negócio).
+ Ordenação simples das empresas dentro de uma indústria (por revenue, margem…).

Componentes:
- `app/(app)/explore/page.tsx` (server component — lê BD, sem IA)
- `components/explore/SectorGrid.tsx`, `IndustryList.tsx`, `CompanyCard.tsx`

---

## 5. Migração da página antiga

- Renomear rota `/screener` → `/explore` (pasta `app/(app)/screener` → `explore`).
- `components/layout/AppSidebar.tsx:22` — `href: '/explore'`, novo ícone (ex: `Compass`),
  labels i18n `nav.explore` / `nav.desc.explore`.
- `lib/supabase/middleware.ts:44` — trocar `/screener` por `/explore` na lista protegida.
- i18n: adicionar bloco `explore` em `messages/pt.json` e `en.json`;
  atualizar `nav.screener`→`nav.explore`. Remover bloco `screener` antigo no fim.
- **Apagar** `components/screener/`, `app/api/screener/`, `app/(app)/screener/`
  depois de `/explore` estar a funcionar (não antes).
- `lib/finance/screener.ts` **fica** — é outra coisa (listas curadas do dashboard),
  não confundir.

---

## 6. Bugs da página antiga (contexto — não migrar)

Só para registo de porque não se reaproveita o código:
1. `distinct:['companyId']` + `take:500` **antes** de agrupar corta/filtra empresas erradamente.
2. `minEarningsYield` filtrado em memória sobre universo já cortado.
3. Empresa sem um dado (`grossMargin` null) **desaparece** mesmo com slider a 0 (`gte`).
4. Ordenação fixa por revenue; "gurus" (Buffett/Greenblatt) e "(Em Teste)" em produção.

---

## 7. Fases de entrega

| Fase | Entrega | Depende de |
|---|---|---|
| **0** | PoC: gerar descrição IA para ~5 empresas, validar qualidade PT | — |
| **1** | `db push` (add `descriptionGeneratedAt`) + `ingest_descriptions.py` popula as 530 | Fase 0 |
| **2** | `/api/explore` + página `/explore` (setor→indústria→empresas) | Fase 1 |
| **3** | Renomear nav/middleware/i18n; apagar `/screener` antigo | Fase 2 |
| **4** | Cron de regeneração periódica (GitHub Actions) — mantém as descrições frescas (§3.1) | Fase 1 |
| **5** (opc.) | Tags temáticas, ordenação avançada, pesquisa full-text | Fase 3 |

**Corte:** se a qualidade das descrições IA na Fase 0 não convencer, reavaliar
(Finnhub seco vs. IA), mas o esqueleto de navegação (Fase 2) não depende disso —
pode arrancar com setor/indústria e a descrição entra quando estiver pronta.

---

## 8. Riscos / questões em aberto

- **Alucinação da IA** em empresas menos conhecidas → guard "Dados insuficientes"
  no prompt (CLAUDE.md §9). Validar na PoC.
- **Descrição em PT vs. termos técnicos EN** (tickers, nomes ficam EN — CLAUDE.md §7).
- **15 "Unknown" de setor** — tratar como bucket "Outros" na navegação.
- **Duplas classes** (GOOG/GOOGL, FOX/FOXA) aparecem 2×; decidir se se colapsam na exploração.
- Script Python a chamar Gemini: confirmar lib/SDK Python disponível vs. fazer via route TS.
