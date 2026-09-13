import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { generateObject } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { z } from 'zod'
import { assertCreditsAvailable, chargeCredits } from '@/lib/ai/credits'
import { exigirPro } from '@/lib/api/acessoPro'
import { nomeDeCeoLimpo } from '@/lib/ceo'

export const maxDuration = 60; // Vercel function timeout (60s is good for AI)

/**
 * Revisão do perfil de gestão.
 *
 * Sobe quando muda algo que torna os perfis já gravados errados — e não quando
 * muda só o modelo. Um perfil com outra revisão é tratado como expirado, o que
 * evita ter de mexer na base de dados de produção para os invalidar.
 */
const REVISAO_PERFIL = "r3-numeros-ancorados";

/**
 * O nome do CEO NÃO é do modelo.
 *
 * Este separador pedia ao Gemini que identificasse o CEO, e o Gemini responde
 * de memória — com o corte de treino que tiver. Medido contra a base de dados:
 * 35 divergências em 82 perfis, e as que interessam não são de grafia:
 *
 *   INTC  Lip-Bu Tan          → dizia Pat Gelsinger (saiu em 2024)
 *   UNH   Stephen Hemsley     → dizia Andrew Witty (saiu em 2025)
 *   WMT   John Furner         → dizia Doug McMillon
 *   ORCL  Michael Sicilia     → dizia Safra Catz
 *   TMUS  Srinivasan Gopalan  → dizia Mike Sievert
 *   ISRG  David Rosa          → dizia Gary Guthart
 *
 * A validade de 30 dias não corrigia isto: o perfil da ISRG foi regenerado a
 * 12 de setembro e devolveu na mesma o CEO antigo, porque voltar a perguntar
 * ao mesmo modelo dá a mesma resposta. A validade refrescava a cache, não a
 * verdade.
 *
 * E não era só o nome. O texto da análise, a antiguidade e o histórico de
 * alocação de capital eram todos sobre a pessoa errada — na Intel, o percurso
 * do Gelsinger a fazer de percurso do Tan.
 *
 * Passa a haver uma âncora: `companies.ceo`, que o `ingest_ceos.py` actualiza
 * todos os meses (517 de 559 na corrida de 1 de setembro). Vai para o prompt
 * como facto, e sobrepõe-se à resposta do modelo à saída — também nos perfis
 * que já estão em cache, para o nome deixar de depender do modelo em qualquer
 * caminho. A limpeza do nome está em `lib/ceo.ts`, partilhada com os outros
 * sítios que mostram um CEO.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params
    
    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 })
    }

    const company = await prisma.company.findUnique({ 
      where: { ticker: ticker.toUpperCase() } 
    })
    
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Sessão E plano: vive no separador que a página protege com
    // `canViewProTabs`, e além disso consome quota de IA. Tinha só a sessão,
    // portanto qualquer conta gratuita gastava IA em conteúdo pago.
    const acesso = await exigirPro()
    if (!acesso.ok) return acesso.resposta
    // `userId` é null em dois casos: a demo anónima (que esta chamada não
    // pede) e o desbloqueio de desenvolvimento sem utilizador local. Em
    // qualquer deles não há a quem cobrar créditos, e o AIUsageLog.userId tem
    // chave estrangeira para users — escrever ali um id inexistente rebenta.
    if (!acesso.userId) {
      return NextResponse.json({ error: 'Sessão necessária' }, { status: 401 })
    }
    const user = { id: acesso.userId }

    // 1. Check Cache
    const cached = await prisma.managementProfile.findUnique({
      where: { companyId: company.id }
    })

    const ceoDaBase = nomeDeCeoLimpo(company.ceo)

    // Sem CEO verificado, não há perfil. Ponto.
    //
    // São 67 das 559 empresas activas — ADRs e europeias, que o
    // `companyOfficers` do yfinance cobre mal. A tentação é deixar o modelo
    // dizer quem é, já que "é melhor que nada": não é. Um nome que ninguém
    // verificou aparece com o mesmo ar de certeza que um verificado, e é
    // assim que a Intel mostrou o Gelsinger durante meses.
    //
    // E não se trata só do nome: a antiguidade, a alocação de capital e o
    // texto da análise são TODOS sobre a pessoa que o modelo escolheu. Se o
    // nome não se pode confiar, o parágrafo sobre o percurso dele também não.
    //
    // Também não se serve o que está em cache: o que foi gerado sem âncora
    // continua sem âncora. E poupa-se um crédito de IA por empresa.
    if (!ceoDaBase) {
      return NextResponse.json(
        { profile: null, semCeoVerificado: true },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      )
    }

    const daRevisaoAtual = cached?.modelVersion?.startsWith(`${REVISAO_PERFIL}:`) ?? false

    // Se o CEO MUDOU desde que o perfil foi gerado, o perfil inteiro caducou.
    //
    // Trocar só o nome e deixar o resto seria pior do que não ter nada: a
    // antiguidade, a alocação de capital e a análise continuavam a ser sobre
    // o antecessor, agora com o nome do sucessor por cima. A Apple acabou de
    // dar o exemplo — o Tim Cook passou a Executive Chairman e o John Ternus
    // a CEO, e um perfil gerado na véspera descreve o percurso do homem
    // errado.
    const mesmoCeo = cached?.ceoName === ceoDaBase

    if (cached && cached.expiresAt > new Date() && daRevisaoAtual && mesmoCeo) {
      return NextResponse.json({ profile: cached })
    }

    // 1b. Créditos
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { plan: true },
    })

    const rateLimitError = await assertCreditsAvailable(user.id, dbUser?.plan ?? 'FREE', 'management')
    if (rateLimitError) {
      return NextResponse.json(rateLimitError, { status: 429 })
    }

    /**
     * Os números vão com a pergunta.
     *
     * A nota de alocação de capital e o resumo saíam da memória do modelo —
     * "recompras agressivas", "dividendo em crescimento" — sobre uma empresa
     * que ele talvez não visse desde o treino. Temos os números todos na base
     * de dados: dividendo por ação, ações em circulação (que é a prova das
     * recompras), fluxo de caixa livre, dívida e resultado líquido.
     *
     * Passam com a pergunta e a instrução é explícita: qualquer afirmação
     * quantitativa sai daqui, ou não se faz.
     */
    const anuais = await prisma.fundamental.findMany({
      where: { companyId: company.id, periodType: "ANNUAL" },
      orderBy: { fiscalYear: "desc" },
      take: 8,
      select: {
        fiscalYear: true,
        revenue: true,
        netIncome: true,
        freeCashFlow: true,
        dividendPerShare: true,
        sharesOutstanding: true,
        totalDebt: true,
      },
    })

    const milhoes = (v: Prisma.Decimal | null) =>
      v === null ? "n/d" : `${(Number(v) / 1e6).toFixed(0)}M`

    const tabela = anuais
      .slice()
      .reverse()
      .map((f) =>
        [
          `FY${f.fiscalYear}`,
          `receita ${milhoes(f.revenue)}`,
          `resultado líquido ${milhoes(f.netIncome)}`,
          `FCF ${milhoes(f.freeCashFlow)}`,
          `dividendo/ação ${f.dividendPerShare === null ? "n/d" : Number(f.dividendPerShare).toFixed(2)}`,
          `ações ${milhoes(f.sharesOutstanding)}`,
          `dívida total ${milhoes(f.totalDebt)}`,
        ].join(", ")
      )
      .join("\n")

    // 2. Generate AI Assessment
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
    }

    const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })
    const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash'

    const { object } = await generateObject({
      model: google(modelName),
      schema: z.object({
        ceoName: z.string(),
        isFamilyRun: z.boolean().describe("True if founding family controls it"),
        familyInfluence: z.object({
          en: z.string(),
          pt: z.string()
        }).nullable().describe("Briefly explain control, or null"),
        capitalAllocationRating: z.enum(['POOR', 'AVERAGE', 'EXCELLENT']).describe("Grade their capital allocation"),
        capitalAllocationSummary: z.object({
          en: z.string(),
          pt: z.string()
        }).describe("1-2 sentences summarizing dividend, buyback, M&A"),
        skinInTheGame: z.enum(['LOW', 'MODERATE', 'HIGH']).describe("Grade shareholder alignment"),
        analysis: z.object({
          en: z.string(),
          pt: z.string()
        }).describe("1 paragraph summary of track record")
      }),
      system: [
        "You are a senior Wall Street value investor analyzing a management team.",
        "You MUST provide all textual descriptions in BOTH English ('en') and European Portuguese ('pt', strictly pt-PT, avoid Brazilian Portuguese).",
        "Be highly critical, concise, and professional.",
        // Sem isto, o modelo enche os buracos com o que se lembra, e o que se
        // lembra tem o corte de treino dele. Datas de nomeação, valores de
        // aquisições e números de recompras eram tudo memória apresentada com
        // ar de facto.
        "CRITICAL: every quantitative claim — figures, percentages, growth rates, share counts, dividend levels, debt levels — must come from the financial data supplied in the prompt, and from nothing else.",
        "Never state a date: no appointment years, no tenure lengths, no dates of acquisitions or events. You do not have a reliable source for dates.",
        "Never name a specific acquisition, product launch or event unless it is implied by the supplied figures. Where you lack data, write about what the supplied figures show instead.",
      ].join(" "),
      prompt: [
        `Analyze the management team and CEO of ${company.name} (${company.ticker}).`,
        `The current CEO is ${ceoDaBase}. This is verified company profile data, refreshed monthly, and is more recent than your training data: use this name, do not substitute anyone else, and write the tenure, capital allocation history and track record about ${ceoDaBase}. If you believe someone else holds the role, you are out of date.`,
        `Also assess whether it is a family/founder-run business and their skin in the game.`,
        anuais.length > 0
          ? `Base every quantitative statement — and the capital allocation grade in particular — on these annual figures from our database, and on nothing else. The share count is the evidence for buybacks or dilution; the dividend per share is the evidence for the dividend policy.\n${tabela}`
          : `We have no annual financial data for this company, so make no quantitative claims at all.`,
      ].join(" ")
    })

    // 3. Save to Cache (Expire in 30 days since management doesn't change daily)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const profileData = {
      // A âncora ganha ao modelo. Chegar aqui já garante que existe.
      ceoName: ceoDaBase,
      // A antiguidade saiu: era uma DATA, dita de memória, e não temos fonte
      // nenhuma para datas. A ficha da Intel dizia "Desde 2024" e o Lip-Bu Tan
      // entrou em 2025. Os dados de insiders não servem — a janela do Finnhub
      // começa em agosto de 2025, portanto nem sequer distingue quem entrou
      // ontem de quem lá está há vinte anos. As colunas ficam (mudar o schema
      // obrigava a mexer na base de produção) e ficam vazias; o componente já
      // não as mostra.
      tenure_en: "",
      tenure_pt: "",
      isFamilyRun: object.isFamilyRun,
      capitalAllocationRating: object.capitalAllocationRating,
      skinInTheGame: object.skinInTheGame,
      familyInfluence_en: object.familyInfluence?.en || null,
      familyInfluence_pt: object.familyInfluence?.pt || null,
      capitalAllocationSummary_en: object.capitalAllocationSummary.en,
      capitalAllocationSummary_pt: object.capitalAllocationSummary.pt,
      analysis_en: object.analysis.en,
      analysis_pt: object.analysis.pt,
    }

    const profile = await prisma.managementProfile.upsert({
      where: { companyId: company.id },
      update: {
        ...profileData,
        expiresAt,
        modelVersion: `${REVISAO_PERFIL}:${modelName}`,
        generatedAt: new Date()
      },
      create: {
        companyId: company.id,
        ...profileData,
        expiresAt,
        modelVersion: `${REVISAO_PERFIL}:${modelName}`
      }
    })

    // 4. Log AI Usage
    await chargeCredits(user.id, company.ticker, 'management')

    return NextResponse.json({ profile })

  } catch (error) {
    console.error('Management AI Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
