# Roadmap de Funcionalidades PRO

Este documento serve para registar a visão e intenções de negócio para funcionalidades futuras a serem integradas no Plano PRO (pago) do BullQuant. O objetivo é monetizar o acesso à plataforma através de valor acrescentado de alto nível ("Inteligência Artificial como Analista Privado").

## Funcionalidade Principal: AI Financial Analyst (Chat Integrado)

### 1. O Problema
Atualmente os utilizadores olham para os gráficos financeiros na plataforma (ex: uma quebra de *Revenue* de 20% no ano de 2022). Para entenderem o **porquê** dessa quebra, teriam de sair da plataforma, abrir relatórios extensos da SEC (Form 10-K), ou pesquisar no Google.

### 2. A Solução (RAG - Retrieval-Augmented Generation)
Criar uma janela de *Chat* interativa em cada página de empresa onde o utilizador pode fazer perguntas livres:
* *"Por que motivo a margem bruta da Apple caiu no Q3 de 2023?"*
* *"O CEO explicou a estagnação do FCF no último relatório?"*

### 3. Arquitetura Planeada
Para implementar isto de forma rentável e extremamente rápida, não iremos alimentar a base de dados inteira ao modelo de IA em cada pergunta. Iremos utilizar a funcionalidade de **Tool Calling (Function Calling)**:
1. **Database Tool:** A IA recebe ferramentas para consultar a nossa base de dados Prisma (ex: `getMetric(ticker, year, metric)`).
2. **Filings/News Tool:** A IA recebe ferramentas para ler os relatórios oficiais da SEC ou notícias (ex: `get10KSummary(ticker, year)`).
3. **Síntese:** A IA puxa **apenas** os números e os parágrafos relevantes, e redige a justificação final para o utilizador.

### 4. Stack Tecnológico a Utilizar
* Vercel AI SDK (já configurado no projeto)
* Google Gemini (Gemini 2.5 Flash ou Pro, dependendo do raciocínio necessário)
* Prisma (para o acesso rápido aos dados numéricos)

### 5. Monetização
Esta será a "killer feature" (funcionalidade principal) do **Plano PRO**.
Enquanto os gráficos e a avaliação da equipa de gestão continuam gratuitos (para servirem como isco de marketing), o "ChatBot" analista consumirá créditos Premium e exigirá uma subscrição paga, justificando assim o valor mensal cobrado pela plataforma.
