# Documentação Técnica dos Pipelines de Dados
## BullQuant — Notícias, CEOs e Transações de Insiders

---

## 1. Notícias da Empresa (`StockNews`)

### 1.1 Origem dos Dados
| Propriedade | Detalhe |
|---|---|
| **Fonte** | [Finnhub.io](https://finnhub.io) — endpoint `/api/v1/company-news` |
| **Custo** | Gratuito (incluído no plano free com a chave existente) |
| **Autenticação** | `FINNHUB_API_KEY` (variável de ambiente, nunca exposta ao browser) |
| **Janela temporal** | Últimos **60 dias** a partir da data do pedido |
| **Volume** | Até 50 artigos por empresa (após deduplicação) |

### 1.2 Fluxo Completo (Request → UI)

```
Browser
  │
  └─► GET /api/news/[ticker]          ← Next.js API Route (Server-side)
          │
          └─► GET finnhub.io/api/v1/company-news?symbol=TICKER&from=...&to=...
                  │
                  └─► [Array de artigos brutos do Finnhub]
                          │
                          ├─ 1. Deduplica por headline (primeiros 70 chars)
                          ├─ 2. Normaliza imagens (filtra logos genéricos do Yahoo)
                          ├─ 3. Ordena: artigos c/ imagem real primeiro, depois por data
                          └─ 4. Limita a 50 artigos
                                  │
                                  └─► JSON { articles: [...] }  ──► StockNews.tsx
                                                                      │
                                                                      ├─ Cards c/ thumbnail (imagem real)
                                                                      └─ Linhas de texto (sem imagem real)
```

### 1.3 Caching
- A API route usa `next: { revalidate: 900 }` → **cache de 15 minutos** no servidor Next.js
- Significa que o mesmo ticker não faz mais de 4 pedidos/hora ao Finnhub
- O browser não faz cache extra (cada visita à página usa o cache do servidor)

### 1.4 Filtro de Imagens — Porquê?
O Finnhub agrega artigos de várias fontes. Artigos do **Yahoo Finance** têm sempre o mesmo logo genérico (`s.yimg.com/rz/stage/p/yahoo_finance_en-US_h_p_finance_2.png`) em vez de uma imagem real do artigo. Este URL está explicitamente banido pelo campo `GENERIC_IMAGE_PATTERNS` no API route — a imagem é convertida para `null` e o componente mostra uma linha de texto limpa em vez de um thumbnail esticado com um logo.

Padrões banidos atualmente:
- `s.yimg.com/rz/stage` — Logo genérico do Yahoo Finance
- `yahoo_finance_en-US_h_p` — Variante do mesmo logo
- `static.finnhub` / `finnhub.io/static` — Placeholders do Finnhub

### 1.5 Ficheiros Envolvidos
| Ficheiro | Responsabilidade |
|---|---|
| [`app/api/news/[ticker]/route.ts`](file:///Users/tiagocosta18/Documents/antigravity/blissful-rutherford/bullquant/app/api/news/%5Bticker%5D/route.ts) | Pedido ao Finnhub, filtragem, ordenação, resposta JSON |
| [`components/stock/StockNews.tsx`](file:///Users/tiagocosta18/Documents/antigravity/blissful-rutherford/bullquant/components/stock/StockNews.tsx) | Rendering dos cards, skeletons, expand/collapse |
| `messages/pt.json` + `messages/en.json` | Traduções (`news.*`) |

### 1.6 Limitações Conhecidas
- O Finnhub free tier tem **limite de 60 pedidos/minuto**. O cache de 15 min protege contra isso.
- Algumas empresas têm poucos artigos porque o Finnhub só agrega fontes anglófonas.
- Não há armazenamento em base de dados — os dados são sempre buscados em tempo real (com cache).

---

## 2. CEOs (`CompanyProfile`)

### 2.1 Origem dos Dados
| Propriedade | Detalhe |
|---|---|
| **Fonte primária** | [Yahoo Finance](https://finance.yahoo.com) via biblioteca Python `yfinance` |
| **Fonte secundária** | Overrides manuais para estruturas de partnership (ver §2.4) |
| **Custo** | Gratuito (yfinance usa scraping não-oficial da API do Yahoo) |
| **Armazenamento** | Coluna `ceo String?` na tabela `companies` (PostgreSQL / Supabase) |
| **Frequência de atualização** | **1x por mês** via GitHub Actions Cron |

### 2.2 Fluxo de Ingestão (Script Python)

```
GitHub Actions (1º de cada mês, 02:00 UTC)
  │
  └─► python scripts/ingest_ceos.py
          │
          ├─ 1. Lê todos os tickers ativos da tabela `companies`
          │
          └─► Para cada ticker:
                  │
                  ├─ A. Verifica HARDCODED_CEOS → retorna override imediato se existir
                  │
                  ├─ B. Resolve alias de ticker (BF.B → BF-B, BRK.B → BRK-B)
                  │      [Yahoo Finance usa hífen, não ponto]
                  │
                  ├─ C. yfinance.Ticker(ticker).info["companyOfficers"]
                  │
                  ├─ D. Passagem 1 — pesquisa keywords CEO estritas:
                  │      "chief executive officer", "ceo", "president & ceo", etc.
                  │
                  ├─ E. Passagem 2 — fallback para President/Director:
                  │      "president & director", "chairman & ceo", "executive chairman"
                  │      [usado quando a empresa não tem título "CEO" explícito]
                  │
                  └─► UPDATE companies SET ceo = '...' WHERE ticker = '...'
                              │
                              └─► sleep 0.5s → próximo ticker
```

### 2.3 Fluxo de Leitura (UI)

```
Next.js page.tsx (Server Component)
  │
  └─► prisma.company.findUnique({ where: { ticker } })
          │
          └─► company.ceo  ──►  CompanyProfile.tsx
                                    │
                                    └─► Mostra nome do CEO com ícone User (singular)
                                        ou "-" se ceo === null
```

> **Nota:** Não há API route para o CEO. O dado já vem incluído no objeto `company` que a página de stock faz fetch no servidor durante o render inicial. Custo zero em pedidos extra ao cliente.

### 2.4 Overrides Hardcoded — Casos Especiais
Apenas **2 empresas** têm override permanente, por razões estruturais genuínas (não por lacuna de dados):

| Ticker | Empresa | Motivo |
|---|---|---|
| `APO` | Apollo Global Management | Estrutura de partnership — Marc Rowan é o CEO equivalente mas o Yahoo não o lista com esse título |
| `ARES` | Ares Management | Idem — Michael Arougheti tem o título "Co-CEO" mas o Yahoo omite-o dos `companyOfficers` |

> ⚠️ **Regra:** Nunca adicionar empresas ao `HARDCODED_CEOS` apenas porque o Yahoo Finance tem uma lacuna de dados. Essas empresas devem mostrar `"-"` na UI — dados em falta são preferíveis a dados potencialmente desatualizados.

### 2.5 Mapeamento de Tickers (Dot → Hyphen)
O Yahoo Finance usa hífens nos tickers com ponto. Sem este mapeamento, o `yfinance` retorna `info` vazio:

| Ticker na BD | Ticker para yfinance |
|---|---|
| `BF.B` | `BF-B` |
| `BRK.B` | `BRK-B` |

### 2.6 Resultado da Última Execução
- **503 empresas** no universo S&P 500
- **492/503 com CEO** via Yahoo Finance (automático)
- **2/503 com CEO** via override estrutural (APO, ARES)
- **9/503 sem CEO** — Yahoo Finance não expõe o CEO dessas empresas (mostram `"-"`)

### 2.7 Ficheiros Envolvidos
| Ficheiro | Responsabilidade |
|---|---|
| [`scripts/ingest_ceos.py`](file:///Users/tiagocosta18/Documents/antigravity/blissful-rutherford/bullquant/scripts/ingest_ceos.py) | Extração via yfinance, lógica de fallback, UPDATE na BD |
| [`scripts/fix_missing_ceos.py`](file:///Users/tiagocosta18/Documents/antigravity/blissful-rutherford/bullquant/scripts/fix_missing_ceos.py) | Script de diagnóstico/reparação manual (uso único) |
| [`.github/workflows/ingest-ceos.yml`](file:///Users/tiagocosta18/Documents/antigravity/blissful-rutherford/bullquant/.github/workflows/ingest-ceos.yml) | Cron GitHub Actions (1º de cada mês, 02:00 UTC) |
| [`components/stock/CompanyProfile.tsx`](file:///Users/tiagocosta18/Documents/antigravity/blissful-rutherford/bullquant/components/stock/CompanyProfile.tsx) | Rendering do campo CEO na UI |
| [`prisma/schema.prisma`](file:///Users/tiagocosta18/Documents/antigravity/blissful-rutherford/bullquant/prisma/schema.prisma) | Modelo `Company` com campo `ceo String?` |

---

## 3. Transações de Insiders (`InsiderActivity`)

### 3.1 Origem dos Dados
| Propriedade | Detalhe |
|---|---|
| **Fonte** | [Finnhub.io](https://finnhub.io) — endpoint `/api/v1/stock/insider-transactions` |
| **Origem regulatória** | SEC Form 4 (EUA) — obrigatório para diretores, executivos e acionistas >10% |
| **Custo** | Gratuito (plano free do Finnhub) |
| **Janela de ingestão** | Últimos **365 dias** por execução do cron |
| **Armazenamento** | Tabela `insider_transactions` (PostgreSQL / Supabase) |
| **Frequência de atualização** | **1x por semana** (domingo, 07:30 UTC) via GitHub Actions |

### 3.2 Fluxo de Ingestão (Script Python)

```
GitHub Actions (Domingo, 07:30 UTC)
  │
  └─► python scripts/ingest_insider.py
          │
          ├─ 1. Lê todos os tickers ativos da BD
          ├─ 2. Define janela: [hoje - 365 dias, hoje]
          │
          └─► Para cada ticker:
                  │
                  ├─ GET finnhub.io/stock/insider-transactions?symbol=TICKER&from=...&to=...
                  │
                  ├─ Para cada transação retornada:
                  │   ├─ Valida campos obrigatórios (name, change, transactionDate)
                  │   ├─ Mapeia código SEC → tipo:
                  │   │     P → BUY  (compra em mercado aberto)
                  │   │     S → SELL (venda em mercado aberto)
                  │   │     A, M, G, F, J, ... → OTHER (atribuições, exercícios, etc.)
                  │   ├─ Calcula value = |shares| × price  (se price disponível)
                  │   └─ Prepara payload para upsert
                  │
                  ├─ UPSERT com chave natural:
                  │   (companyId, insiderName, transactionDate, transactionCode, sharesChange)
                  │   → Se já existe, atualiza price/value/filedAt
                  │   → Se é nova, insere
                  │
                  └─► sleep 1.1s → próximo ticker  [respeita limite 60 req/min do Finnhub]
```

### 3.3 Chave Natural do Upsert — Porquê?
O Finnhub pode retornar as mesmas transações em múltiplas execuções do cron (a janela de 365 dias tem grande sobreposição semana a semana). O upsert garante **idempotência**: correr o script 10 vezes não duplica dados.

A chave `(companyId, insiderName, transactionDate, transactionCode, sharesChange)` é suficientemente específica porque:
- Um insider raramente faz 2 transações do mesmo tipo com exatamente o mesmo número de ações no mesmo dia
- O `transactionCode` garante que uma compra e uma venda no mesmo dia pelo mesmo insider são registadas separadamente

> **Detalhe:** O `transactionCode` nunca é `NULL` na BD — quando o Finnhub não fornece código, é guardado como string vazia `""`. Isto evita que o PostgreSQL trate dois `NULL` como distintos e duplique registos.

### 3.4 Fluxo de Leitura (UI)

```
Browser → GET /api/insider/[ticker]    ← Next.js API Route
                │
                └─► prisma.insiderTransaction.findMany({
                        where: { companyId },
                        orderBy: { transactionDate: "desc" },
                        take: 100
                    })
                            │
                            ├─ Serializa Decimal → number
                            ├─ Calcula summary dos últimos 90 dias
                            │     (buyCount, sellCount, buyValue, sellValue)
                            └─► JSON { transactions, summary }
                                        │
                                        └─► InsiderActivity.tsx (Client Component)
                                                │
                                                ├─ Agrupa por (insiderName + date + type)
                                                │   → consolida lotes múltiplos do mesmo dia
                                                │   → preserva o código SEC do lote mais específico
                                                │
                                                ├─ Ordena por data desc
                                                ├─ Mostra 5 por defeito
                                                ├─ Tooltip no badge Tipo → explica o código SEC
                                                └─► "Mostrar mais N" se > 5
```

### 3.5 Agrupamento de Transações no Frontend
O Finnhub pode dividir uma única ordem grande em múltiplos registos (lotes separados executados ao longo do mesmo dia). O `InsiderActivity.tsx` agrupa-os com a chave `insiderName + transactionDate + type`:

- **shares:** somadas
- **value:** somado (recalcula price médio ponderado)
- **transactionCode:** preserva o código do primeiro lote com código não-nulo (regra de preservação de dados, bug corrigido em 29/06/2026)

### 3.6 Mapeamento de Códigos SEC
| Código | Significado | Tipo na BD |
|---|---|---|
| `P` | Open Market Purchase (compra voluntária) | `BUY` |
| `S` | Open Market Sale (venda voluntária) | `SELL` |
| `A` | Grant / Award (atribuição pela empresa) | `OTHER` |
| `M` | Option Exercise (exercício de opções) | `OTHER` |
| `F` | Tax Withholding / Payment In Kind | `OTHER` |
| `G` | Gift (doação) | `OTHER` |
| `J` | Other (outro) | `OTHER` |
| *(vazio)* | Não especificado pelo Finnhub | `OTHER` |

> **Nota de interpretação:** Apenas `P` e `S` representam decisões voluntárias de mercado pelo insider. Os tipos `OTHER` são maioritariamente obrigações fiscais ou atribuições da empresa — devem ser interpretados com cautela.

### 3.7 Janela do Resumo (Summary Chips)
O componente mostra chips de resumo no topo com compras e vendas dos **últimos 90 dias**. Este valor é calculado no API route em memória, após buscar as 100 transações mais recentes da BD.

> ⚠️ **Limitação:** Se uma empresa tiver mais de 100 transações nos últimos 90 dias, o summary pode estar incompleto. Na prática, isto é raro no S&P 500.

### 3.8 Ficheiros Envolvidos
| Ficheiro | Responsabilidade |
|---|---|
| [`scripts/ingest_insider.py`](file:///Users/tiagocosta18/Documents/antigravity/blissful-rutherford/bullquant/scripts/ingest_insider.py) | Fetch Finnhub, mapeamento de tipos, upsert na BD |
| [`.github/workflows/ingest-insider.yml`](file:///Users/tiagocosta18/Documents/antigravity/blissful-rutherford/bullquant/.github/workflows/ingest-insider.yml) | Cron GitHub Actions (domingo, 07:30 UTC) |
| [`app/api/insider/[ticker]/route.ts`](file:///Users/tiagocosta18/Documents/antigravity/blissful-rutherford/bullquant/app/api/insider/%5Bticker%5D/route.ts) | API route — leitura da BD, serialização, summary |
| [`components/stock/InsiderActivity.tsx`](file:///Users/tiagocosta18/Documents/antigravity/blissful-rutherford/bullquant/components/stock/InsiderActivity.tsx) | UI — tabela, agrupamento, tooltips, expand/collapse |
| [`prisma/schema.prisma`](file:///Users/tiagocosta18/Documents/antigravity/blissful-rutherford/bullquant/prisma/schema.prisma) | Modelo `InsiderTransaction` |

---

## Resumo Comparativo dos 3 Pipelines

| | **Notícias** | **CEOs** | **Transações Insiders** |
|---|---|---|---|
| **Fonte** | Finnhub API | yfinance (Yahoo) | Finnhub API |
| **Armazenamento** | ❌ Sem BD (tempo real) | ✅ BD (`companies.ceo`) | ✅ BD (`insider_transactions`) |
| **Atualização** | Cada visita (cache 15min) | Mensal (cron) | Semanal (cron) |
| **Automação** | Next.js cache | GitHub Actions | GitHub Actions |
| **Custo** | $0 | $0 | $0 |
| **Limitação principal** | Logos genéricos do Yahoo | 9 empresas sem CEO | Lotes múltiplos por ordem |
| **Estratégia de fallback** | Mostrar linha de texto | Mostrar `"-"` | Agrupamento no frontend |

---

## 6. Terminal de Notícias (`/news`)

Pipeline autónomo que lê feeds financeiros internacionais, deteta o que está a
mover os mercados e publica um mini-artigo em Português de Portugal assinado
pela Bull Value. É consumido pela plataforma **e** pelo bot de Discord.

Não confundir com a §1: essa é a lista de notícias **por empresa**, em tempo
real, sem persistência nem tradução.

### 6.1 Origem dos Dados

| Fonte | Endpoint | Notas |
|---|---|---|
| Finnhub General | `/api/v1/news?category=general` | Backbone; é a única que traz sempre `summary` utilizável |
| CNBC (Top/Markets/Economy) | 3 feeds RSS | |
| Yahoo Finance | `finance.yahoo.com/news/rssindex` | Muito volume, muito conteúdo evergreen — filtrado na triagem |
| MarketWatch | `feeds.content.dowjones.io/public/rss/mw_topstories` | |
| Investing.com | `investing.com/rss/news_25.rss` | |
| Reuters, Bloomberg | Google News RSS como proxy | **Já não têm RSS público próprio** |

**Descarregamento do corpo:** para as histórias aprovadas (≤5 por execução)
descarregamos o texto do artigo original, para o LLM perceber a notícia em vez
de escrever a partir da manchete. Ver §6.3.

### 6.2 Fluxo (`scripts/ingest_news.ts`, de hora a hora)

```
collectAllSources()        ~300-400 itens, dedup por sha1(título normalizado)
  → janela de 6h           só o que é recente conta como "a bombar"
  → filtro de já-vistos    news_raw_item.dedupKey é @unique
  → clusterItems()         Jaccard >= 0.35 sobre tokens; SEM LLM
  → matchTickers()         cruza com a tabela Company; só para ordenar
  → rankClusters()         score composto: cobertura, tickers, recência
  → triageClusters()       1 chamada Gemini para ~40 histórias
       score >= 70 passa; >= 80 publica automático, 70-79 fica DRAFT
  → generateArticle()      1 chamada Gemini por história, máx 5/execução
  → news_cluster + news_article (transação)
  → purge de news_raw_item órfãos com mais de 30 dias
```

**Porquê triagem em lote:** entram centenas de manchetes por hora. Uma chamada
de LLM por manchete seria ~100x mais cara sem ganho de qualidade. O lote de 40
custa uma chamada e elimina o ruído antes da parte cara (a escrita).

**Porquê o clustering sem LLM primeiro:** uma história que várias fontes
cobrem na mesma janela é o sinal mais barato e mais fiável de relevância.

### 6.3 Extração do Corpo dos Artigos (`lib/news/extract.ts`)

Três decisões que enquadram isto:

1. **Só na fase de escrita.** As ≤5 histórias aprovadas, não as ~300 recolhidas
   — ~5 pedidos HTTP por execução, e é onde o texto faz diferença.
2. **Nunca persistido.** O corpo vive em memória durante a geração e é
   descartado. O que fica na base de dados é o artigo da Bull Value, com
   atribuição e link à origem.
3. **robots.txt respeitado**, verificado *antes* de escolher os alvos (ver
   abaixo porquê), com cache por host e User-Agent identificável.

Ordem de extração: `articleBody` do JSON-LD schema.org primeiro (não sofre com
a maquilhagem do HTML), depois heurística de parágrafos sobre `<article>` e
selectores equivalentes, descartando nav/footer/aside/anúncios. Teto de 6 000
caracteres.

**Cobertura medida** (2026-08-09, amostra dos feeds a sério):

| Host | Corpo obtido | Notas |
|---|---|---|
| finance.yahoo.com | 3/3, ~4 700 chars | |
| www.cnbc.com | 3/3, ~4 200 chars | |
| www.bloomberg.com | 0/3 | Paywall — devolve boilerplate, rejeitado |
| www.marketwatch.com | 0/3 | robots.txt proíbe |
| www.investing.com | 0/3 | HTTP 403 a bots |
| news.google.com | 0/3 | robots.txt proíbe; URLs opacos |

Por host isto dá ~33%, mas a métrica que conta é outra: **4 em 5 das histórias
efetivamente selecionadas obtêm corpo**, com ~5 000 caracteres em média. É o
que interessa, porque `extractBodies` tenta até 3 fontes distintas por história.

**A Reuters é inalcançável.** Tanto o feed do Google News como o próprio
Finnhub servem os artigos da Reuters através de `news.google.com/rss/articles/`
— URLs opacos que o robots.txt do Google proíbe. Contribui manchetes (úteis
para o clustering), nunca corpo.

Três armadilhas encontradas a medir isto, todas corrigidas e com teste de
regressão em `tests/news/extract.test.ts`:

- **O header `Accept` parte o Yahoo Finance.** Com ele, o Yahoo devolve uma
  página reduzida de 111 kB sem corpo; sem ele, o artigo completo de 850 kB.
  Por isso só enviamos `User-Agent` e `Accept-Language`.
- **O Bloomberg passava o filtro com o seu rodapé institucional** ("Connecting
  decision makers to a dynamic network…"), 437 caracteres que iam parar ao
  prompt como se fossem a notícia. Daí o `MIN_BODY_CHARS` de 600 e a lista
  `BOILERPLATE_MARKERS`.
- **O robots.txt tem de ser verificado antes de escolher os alvos.** Verificado
  durante o fetch, os 3 slots eram gastos com URLs do Google News — mais de
  metade dos itens recolhidos — e as fontes que dão texto ficavam de fora.

O prompt de escrita trata o corpo como material para *compreender*: proíbe
tradução frase a frase, cópia da estrutura de parágrafos e citações não
atribuídas.

### 6.4 Conta Gemini e Custo de LLM

O terminal usa uma **conta Gemini própria** (`NEWS_GEMINI_API_KEY` /
`NEWS_GEMINI_MODEL`, acessor em `lib/news/model.ts`), separada da do resto da
app. Duas razões: o cron horário consumiria a quota gratuita que o analista e
os briefs precisam para servir utilizadores em tempo real, e um 429 no cron é
adiável enquanto um 429 no analista é uma falha visível. Sem as variáveis
definidas, cai para `lib/ai/gemini.ts`.

⚠️ Contas Gemini criadas de novo **já não têm acesso ao `gemini-2.5-flash`**
(404: "no longer available to new users") — que é o fallback de
`lib/ai/gemini.ts`. Por isso o `NEWS_GEMINI_MODEL` tem de estar explicitamente
definido. Em 2026-08-09 o `gemini-3.6-flash` responde e escreve bom português
europeu; o `gemini-2.0-flash` devolve 429 no tier gratuito.

⚠️ `lib/news/model.ts` lê o `process.env` **dentro** das funções, nunca no topo
do módulo. Em ESM os imports são avaliados antes do corpo do módulo que os
importa, por isso um `const key = process.env.X` no topo correria antes do
`dotenv.config()` do `scripts/ingest_news.ts` e a chave apareceria vazia
("Method doesn't allow unregistered callers"). O mesmo se aplica a qualquer
módulo novo que leia ambiente e seja usado a partir de `scripts/`.

Por execução: 1 chamada de triagem + no máximo 5 de escrita. Máximo teórico
de 144 chamadas/dia, tipicamente muito menos (o teto de 5 só é atingido em
dias de mercado agitados). Cabe no tier gratuito do Gemini Flash.

A ingestão corre em cron, não é iniciada por um utilizador — por isso **não**
passa por `lib/ai/credits.ts`.

### 6.5 Endpoints

`GET /api/news/latest` — feed público, é o que o **bot de Discord** consulta.

- Ordem **cronológica ascendente** de propósito: o bot lança por ordem de
  acontecimento e guarda o `nextCursor` para o pedido seguinte, o que garante
  que nunca repete nem salta artigos, mesmo depois de estar em baixo.
- `after` (cursor), `since` (ISO), `limit` (1-50, default 10), `category`, `ticker`.
- O desempate do cursor é `(publishedAt, id)` — dois artigos podem partilhar o
  `publishedAt` (é herdado do item líder do cluster).

`GET /api/news/article/[slug]` — artigo individual. Drafts e arquivados dão 404.

`GET /api/news/image/[id]` — proxy da imagem do artigo. As imagens vêm de CDNs
de terceiros arbitrários (`media.zenfs.com`, `image.cnbc.com`, …) e o `img-src`
da CSP da app (next.config.ts) só permite uma allowlist curta — sem proxy, o
browser bloqueia-as e a página fica com um rectângulo vazio. Servi-las da nossa
origem faz com que contem como `'self'`, sem abrir a CSP a `https:` para toda a
aplicação.

O parâmetro é o **id do artigo, nunca um URL**: aceitar um URL arbitrário
transformaria o endpoint num proxy aberto. O DTO expõe as duas formas —
`imageUrl` (original, é o que o bot de Discord usa, porque o Discord vai buscar
a imagem a partir dos servidores dele) e `imageProxyUrl` (o que as páginas web
têm de usar).

Os três usam o bucket `news` do `lib/rateLimit.ts` (200/min). O limite é
generoso porque cada carregamento do terminal pede até 20 imagens ao proxy —
com 60/min a navegação normal de um leitor travava ao fim de três páginas.

### 6.6 Curadoria e Aprovação

**Nada se publica sozinho.** `AUTO_PUBLISH_THRESHOLD` está em 101 (acima do
máximo possível), por isso todos os artigos nascem em `DRAFT`. Ficam invisíveis
no site e no `/api/news/latest` até alguém os aprovar. Ver §6.9.

Dois caminhos de aprovação, sobre a mesma base de dados:

**Discord (telemóvel).** Ao criar um rascunho, o ingestor publica-o num canal
privado com botões *Publicar* / *Rejeitar* (`lib/discord/client.ts`). O push
chega pela app do Discord. O clique volta a
`POST /api/discord/interactions`, que verifica a assinatura Ed25519, confirma
que o utilizador está em `DISCORD_ADMIN_USER_IDS`, muda o estado e substitui os
botões por "Publicado por …". O artigo fica visível no site nesse instante, e o
bot apanha-o no polling seguinte a `/api/news/latest`.

A mensagem é publicada com o **token do bot**, não por webhook de canal: só
webhooks de aplicação podem enviar componentes interativos — num webhook normal
o campo `components` é simplesmente ignorado.

**Um só bot, cliques pelo gateway.** O bot "scs" (`1536062992037449728`) serve
`/analisar` e `/watchlist` pelo **gateway** (discord.py). Registar um
*Interactions Endpoint URL* nessa aplicação faria o Discord entregar **todas**
as interações dela por HTTP e partiria esses comandos — por isso **não se
regista**. O circuito é:

```
backend  --REST-->  publica rascunho com botões  (token do bot "scs")
utilizador clica
Discord  --gateway-->  bot discord.py            (como já faz com os slash commands)
bot      --HTTP-->  POST /api/news/review        (Bearer NEWS_REVIEW_SECRET)
backend  muda o estado, o artigo fica visível
```

Publicar mensagens com componentes é uma chamada REST normal e não exige
endpoint de interações — só a *entrega dos cliques* é que depende disso.

**`POST /api/news/review`** — `Authorization: Bearer <NEWS_REVIEW_SECRET>`,
corpo `{ articleId, action: "publish"|"reject", discordUserId }`. Idempotente:
um duplo-clique devolve `alreadyHandled: true` em vez de erro.
**`GET /api/news/review`** — rascunhos pendentes, para o bot recuperar depois de
estar em baixo.

O `custom_id` dos botões é `news:publish:<articleId>` / `news:reject:<articleId>`.

Camadas de autorização, ambas a falhar fechado:
- segredo em falta ⇒ **503, recusa tudo**. Um deploy incompleto não pode abrir
  a publicação a quem descubra o URL;
- `discordUserId` é validado contra `DISCORD_ADMIN_USER_IDS` **além** do
  segredo. Um bug no bot que reencaminhe o clique de outra pessoa não chega
  para pôr um artigo no ar.

**`/api/discord/interactions` continua a existir** como alternativa, para o caso
de algum dia se migrar para uma aplicação dedicada em modo HTTP. Sem
`DISCORD_PUBLIC_KEY` configurada rejeita tudo, por isso hoje está inerte.

⚠️ `DISCORD_ADMIN_USER_IDS` são **ids numéricos**, não usernames — `tiagocostaf1`
nunca corresponderia ao `user.id` que o Discord envia, e o resultado seria
ninguém conseguir aprovar, sem erro visível. O id do Costa é
`427931236405608448`.

Segurança do endpoint de interações, tudo com teste de regressão em

`tests/news/discordVerify.test.ts`:
- assinatura Ed25519 obrigatória (sem ela, quem descobrisse o URL publicava);
- janela de 5 minutos no timestamp, contra reenvio de pedidos antigos;
- `DISCORD_PUBLIC_KEY` em falta ⇒ **rejeita tudo**. Falhar fechado, porque um
  deploy sem a variável abria a publicação a qualquer pessoa;
- `DISCORD_ADMIN_USER_IDS` vazio ⇒ **ninguém aprova**. Toda a gente com acesso
  ao canal vê os botões, por isso "sem allowlist" não pode significar "todos".

Se as variáveis do Discord não estiverem definidas, o pipeline funciona na
mesma — só não há notificação.

**Web.** `/{locale}/admin/news` lista os últimos 100 artigos com o score de
relevância e a justificação da triagem, e permite publicar/despublicar.

Protegido pelo `AdminLayout`
(`ANALYTICS_ADMIN_EMAILS`) **e** por uma verificação repetida dentro da Server
Action — as Server Actions são endpoints HTTP próprios e podem ser invocadas
sem passar pelo layout.

### 6.7 Ficheiros Envolvidos

| Ficheiro | Responsabilidade |
|---|---|
| `lib/news/sources.ts` | Lista de feeds, fetch RSS + Finnhub, dedup |
| `lib/news/normalize.ts` | Normalização de títulos, dedupKey, Jaccard, slug, filtro de imagens |
| `lib/news/cluster.ts` | Clustering, matching de tickers, ranking |
| `lib/news/extract.ts` | Descarregamento e extração do corpo dos artigos, robots.txt |
| `lib/news/model.ts` | Acessor do modelo Gemini com conta própria do terminal |
| `lib/discord/verify.ts` | Verificação Ed25519 das interações do Discord |
| `lib/discord/client.ts` | Publicação da mensagem de revisão + allowlist de aprovadores |
| `app/api/news/review/` | Aprovação chamada pelo bot (é o caminho em uso) |
| `app/api/discord/interactions/` | Alternativa em modo HTTP, hoje inerte |
| `scripts/setup_discord_review_channel.ts` | Cria o canal privado de aprovações com as permissões certas |
| `lib/news/triage.ts` | Triagem Gemini em lote + limiares |
| `lib/news/generate.ts` | Escrita do mini-artigo em PT-PT |
| `lib/news/serialize.ts` | DTO público partilhado pelo site e pelo Discord |
| `scripts/ingest_news.ts` | Orquestração (flags `--dry-run`, `--no-llm`, `--max=N`) |
| `.github/workflows/ingest-news.yml` | Cron horário |
| `app/api/news/latest/`, `article/[slug]/`, `image/[id]/` | Endpoints (feed, artigo, proxy de imagem) |
| `app/[locale]/(app)/news/`, `components/news/` | Terminal na plataforma |
| `app/[locale]/(app)/admin/news/` | Curadoria |

### 6.8 Limitações Conhecidas

- **Reuters e Bloomberg via Google News**: só manchete + link, sem resumo nem
  corpo. Se o Google mudar o formato do feed, essas duas fontes silenciam-se (o
  erro é apanhado por fonte, não derruba a execução).
- **A extração do corpo é frágil por natureza**: depende do HTML de cada site.
  Uma redesenhação do CNBC ou do Yahoo pode baixar a cobertura sem avisar. O
  `console.warn` do `generate.ts` regista quando uma história é escrita só com
  manchetes — vale a pena vigiar nos logs do workflow.
- **Fins de semana e fora de horas**: quase nada tem cobertura multi-fonte, pelo
  que o ranking passa a depender dos tickers e da recência. Foi por isto que o
  `rankClusters` usa score composto e não ordenação lexicográfica.
- **Sem tradução por locale**: os artigos são sempre PT-PT, mesmo em `/en/news`.
  É conteúdo editorial da marca para a audiência da Bullocracy.
- O `publishedAt` do artigo é o do item líder do cluster, não o do momento da
  geração — de propósito, para o feed refletir quando a notícia aconteceu.


### 6.9 Autoria e Responsabilidade Editorial

Os artigos **não indicam** que foram escritos por IA (decisão do Costa,
2026-08-09). O rodapé (`ArticleFooter`) diz apenas "Artigo da redação da Bull
Value", mantém a atribuição às fontes e o aviso de não-recomendação.

O que fica registado para quem vier a seguir:

O Artigo 50.º, n.º 4 do Regulamento (UE) 2024/1689 (Regulamento da IA) obriga a
identificar texto gerado por IA quando é publicado **para informar o público
sobre matérias de interesse público** — notícias financeiras enquadram-se aí. A
mesma norma abre uma exceção expressa: a obrigação **não se aplica** quando o
conteúdo passou por **revisão humana ou controlo editorial** e existe uma
pessoa singular ou coletiva com **responsabilidade editorial** pela publicação.

**É nessa exceção que o terminal assenta** (desde 2026-08-09):
`AUTO_PUBLISH_THRESHOLD` está em 101, portanto nenhum artigo fica visível sem
aprovação humana explícita — pelo botão no Discord ou por `/admin/news`. A
publicação é um ato de uma pessoa identificada, registada nos logs
(`[discord] publicado por <utilizador>: <título>`).

Baixar `AUTO_PUBLISH_THRESHOLD` para 80 repõe o auto-publish e **retira a
revisão humana do circuito** — o que também retira a base da exceção.

A **atribuição às fontes não é negociável** e mantém-se: é o que sustenta o uso
do material original, e é matéria de direitos de autor, não de rotulagem de IA.

---

*Documento gerado a 29/06/2026 — revisitar após alterações nos scripts de ingestão ou na estrutura da BD.*
