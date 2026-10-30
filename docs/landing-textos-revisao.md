# Revisão de textos: landings A, B e C (pt-PT)

Âmbito: chaves `marketing.*` usadas pelas landings A/B/C (`hero2`, `inside`, `pricing`, `faq`, `ctaTitle`, `peekCta`, `landingB`, `landingC`).
Nada foi alterado em `messages/*.json`; isto é só a proposta. Prioridade: hero, CTAs, preços, FAQ.

Factos que limitam o texto (verificados em todas as propostas):
- Só `/stock/AAPL` abre sem conta.
- Qualquer frase com "grátis/free" usa o placeholder `{dias}` (vindo de `PLANOS.comunidade.diasGratis`).
- 14 dias de livre resolução (pagas a parte proporcional). Preços com IVA, cancelas na Whop.
- Não é aconselhamento. Sem testemunhos inventados nem números de utilizadores.

Legenda do "porquê": clareza, persuasão (iniciante vindo do Instagram), honestidade, ritmo, pt-PT.

---

## 1. Top 10 (por impacto)

1. **`peekCta`**
   - Atual: "Espreitar sem conta"
   - PT: "Ver a Apple sem conta"
   - EN: "See Apple, no account needed"
   - Porquê: honestidade. "Espreitar" promete a plataforma toda; só a Apple abre. A landing B já usa esta frase (`landingB.hero.peek`), por isso também fica coerente.

2. **`hero2.subtitle`**
   - Atual: "10 anos de fundamentais, calculadora DCF e um analista IA para cada empresa do S&P 500. Em português, num só sítio."
   - PT: "10 anos de números em gráficos, uma DCF que já abre preenchida e um analista IA que te explica o negócio. Para as 500 empresas do S&P 500, em português."
   - EN: "10 years of numbers in charts, a DCF that opens pre-filled and an AI analyst that explains the business. For all 500 S&P 500 companies."
   - Porquê: persuasão e clareza. Quem chega do Instagram não sabe o que são "fundamentais". Esta versão diz o que a pessoa ganha e não só o nome da ferramenta.

3. **`ctaTitle`**
   - Atual: "Começa a ver o valor que os outros não veem."
   - PT: "Da próxima vez que comprares uma ação, sabe porquê."
   - Alternativa: "Antes da próxima compra, vê quanto vale a empresa."
   - EN: "Next time you buy a stock, know why."
   - Porquê: honestidade e menos cliché. "O que os outros não veem" sugere uma vantagem sobre o mercado, o que está perto de prometer rendimento. A nova frase vende o hábito de fazer as contas, não um resultado.

4. **`landingC.gallery.marks.dcf.m2`**
   - Atual: "O valor de cada cenário: o máximo a pagar hoje para ganhar o retorno pedido"
   - PT: "O valor por ação em cada cenário: o preço que te dá o retorno que pedes, se os pressupostos se confirmarem"
   - EN: "Value per share in each scenario: the price that gives you the return you ask for, if the assumptions hold"
   - Porquê: honestidade (não é aconselhamento). "O máximo a pagar" soa a ordem de compra. A condição "se os pressupostos se confirmarem" mostra que a conta depende de quem a faz.

5. **`landingB.pricing.peekBody`**
   - Atual: "...vês o resumo e os 10 anos de fundamentais tal como no PRO. O Analista IA, o Valuation e a página da empresa ficam para o PRO."
   - PT: "Experimenta o plano com a comunidade {dias} dias sem pagar, ou abre já a página da Apple sem conta: vês o resumo e os 10 anos de fundamentais tal como no PRO. Os separadores Analista IA, Valuation e Empresa ficam para o PRO."
   - Porquê: clareza. Hoje a frase diz que a página da Apple abre e logo a seguir que "a página da empresa" fica para o PRO, o que se contradiz. O problema desaparece quando se diz que são separadores. (Confirmar no produto o nome exato do separador "Empresa".)

6. **`pricing.subtitle`**
   - Atual: "A plataforma inteira desde 7 € por mês, ou com a comunidade TCValue Group por 9,97 €, com os primeiros {dias} dias grátis. Cancelas quando quiseres."
   - PT: "A plataforma inteira por {preco} € por mês. Por {comunidade} €, juntas-lhe a comunidade TCValue Group e os primeiros {dias} dias são grátis. Preço com IVA, cancelas quando quiseres."
   - EN: "The whole platform for €{preco} a month. For €{comunidade}, add the TCValue Group community and get the first {dias} days free. VAT included, cancel anytime."
   - Porquê: honestidade e manutenção. Os preços estão escritos à mão neste texto, enquanto a landing B usa `{preco}`/`{comunidade}`, e assim os valores podem deixar de bater certo. "Desde 7 €" também é estranho num plano com preço único. Juntei o IVA, que é uma garantia que hoje não aparece aqui. (Os placeholders obrigam a passar os valores no componente.)

7. **`hero2.priceNote`** e **`landingB.hero.note`**
   - Atual: "Desde {preco} € por mês · {dias} dias grátis no plano com comunidade"
   - PT: "{preco} € por mês · {dias} dias grátis no plano com a comunidade · cancelas quando quiseres"
   - EN: "€{preco} a month · first {dias} days free on the community plan · cancel anytime"
   - Porquê: ritmo e pt-PT. Falta o artigo ("com a comunidade", como na FAQ). "Desde" pode cair porque o PRO tem um único preço. Na A falta o "cancelas quando quiseres", que a B já tem.

8. **`faq.a4`**
   - Atual: "Os preços das ações e os relatórios financeiros são atualizados diariamente, com as métricas essenciais e os gráficos a serem processados pouco tempo após a publicação oficial por parte das empresas."
   - PT: "Os preços atualizam todos os dias. Quando uma empresa entrega um relatório à SEC, as métricas e os gráficos são atualizados pouco depois."
   - EN: "Prices update daily. When a company files a report with the SEC, the metrics and charts update shortly after."
   - Porquê: ritmo e clareza. Uma frase longa e burocrática ("a serem processados", "por parte das") passa a duas frases curtas.

9. **`faq.a5`**
   - Atual: "Crias a conta em thebullvalue.com e segues logo para o pagamento seguro na Whop, já ligado à tua conta. ... Depois de confirmares o email, entras com o PRO ativo. Cancelas na Whop quando quiseres."
   - PT: "Em três passos: crias a conta, pagas na Whop (a plataforma de pagamentos, já ligada à tua conta) e confirmas o email. Entras logo com o PRO ativo. No plano com a comunidade, os primeiros {dias} dias são grátis e só pagas se não cancelares antes. Cancelas na Whop quando quiseres."
   - Porquê: clareza. O processo fica em passos, e "Whop" é explicado a quem nunca ouviu falar.

10. **`hero2.proofLanguage`**
    - Atual: "Tudo em português"
    - PT: "Explicado em português"
    - EN: "Explained in Portuguese"
    - Porquê: honestidade. A FAQ (`landingB.faq.lang.a`) admite que os nomes dos segmentos e alguns termos (FCF, EBITDA) ficam no original. "Explicado" é verdade e a landing B já o usa (`landingB.proof.language`).

---

## 2. Outras propostas, por secção

### Hero e CTAs
- **`hero2.cta`** "Começar agora". Manter. É claro e curto. Não trocar por "Experimentar grátis", porque o PRO sozinho não tem período experimental, e qualquer "grátis" obriga a usar `{dias}` e a dizer de que plano se fala.
- **`landingB.hero.subtitle`** "...uma DCF que já abre preenchida...". Proposta: "...uma DCF (o cálculo do valor da empresa) que já abre preenchida...". Porquê: clareza para iniciantes, porque é a única sigla sem explicação no hero.
- **`landingB.hero.title*`** "Percebe *quanto vale* uma ação antes de a comprares." Manter. É o melhor hero atual: concreto, com um benefício claro e sem promessas.
- **`landingB.reel.end.lead`** / **`landingC.reel.end.lead`** "A Apple abre aqui mesmo, sem conta. As outras 499 vêm com o PRO." Manter: é honesto e tem bom ritmo.

### Planos e preços
- **`pricing.pro.name`** "Pro" contra "PRO" no resto do site. Uniformizar para "PRO". Porquê: consistência.
- **`pricing.pro.f2`** "8 créditos de IA por dia, com chat do Analista IA sobre qualquer empresa". Proposta: "Analista IA: pergunta o que quiseres sobre qualquer empresa (8 créditos por dia)". Porquê: começa pelo benefício, porque "créditos" sozinho não diz nada a quem está a começar.
- **`pricing.pro.f3`** "...com cenários, exportação e análises guardadas". Proposta: "...com cenários, exportação para PDF e Excel e análises guardadas". Porquê: clareza, igual ao texto da FAQ q1.
- **`pricing.pro.note`** "Pagamento na Whop · cancelas quando quiseres". Proposta: "Pagamento seguro na Whop · IVA incluído · cancelas quando quiseres". Porquê: a confiança decide-se ao lado do botão.
- **`landingB.pricing.titleAccent`** "Uns {cents} cêntimos por dia." Manter: é boa âncora de preço.

### FAQ
- **`faq.a2`**: começar com uma frase mais direta. "Não. A BullValue mostra-te os números e as contas; não te diz o que comprar. ..." Porquê: persuasão honesta, porque responde ao medo de estar a pagar "sinais".
- **`faq.a3`** "...está no roadmap." Proposta: "As 500 empresas do S&P 500. Queremos juntar empresas europeias, incluindo a Euronext Lisboa, mas ainda não há data." Porquê: pt-PT (fora o anglicismo) e honestidade (não promete prazo).
- **`faq.a6`** "...vai até ao revenue build por segmento." Proposta: "...vai até à projeção da receita por segmento." Porquê: pt-PT e clareza.
- **`faq.a7`**: juntar "Não há fidelização." no início. Porquê: é a objeção mais comum em subscrições. O facto já aparece em `landingB.pricing.subtitle`.
- **`landingB.fit.n3`** "...está no roadmap." Mesma correção que `faq.a3`.

### "Por dentro" e galeria
- **`inside.eyebrow`** "Sem maquetas". Proposta: "Ecrãs reais". Porquê: clareza, porque "maquetas" é jargão de design para quem vem do Instagram.
- **`landingC.gallery.marks.val.m3`** "Em 2018, o P/E passou os 50x". Proposta: "Em 2018, o P/E passou os 50x: o preço subiu muito mais depressa do que os lucros". Porquê: diz porque é que o número interessa.

---

## 3. Cinco headlines alternativas para o hero (por ordem)

Formato: título com a *palavra em destaque* (serif itálico dourado), seguido do subtítulo. Nenhuma usa "grátis", para não obrigar a `{dias}` no H1.

1. **"Antes de comprar, *faz as contas*."**
   Sub: "10 anos de números de cada empresa do S&P 500, uma DCF já preenchida e um analista IA que te explica o negócio em português."
   EN: "Before you buy, *do the math*." / "10 years of numbers for every S&P 500 company, a pre-filled DCF and an AI analyst that explains the business."
   Porquê #1: é curta, é uma ordem que se age logo e põe o utilizador no centro. Não promete retorno.

2. **"Está cara ou barata? *Vê tu mesmo.*"**
   Sub: "Compara o preço de hoje com 10 anos de lucros e abre uma DCF que já vem preenchida. Sem Excel, explicado em português."
   EN: "Expensive or cheap? *See for yourself.*"
   Porquê: é a pergunta que um iniciante faz de facto, e a resposta é "tu decides", o que mantém o "não é aconselhamento".

3. **"Investe a saber *o que compras*."**
   Sub: "Os números, o valor estimado e o negócio de cada empresa do S&P 500, num só sítio e em português."
   EN: "Invest knowing *what you own*."
   Porquê: é emocional sem exagerar e fala com quem compra por impulso a partir de redes sociais.

4. **"O relatório anual, *explicado* em português."**
   Sub: "O Analista IA lê o 10-K de cada empresa do S&P 500 e responde às tuas perguntas, com a fonte citada. Mais 10 anos de números e uma DCF já preenchida."
   EN: "The annual report, *in plain words*."
   Porquê: é o diferencial mais forte (português e IA com fontes), mas é mais estreito para um H1.

5. **"Compra empresas, *não palpites*."**
   Sub: "10 anos de números, uma DCF já preenchida e um analista IA para cada empresa do S&P 500. As decisões são tuas."
   EN: "Buy businesses, *not hunches*."
   Porquê: tem muita força, mas o tom é um pouco provocador. Fica bem para anúncios, menos para o H1.

Para testar: usar a #1 contra a B atual ("Percebe *quanto vale* uma ação antes de a comprares.") como teste A/B. A #2 também funciona como título da secção de valuation.
