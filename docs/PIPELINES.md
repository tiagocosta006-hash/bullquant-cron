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

*Documento gerado a 29/06/2026 — revisitar após alterações nos scripts de ingestão ou na estrutura da BD.*
