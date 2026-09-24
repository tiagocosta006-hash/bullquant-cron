# Plano — reconstruir a camada de dados sobre a FMP

> Escrito a 2026-09-24, depois de a Interactive Brokers ter aparecido na
> plataforma com um P/E de 7x onde o real é 30x.
>
> Este documento substitui, na parte de dados de mercado, o que o `04-dados.md`
> descreve. As features e o produto não mudam — muda de onde vêm os números.

---

## 1. Porque é que não se corrige, se refaz

O motor atual extrai XBRL da SEC e tem de decidir, empresa a empresa, qual das
tags é o lucro, quais são as ações, o que conta como dívida. São 3 044 linhas
só no `ingest_fundamentals.py`, mais 1 000 espalhadas por outros seis scripts.

Quando decide mal, ninguém dá por isso. A IBKR esteve publicada com um EPS de
7,81 quando a própria empresa reporta 1,73, porque sem `NetIncomeLoss` o motor
caía no `ProfitLoss` — o lucro do grupo, de que os acionistas cotados detêm
~23%. Não houve erro nem alarme: houve um número plausível e errado.

Um varrimento às 405 empresas com fecho em dezembro encontrou 4 casos assim.
Poucos — mas não são detetáveis por inspeção, só por comparação com uma fonte
externa. E é isso que a FMP passa a ser.

### O que a FMP resolve, medido

Validada a 2026-09-24 contra as sete empresas onde o motor divergia da SEC:
acertou nas sete. Três delas (BKNG, DD, CVNA) nem estavam erradas — eram
desdobramentos posteriores ao 10-K, que a FMP ajusta e a SEC mostra por ajustar.

| | Motor antigo | Correto | FMP |
|---|---|---|---|
| IBKR | 7,81 | 1,73 | 1,73 |
| CRL | 0,43 | 0,20 | 0,20 |
| KEY | −0,17 | −0,32 | −0,32 |
| FTV | 1,78 | 2,36 | 2,36 |

Preserva também as decisões de rigor do `DATA_DISCREPANCIES.md`: a dívida total
da AAPL em 2016 dá 87,03 mM, ao cêntimo o valor que o documento defende contra
os agregadores que só leem a dívida de longo prazo.

---

## 2. A decisão de arquitetura

O inventário da base a 2026-09-24:

| | Tamanho | % |
|---|---|---|
| Dados de mercado (a FMP serve) | 293 MB | **97%** |
| Conteúdo editorial (notícias) | 4,4 MB | 1,5% |
| Dados dos utilizadores | 3,3 MB | 1% |

**Noventa e sete por cento da base são dados de mercado.** Continuam a ser
guardados — ver a regra abaixo —, mas quem os produz muda por completo, e é
daí que vem a diferença.

### A regra

> **A base continua a ser a fonte que a plataforma lê. O que muda é que deixa
> de ser construída por um motor que interpreta, e passa a ser um espelho da
> FMP que se reconstrói em cinco minutos.**

A primeira versão deste plano propunha o contrário — ir à FMP a pedido e
esvaziar a base. Estava errada, por três razões que só aparecem quando se
pergunta como as outras plataformas fazem:

**Latência.** Uma chamada à FMP são 300-800 ms; uma leitura ao Postgres, 20 ms.

**Independência.** Se a FMP cair, ou se um dia se mudar de fornecedor, a
plataforma continua a servir.

**Histórico próprio, que é a razão decisiva.** Se a FMP reformular um número
que já foi mostrado a um cliente, queremos saber. Com a API a pedido, o valor
antigo desaparece sem rasto e ninguém consegue reconstruir o que estava no ecrã
naquele dia. Para quem apresenta posições a clientes, isto não é um detalhe
técnico.

A Macrotrends, a Stock Analysis, a Simply Wall St e a Qualtrim — a referência
do `CLAUDE.md` — todas guardam.

### O que muda então, se se continua a guardar

O problema do armazém nunca foi ser um armazém. Foi ser construído por um motor
que podia estar errado sem ninguém saber, e por isso ser **insubstituível**:
reconstruí-lo era um projeto, portanto nunca se reconstruía, portanto os erros
ficavam lá durante meses.

Com a FMP o armazém passa a ser **descartável**. Reconstrói-se por inteiro em
~3 400 chamadas e cinco minutos. Se alguma vez estiver errado, apaga-se e
volta a encher-se. Deixa de ser precioso, e é isso que o torna confiável.

Os cron jobs mudam de natureza na mesma medida: deixam de *extrair e
interpretar* e passam a *espelhar*. Um espelho que falha não corrompe nada —
só fica desatualizado, e nota-se.

### Espaço, com a disciplina que já está decidida

| Granularidade dos preços | Linhas | Espaço |
|---|---|---|
| Tudo (1927-2026) | 2 075 820 | 251 MB |
| **Diário, últimos 10 anos** | 1 353 258 | **164 MB** |
| Diário 10 anos + semanal antes | 1 498 111 | 181 MB |

O `CLAUDE.md` §1 já decidiu 10 anos. Mantendo isso, a base fica em ~215 MB dos
500 MB do plano gratuito. A FMP dá 40 anos — a tentação de os trazer todos é
exatamente como se chega ao teto sem dar por isso.

### Chamadas à API

| | Chamadas |
|---|---|
| Reconstrução completa | ~3 400 (5 min a 750/min) |
| Diário | ~50 |
| Cotações de todas as empresas | 1 (`batch-quote`) |

Sem risco de esgotar: o teto do Premium são 750 por minuto.

### O alarme que faltava

O que permitiu à IBKR ficar errada durante meses não foi a falta de dados —
foi a falta de quem verificasse. Acrescenta-se um job diário que compara uma
amostra da base contra a FMP e avisa quando divergem. O espelho tem de saber
quando deixou de refletir.

## 3. Riscos, e o que se faz a cada um

**Trocamos os nossos erros pelos da FMP.** Nenhum fornecedor é perfeito, e a
própria FMP escreve no rodapé que podem ocorrer omissões. A diferença é que os
erros dela são verificáveis contra a SEC por amostragem, e os nossos não eram
detetáveis de todo. O job de verificação diária é o que transforma isso numa
garantia em vez de uma esperança.

**Dependência de um fornecedor.** Se a FMP fechar ou mudar de preço, é preciso
migrar outra vez. Mitigação: o armazém é nosso e completo, portanto uma
migração futura começa com dados, não do zero. Foi esta a razão de não ir a
pedido.

**Espaço.** A FMP oferece 40 anos; trazê-los todos leva a base para lá dos 500
MB do plano gratuito. A disciplina dos 10 anos do `CLAUDE.md` §1 não é uma
preferência, é o que mantém isto dentro do plano.

**Convenções diferentes em financeiras.** Dívida e caixa de um banco não
significam o mesmo que numa industrial. As regras estão em `lib/fmp/mapear.ts`
e cada uma foi verificada contra o que a empresa reporta à SEC — não assumida
pelo nome do campo.

---

## 4. Fases

Cada fase é reversível sozinha e deixa a plataforma a funcionar.

### Fase 1 — fundamentais (feito, por publicar)

`lib/fmp/` e `scripts/ingest_fundamentals_fmp.ts`, com `--comparar`. Nas
não-financeiras a comparação dá zero diferenças.

Falta: correr a comparação nas 559, publicar, desligar o motor XBRL.

### Fase 2 — preços

O `ingest_prices.py` (Polygon, 559 chamadas sequenciais com 13s de pausa, duas
horas) é substituído por `historical-price-eod/full`: 559 chamadas em ~45
segundos, e uma só chamada `batch-quote` para a atualização diária de todas as
empresas.

Valida-se contra os 2 072 449 registos que já lá estão antes de trocar — é a
única fase em que sabemos a resposta certa antes de perguntar. Os registos
anteriores a 10 anos saem, para ficar nos 164 MB.

### Fase 3 — o resto dos dados de mercado

Insiders, earnings, dividendos, splits, perfis. Todos têm endpoint direto e
todos são per-company.

### Fase 4 — snapshot para o cruzado

Um cron diário que grava 559 linhas de métricas-chave (market cap, P/E, ROIC,
margens, crescimento) para o dashboard e o screener. Substitui as listas
curadas à mão que o `CLAUDE.md` §10 admite serem temporárias — e desbloqueia
o screening por métricas que está em TODO desde o início.

### Fase 5 — o que passa a ser possível

Estimativas de analistas e Forward P/E (hoje "N/A — disponível em breve"),
price targets, segmentação de receita por produto e geografia, transcrições.
Já estão pagos.

---

## 5. Regras que não se violam

Aprendidas a duro, durante esta migração:

**Nunca escolher tags à mão.** Tentei corrigir a receita dos bancos indo buscar
linhas ao `as-reported`. Partiu a Microsoft (281,7 → 168,9 mM) e a Goldman
(53,5 → 4,9 mM). Reduzi a uma só tag e partiu a American Express (65,9 → 0,4
mM). Escolher tags é o problema que esta migração vem eliminar e não melhora
por se escolher menos. Onde a FMP não chega, usa-se aritmética sobre campos
normalizados — a receita líquida de um banco é `revenue − interestExpense`, e
reproduz ao décimo o que WFC, BAC, GS e AXP reportam.

**Nenhum campo entra sem uma identidade que o verifique.** `netIncome ÷ ações
diluídas = epsDiluted` é contabilidade, não heurística. Era isto que faltava
quando a IBKR passou.

**Os campos da FMP não têm semântica constante.** O `netIncome` é o atribuível
na IBKR e inclui minoritários na Prologis. O `totalDebt` soma locações
financeiras. A `cashAndShortTermInvestments` de um banco inclui a carteira de
títulos. Cada mapeamento precisa de ser verificado contra o que a empresa
reporta, não assumido pelo nome.

**A comparação vem antes da escrita.** As três armadilhas acima foram todas
apanhadas em `--comparar`, nenhuma chegou a produção.
