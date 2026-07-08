# BullQuant — CLAUDE.md (contexto permanente)

<!--
  Este ficheiro é lido automaticamente pelo Claude Code em TODAS as sessões deste
  repositório. Coloca-o na raiz do projeto. Não precisa de ser invocado.
  É a fonte de contexto-mestre do BullQuant: decisões fechadas, schema, arquitetura,
  convenções e features. Mantém-no atualizado quando algo mudar.
-->

# BullQuant — Instruções de Desenvolvimento

> Plataforma web de análise fundamental de ações para retail investors PT/UE,
> focada em value investing. Equipa: Alex, Costa, Nando (Bullocracy).
> Referência de produto: Qualtrim (qualtrim.com).
> Toda a equipa desenvolve com IA ("vibe coding") — o schema e estas instruções
> são o contexto crítico que torna o código gerado coerente.

---

## 0. Regra zero — ler antes de implementar

Antes de planear ou escrever qualquer código relacionado com dados, modelos ou
rotas, **consulta o `schema.prisma` real do repositório** (`prisma/schema.prisma`).
O schema é a fonte de verdade da base de dados. Se houver divergência entre o
schema real e qualquer documentação, **o `schema.prisma` prevalece**.

Quando uma tarefa contradisser o que está aqui definido, **avisa antes de
implementar** — não assumas em silêncio.

---

## 1. ⚠️ Decisões fechadas que PREVALECEM sobre os docs antigos

A documentação inicial (`README.md`, `02-features.md`, `06-roadmap.md`) tem
referências desatualizadas. **Estas são as decisões corretas e finais.** Onde os
docs disserem o contrário, segue isto:

| Tema | Decisão FINAL (usar isto) | O que ignorar nos docs antigos |
|---|---|---|
| **Preços históricos** | Tabela `prices` em **Supabase PostgreSQL**, com PK composta `(ticker, date)`. Servidos via `/api/prices/[ticker]` com query Prisma. | Qualquer menção a **Cloudflare R2**, a ficheiros `prices/[ticker].json`, ou a "ler ficheiro do R2" (aparece em `02-features.md` §3c e em vários pontos de `06-roadmap.md`). **R2 NÃO é usado no MVP.** |
| **Histórico de dados** | **10 anos** (≈ 40 trimestres). | Qualquer menção a **15 anos** / `take: 60` / "60 trimestres" (aparece em `01-visao.md`, `04-dados.md`, `05-schema.md`). Para queries trimestrais usar `take: 40`. |
| **Cobertura free tier** | Com 10 anos, o free tier do Supabase (500MB) cobre ~2.200 empresas. | Estimativas baseadas em 15 anos. |
| **Cobertura MVP** | **S&P 500** (500 empresas US). | — |
| **Modelo Gemini** | Modelo Flash do Gemini, **lido de variável de ambiente/config — nunca hardcoded**. Confirmar o nome do modelo disponível à data (ex: `gemini-2.x-flash`); `gemini-1.5-flash` pode já estar descontinuado. | Hardcode de `gemini-1.5-flash` no código. |

R2 só fará sentido **no futuro** para blobs (PDFs de relatórios, logos em alta
resolução, backups). Nunca para dados que precisem de `WHERE`/`ORDER BY` — esses
ficam sempre em PostgreSQL.

---

## 2. O que é e para quem

- **Utilizador-alvo:** retail investor individual, iniciante a intermédio, value
  investing, longo prazo, PT/UE. Não é day trader, não é quant, não é institucional.
- **Proposta de valor:** 10 anos de fundamentais visuais + DCF integrada que
  autopreenche + AI Insights qualitativos (Gemini) + gratuito no MVP + **em
  português** (não existe equivalente PT).
- **Idioma:** Português primário (MVP), Inglês em v1. Toda a UI passa por i18n
  desde o início — **nunca texto hardcoded em JSX**.
- **Monetização:** gratuito no MVP; freemium em v1 (Pro ~9-15€/mês).

---

## 3. Stack (com versões alvo)

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | 15+ |
| Estilos | Tailwind CSS | 4+ |
| Componentes UI | shadcn/ui | latest |
| Charts | Recharts | 2+ |
| ORM | Prisma | 6+ |
| Base de dados | PostgreSQL (Supabase) | — |
| Auth | Supabase Auth | — |
| Hosting | Vercel | — |
| IA | Google Gemini API (modelo Flash, via config) | — |
| i18n | next-intl | 3+ |
| Jobs de ingestão | GitHub Actions (scripts Python) | — |
| Validação de forms | Zod + React Hook Form | — |
| HTTP | `fetch` nativo (server actions / route handlers) | — |

**Princípios da stack (vibe coding):**
- Simplicidade > poder. Cada camada extra é mais superfície para bugs que a IA
  não consegue diagnosticar sozinha.
- Serviços geridos > self-hosted.
- O schema Prisma é o artefacto mais crítico — um schema mal pensado multiplica
  inconsistências em cascata.
- **Reviews são obrigatórias** antes de cada merge (coerência com schema, rotas
  e resto da app).

---

## 4. Schema Prisma (fonte de verdade dos modelos)

> Este é o schema de referência. Mantém o `prisma/schema.prisma` real alinhado com
> isto. **Nunca alterar a BD diretamente — sempre `prisma migrate dev`.**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL") // Supabase com connection pooling
}

// ── UTILIZADORES ──────────────────────────────
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  avatarUrl String?
  plan      Plan     @default(FREE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  portfolio   Portfolio?
  aiUsageLogs AIUsageLog[]

  @@map("users")
}

enum Plan {
  FREE
  PRO

  @@map("plan")
}

// ── EMPRESAS ──────────────────────────────────
model Company {
  id          String  @id @default(cuid())
  ticker      String  @unique
  name        String
  cik         String? @unique // SEC CIK (ex: "0000320193" para AAPL)
  exchange    String
  sector      String?
  industry    String?
  country     String  @default("US")
  currency    String  @default("USD")
  logoUrl     String?
  description String? @db.Text
  website     String?
  employees   Int?
  isActive    Boolean @default(true)

  lastFundamentalsUpdate DateTime?
  lastPriceUpdate        DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  fundamentals   Fundamental[]
  prices         Price[]
  aiInsightCache AIInsightCache?
  portfolioItems PortfolioItem[]

  @@index([ticker])
  @@index([exchange])
  @@index([sector])
  @@map("companies")
}

// ── FUNDAMENTAIS ──────────────────────────────
model Fundamental {
  id        String @id @default(cuid())
  companyId String

  periodType    PeriodType
  fiscalYear    Int
  fiscalQuarter Int?      // 1-4; null para anual
  periodEnd     DateTime
  filedAt       DateTime?

  // Income Statement
  revenue           Decimal? @db.Decimal(20, 4)
  costOfRevenue     Decimal? @db.Decimal(20, 4)
  grossProfit       Decimal? @db.Decimal(20, 4)
  operatingExpenses Decimal? @db.Decimal(20, 4)
  operatingIncome   Decimal? @db.Decimal(20, 4) // EBIT
  interestExpense   Decimal? @db.Decimal(20, 4)
  taxExpense        Decimal? @db.Decimal(20, 4)
  netIncome         Decimal? @db.Decimal(20, 4)
  epsDiluted        Decimal? @db.Decimal(10, 4)
  sharesOutstanding Decimal? @db.Decimal(20, 4)

  // Cash Flow
  operatingCashFlow Decimal? @db.Decimal(20, 4)
  capex             Decimal? @db.Decimal(20, 4) // sempre positivo
  freeCashFlow      Decimal? @db.Decimal(20, 4) // operatingCashFlow - capex

  // Balance Sheet
  totalAssets      Decimal? @db.Decimal(20, 4)
  totalCurrentLiab Decimal? @db.Decimal(20, 4)
  longTermDebt     Decimal? @db.Decimal(20, 4)
  totalDebt        Decimal? @db.Decimal(20, 4)
  cash             Decimal? @db.Decimal(20, 4)
  totalEquity      Decimal? @db.Decimal(20, 4)

  // Métricas calculadas (guardadas; ex: 0.430000 = 43%)
  grossMargin     Decimal? @db.Decimal(8, 6)
  operatingMargin Decimal? @db.Decimal(8, 6)
  netMargin       Decimal? @db.Decimal(8, 6)
  roic            Decimal? @db.Decimal(8, 6)
  returnOnEquity  Decimal? @db.Decimal(8, 6)

  // Dividendos
  dividendPerShare Decimal? @db.Decimal(10, 4)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@unique([companyId, periodType, fiscalYear, fiscalQuarter])
  @@index([companyId, periodEnd])
  @@index([companyId, periodType, fiscalYear])
  @@map("fundamentals")
}

enum PeriodType {
  QUARTERLY
  ANNUAL

  @@map("period_type")
}

// ── PREÇOS EOD (PostgreSQL, NÃO R2) ───────────
model Price {
  ticker String
  date   DateTime @db.Date
  open   Decimal? @db.Decimal(12, 4)
  high   Decimal? @db.Decimal(12, 4)
  low    Decimal? @db.Decimal(12, 4)
  close  Decimal  @db.Decimal(12, 4)
  volume BigInt?

  company Company @relation(fields: [ticker], references: [ticker])

  @@id([ticker, date]) // PK composta = índice (ticker, date), <5ms por query
  @@map("prices")
}

// ── PORTFÓLIO / WATCHLIST ─────────────────────
model Portfolio {
  id        String   @id @default(cuid())
  userId    String   @unique // 1 portfólio por user no MVP
  name      String   @default("O Meu Portfólio")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user  User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  items PortfolioItem[]

  @@map("portfolios")
}

model PortfolioItem {
  id          String   @id @default(cuid())
  portfolioId String
  companyId   String
  addedAt     DateTime @default(now())

  portfolio Portfolio @relation(fields: [portfolioId], references: [id], onDelete: Cascade)
  company   Company   @relation(fields: [companyId], references: [id])

  @@unique([portfolioId, companyId])
  @@index([portfolioId])
  @@map("portfolio_items")
}

// ── AI INSIGHTS (CACHE) ───────────────────────
model AIInsightCache {
  id        String @id @default(cuid())
  companyId String @unique

  executiveSummary String @db.Text
  moat             String @db.Text
  catalysts        String @db.Text // JSON array serializado
  risks            String @db.Text // JSON array serializado

  modelVersion String
  generatedAt  DateTime @default(now())
  expiresAt    DateTime // generatedAt + 24h

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId, expiresAt])
  @@map("ai_insight_cache")
}

// ── CONTROLO DE USO DE AI ─────────────────────
model AIUsageLog {
  id     String   @id @default(cuid())
  userId String
  ticker String
  usedAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, usedAt])
  @@map("ai_usage_logs")
}
```

**Notas de schema:**
- Valores monetários sempre `Decimal` (nunca `Float`) — precisão financeira.
- Rácios/percentagens como `Decimal(8,6)` (ex: `0.430000`); converter para % no frontend.
- `Price` relaciona com `Company` por **`ticker`** (não `companyId`) porque a PK
  é `(ticker, date)` e os scripts de ingestão fazem upsert direto por ticker.
- Auth: `auth.users` (Supabase) sincroniza com `public.users` via trigger SQL
  `on_auth_user_created`. Não escrever JWT à mão.

---

## 5. Arquitetura de dados

**Princípio:** o utilizador nunca fala diretamente com APIs externas. Só o backend
as chama (esconde as API keys). Tudo o que é histórico fica cacheado em PostgreSQL.

### Fontes (todas a 0€)
| Fonte | Para quê | Notas |
|---|---|---|
| **SEC EDGAR** | Fundamentais históricos (10-K, 10-Q) | `data.sec.gov/api/xbrl/companyfacts/{CIK}.json`. User-Agent obrigatório, ≤10 req/s. Tags XBRL variam por empresa → ingestão tenta múltiplos tags por ordem. |
| **Polygon.io** | Preços EOD históricos | `api.polygon.io/v2/aggs/...`. Free tier 5 req/min → sleep 13s. Atualização diária pede só dias novos (`SELECT MAX(date)`). |
| **Finnhub** | Preço atual (on-demand) | `/quote?symbol=...`. Só quando o user abre `/stock/[ticker]`. Free tier 60 calls/min. |
| **Gemini** | AI Insights | Modelo Flash via config. Free tier 15 req/min, 1M tokens/dia. Output JSON estruturado, em português. |

### Scripts de ingestão (Python, em GitHub Actions)
- `seed_companies.py` — manual, 1x. Download de `company_tickers.json`, filtra S&P 500, insere em `companies` (ticker, nome, CIK, exchange, sector) + logos via Finnhub.
- `ingest_fundamentals.py` — cron semanal (domingo 3h UTC). Por empresa: EDGAR → extrai campos (com fallback de tags) → calcula FCF/margens/ROIC → upsert em `fundamentals` → sleep 0.2s.
- `ingest_prices.py` — cron diário (6h UTC, pós-fecho US). Por empresa: pede dias novos ao Polygon → upsert em `prices` → sleep 13s.

### Fórmulas (calculadas, não vêm direto do EDGAR)
```
Free Cash Flow   = Operating CF − CapEx
Gross Margin     = Gross Profit / Revenue
Operating Margin = Operating Income / Revenue
Net Margin       = Net Income / Revenue
ROIC             = NOPAT / Invested Capital
                   NOPAT = Operating Income × (1 − Tax Rate)
                   Invested Capital = Total Assets − Current Liabilities − Cash
FCF Yield        = Free Cash Flow / Market Cap   (precisa do preço atual)
CAGR             = (valor_final / valor_inicial) ^ (1 / nº_anos) − 1
```

### Métricas dependentes do preço
Tudo o que depende do preço atual (Market Cap, FCF Yield, EV/EBITDA, P/E, P/Book…)
**calcula-se no backend no momento do page load** — nunca se guarda na BD, porque
o preço muda.

---

## 6. Estrutura de pastas (proposta — confirmar/ajustar no repo real)

```text
bullquant/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                 # seed do S&P 500 na tabela companies
├── messages/
│   ├── pt.json                 # i18n primário
│   └── en.json
├── scripts/                    # ingestão Python (corre em GitHub Actions)
│   ├── seed_companies.py
│   ├── ingest_fundamentals.py
│   └── ingest_prices.py
├── .github/workflows/
│   ├── ingest-prices.yml       # cron diário
│   └── ingest-fundamentals.yml # cron semanal
├── app/                            # App Router na RAIZ (não em src/)
│   ├── (marketing)/                # grupo PÚBLICO — landing, sem AppSidebar
│   │   ├── layout.tsx              # <Header /> público
│   │   └── page.tsx                # landing (redireciona p/ /dashboard se autenticado)
│   ├── (auth)/                     # login/registo/reset (sem header da app)
│   │   ├── actions.ts              # server actions de auth (login → /dashboard)
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (app)/                      # grupo PRIVADO — terminal financeiro
│   │   ├── layout.tsx              # <AppSidebar /> + <AppHeader /> fixos
│   │   ├── dashboard/              # Insights (screener de listas curadas)
│   │   │   ├── page.tsx            # server: auth + getCategoryCompanies()
│   │   │   └── DashboardClient.tsx # client: tabs + grelha + preços batch
│   │   ├── calendar/page.tsx       # Earnings Calendar (estimates + beat/miss)
│   │   ├── portfolio/page.tsx
│   │   ├── stock/[ticker]/page.tsx
│   │   ├── dcf/page.tsx
│   │   └── settings/page.tsx
│   └── api/
│       ├── search/route.ts
│       ├── price/[ticker]/route.ts        # preço atual (Finnhub)
│       ├── prices/[ticker]/route.ts       # histórico EOD (Prisma → tabela prices)
│       ├── prices/batch/route.ts          # preços em lote (Finnhub, cache 60s, chunked)
│       ├── earnings/route.ts              # earnings calendar
│       ├── fundamentals/[ticker]/route.ts
│       ├── dcf-data/[ticker]/route.ts
│       └── portfolio/
│           ├── route.ts                   # GET
│           ├── add/route.ts
│           ├── check/route.ts
│           └── remove/route.ts
├── components/
│   ├── ui/                 # shadcn/ui
│   ├── layout/             # AppSidebar, AppHeader, Header (marketing)
│   ├── search/SearchBar.tsx
│   ├── stock/             # StockCard, FundamentalsSnapshot, PriceChart…
│   ├── calendar/EarningsCalendar.tsx
│   ├── dcf/
│   └── portfolio/
├── lib/
│   ├── prisma.ts          # singleton do PrismaClient
│   ├── supabase/          # clientes Supabase (server/client)
│   └── finance/           # cálculos + screener.ts (listas curadas), format.ts, dcf.ts…
└── .env.local
```

> **Route groups:** `(marketing)` é público (landing), `(app)` é o terminal privado
> com sidebar/header próprios, `(auth)` são as páginas de login. O `app/layout.tsx`
> raiz **não** renderiza header nenhum — cada grupo trata do seu. Após login, o
> destino é `/dashboard`.

---

## 7. Convenções de código

- **Ficheiros de componentes:** `PascalCase.tsx` (`SearchBar.tsx`, `PriceChart.tsx`).
- **Ficheiros de lib/util:** `camelCase.ts` (`prisma.ts`, `cagr.ts`).
- **Componentes:** funcionais, `PascalCase`. Server Components por defeito; só
  marcar `"use client"` quando há estado/efeitos/interatividade (gráficos, sliders,
  polling, autocomplete).
- **API routes:** App Router (`route.ts` com `export async function GET/POST/...`).
  Nomes de rota em minúsculas (`/api/ai-insights`).
- **Tipos:** TypeScript estrito. Evitar `any`/`unknown` sem necessidade real.
  Reutilizar os tipos gerados pelo Prisma em vez de redefinir.
- **Cálculos financeiros:** isolados em `lib/finance/` — testáveis, sem dependência de UI.
- **DCF:** corre **no cliente** (JS puro), sem chamada ao backend; só o
  autopreencher (`/api/dcf-data/[ticker]`) toca no servidor.
- **i18n:** todo o texto de UI em `messages/pt.json` / `en.json`. Nomes de empresas,
  tickers e dados financeiros ficam como estão (inglês).
- **N/A vs 0:** quando um valor é `null`, mostrar **"N/A"**, nunca `0`.
- **Cores semânticas:** verde/vermelho só onde faz sentido (variações, margens,
  cash vs debt). Não colorir P/E.
- **Formatação:** valores grandes em B/M com auto-formatação; preços/variação em USD.

---

## 8. Variáveis de ambiente

```env
# Supabase
DATABASE_URL=                     # connection string (pooled)
DIRECT_URL=                       # connection string direta (migrations)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=             # url da aplicação para auth redirects (ex: http://localhost:3001)
SUPABASE_SERVICE_ROLE_KEY=        # só no servidor, NUNCA exposto ao browser

# APIs externas (só no servidor)
FINNHUB_API_KEY=
POLYGON_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=                     # nome do modelo Flash (não hardcoded no código)

# i18n
NEXT_PUBLIC_DEFAULT_LOCALE=pt
```

Regra: nada que seja chave de API externa pode ter prefixo `NEXT_PUBLIC_`. Só
`DATABASE_URL`/`DIRECT_URL` precisam de ambas as connection strings (Supabase +
pooling).

---

## 9. O que NÃO fazer

**Decisões técnicas já fechadas (não questionar nem reintroduzir):**
| Não usar | Porquê |
|---|---|
| Cloudflare R2 para preços | Preços ficam em PostgreSQL `(ticker, date)`, <5ms. R2 só para blobs no futuro. |
| Express separado | Next.js API Routes / Server Actions chegam. |
| Socket.IO / WebSockets | Polling de 60s chega para value investing. O "1s polling" do mockup rebenta free tiers. |
| yfinance | Uso comercial proibido nos ToS do Yahoo. Usar Polygon.io. |
| Scrapers europeus | Quebram, ficam bloqueados. Europa completa → v2 com API paga. |
| MS SQL Server / Oracle | Prisma + PostgreSQL é a escolha. Oracle nem é suportado por Prisma. |
| Redis | Só se houver problema de performance real. Cache começa em PostgreSQL. |
| React Query / TanStack | Server Components resolvem a maioria. Adicionar só se necessário. |

**Erros de implementação a evitar:**
- Hardcoded de texto de UI (tem de ir para i18n).
- Hardcoded do nome do modelo Gemini (ler de `GEMINI_MODEL`).
- Expor API keys ao browser (frontend faz polling ao **próprio backend**, nunca à Finnhub).
- Mostrar `0` quando devia ser `N/A`.
- Alterar a BD à mão em vez de migration.
- Guardar na BD métricas dependentes do preço (calcular no page load).
- Transportar os bugs do mockup do Costa: EV/EBITDA errado (3251 vs ~48),
  P/Book errado (1679 vs ~30), moeda EUR/USD misturada, "1s polling", runtime error ativo.
- AI Insights a "alucinar": se a empresa é desconhecida do Gemini, responder
  "Dados insuficientes para análise", não inventar.

---

## 10. Features MVP (6) — o que cada página contém

### 1. Autenticação (Supabase Auth)
Registo email+password, login/logout, reset de password, perfil simples (nome,
email, plano). `User.plan` nasce `FREE`. OAuth/2FA são v1.

### 2. Pesquisa de Ticker
Barra global no header. Autocomplete (debounce 300ms) com ticker + nome + exchange
+ logo. Navegação por teclado (↑↓ Enter Esc). Recentes em localStorage (5).
Corre contra a tabela `companies` (`/api/search?q=`), **não** chama APIs externas.
Empresa fora da BD → "Empresa não disponível ainda". Seleção → `/stock/[ticker]`.

### 3. Página de Stock (`/stock/[ticker]`) — a mais importante
- **3a. Header:** logo, nome, ticker, exchange, preço atual USD (polling 60s só
  enquanto o user está na página), variação diária (€ e %), botão Adicionar ao
  Portfólio / Seguido ✓. Preço via `/api/price/[ticker]` (Finnhub no backend).
- **3b. Fundamentais Snapshot (5 blocos):** Valuation (Market Cap, P/E trailing,
  Forward P/E, P/Sales, EV/EBITDA, P/Book) · Cash Flow (Operating CF, FCF, FCF Yield)
  · Margins & Growth (Profit/Operating/Gross Margin, Revenue YoY, Earnings YoY) ·
  Balance (Cash, Total Debt, Net Cash) · Dividend (Yield, Payout). Forward P/E e
  estimativas de analistas → N/A com tooltip "Disponível em breve" (não há a 0€).
- **3c. Price History:** `<AreaChart>` Recharts. Tabs 1M·6M·1A·5A·MÁX. Dados EOD
  via `/api/prices/[ticker]` (**Prisma → tabela `prices`**, não R2). Frontend filtra
  o período após receber o array. Tooltip + % de variação no período.
- **3d. Financials & Decision Engine:** grelha de gráficos de 10 anos. Toggle
  Trimestral·TTM·Anual. 9 gráficos MVP: Revenue, EPS Diluted, ROIC (linha 15%),
  FCF (OCF barras + CapEx linha), Shares Outstanding (verde se desce/vermelho se
  sobe), Net Income, Profit Margin (média histórica), Gross Margin, Cash & Debt.
  Cada um: tooltip, expandir full-screen, toggle Gráficos/Tabela, CAGR no canto.
  Dados de `fundamentals` filtrados por `companyId`, ordenados por `periodEnd`.
  TTM = soma dos últimos 4 trimestres.

### 4. Portfólio / Watchlist (`/portfolio`)
No MVP, portfólio = watchlist (sem preço de compra nem P&L). Lista de tickers
(logo, nome, preço atual, variação). Stats: nº posições, quantas em alta hoje.
Adicionar (via pesquisa) / remover. Estado vazio com sugestões. Preços via batch
ao Finnhub no load (não polling contínuo). 1 portfólio por user.

### 5. Calculadora DCF (`/dcf`)
Dois painéis. Esquerda: pesquisa para autopreencher (ou modo manual) com Preço
Atual, FCF inicial, Crescimento anos 1-5 e 6-10 (sliders), WACC (default 10%),
Terminal Growth (default 2.5%), Nº de ações. Direita: Fair Value, Preço Atual,
Margem de Segurança (badge + barra), Enterprise Value, Valor Terminal, FCF PV.
Cálculo **no cliente**, em tempo real com os sliders. Autopreencher via
`/api/dcf-data/[ticker]`. Aviso educativo obrigatório.
```
FCF_n = FCF_0 × (1 + g_n)^n ;  PV = FCF_n / (1 + WACC)^n
Fair Value = (Σ PV + Terminal Value) / Shares
```

### 6. AI Insights (`/ai-insights`)
Pesquisa + botão Analisar. Output estruturado: Resumo Executivo, Moat,
Catalisadores (3-5), Riscos (3-5). Loading ~5-15s. Timestamp + aviso "não é
conselho de investimento". Fluxo em `/api/ai-insights`:
1. Verificar `AIUsageLog` (limite diário, sugestão 5 no free) → senão 429 amigável.
2. Verificar `AIInsightCache` (TTL 24h) → se válido, serve instantâneo.
3. Senão, chamar Gemini (JSON estruturado, em PT) → guardar cache + log.

### Extras já implementados (fora das 6 MVP originais)

**Dashboard / Insights (`/dashboard`)** — landing pós-login do grupo `(app)`.
Hero "Insights" + tabs horizontais de categorias + grelha de `StockCard`. Os dados
base (ticker, nome, logo, sharesOutstanding) vêm do PostgreSQL no server; os preços
ao vivo são pedidos pelo cliente em lote via `/api/prices/batch` (Finnhub, cache 60s).
Market Cap é calculado no card (`shares × preço`), nunca guardado.
- ⚠️ As categorias (`Growth`, `Dividend Growth`, `Buyback Machines`, etc.) em
  `lib/finance/screener.ts` são **listas temáticas CURADAS** (arrays de tickers
  validados contra a BD), **não** um screener por métricas. Não fingir o contrário.
  Screening real (CAGR de revenue, buybacks via `sharesOutstanding`, dividend growth)
  é um TODO — bloqueado pela qualidade atual dos dados de ingestão (revenues com tags
  XBRL erradas). As `tabs` usam **chaves estáveis** (`sp500`, `growth`…); os labels
  são traduzidos via i18n (`messages/*.json` → `dashboard.tabs.*`).

**Earnings Calendar (`/calendar`)** — grelha mensal de resultados. Cada `EventChip`
abre um `<Dialog>` com **estimates** (EPS/revenue estimados) e, nos já reportados,
indicação visual de **beat/miss** (bateu ou não as expectativas). Dados via
`/api/earnings`. Ingestão: `scripts/ingest_earnings.py` + `.github/workflows/ingest-earnings.yml`.

**Guardar análises DCF** — na calculadora, com uma empresa carregada, o utilizador
pode **guardar cenários DCF** (inputs + snapshot do fair value/margem) e revisitá-los
mais tarde (carregar de volta aos sliders ou apagar). Modelo `DcfAnalysis`
(tabela `dcf_analyses`), por `userId` + `companyId`. API: `GET/POST /api/dcf/analyses`
e `DELETE /api/dcf/analyses/[id]`. UI em `components/dcf/SavedAnalyses.tsx`.

> ⚠️ **Migrations vs db push:** a BD tem *drift* — `earnings_events` e `dcf_analyses`
> foram criadas com `prisma db push` (aditivo, não-destrutivo), **não** com migration.
> Por isso `prisma migrate dev` agora detetaria drift e quereria **resetar a BD
> (apaga tudo)**. Até alguém consolidar o histórico de migrations, usar `prisma db push`
> para mudanças aditivas. Carregar `.env.local` antes (`set -a; . ./.env.local; set +a`)
> porque o Prisma CLI lê `.env`, não `.env.local`.

---

## 11. Roadmap (resumo — 12 semanas, início 23 Jun 2026)

Schema primeiro, deploy desde o dia 1, uma feature de cada vez, beta fechado antes
do público. Sequência: S1 infra+schema+dados teste · S2 auth+pesquisa+i18n ·
S3-5 página de stock (header→snapshot→price chart→decision engine) · S6 portfólio ·
S7 DCF · S8 AI Insights · S9 ingestão S&P 500 + polish · S10-11 beta fechado ·
S12 lançamento via Bullocracy.

**Regra de corte:** se em S8 uma feature MVP ainda não funciona ponta-a-ponta, é
cortada para v1. O lançamento não atrasa.

---

## Avisos finais

- Consulta sempre o `schema.prisma` real antes de mexer em dados.
- Onde os docs antigos disserem R2 ou 15 anos, segue a secção §1 deste ficheiro.
- Avisa quando uma instrução contradisser estas decisões — não implementes em silêncio.
- Reviews obrigatórias antes de merge: o código gerado por IA funciona, mas nem
  sempre é coerente com o resto da app.
