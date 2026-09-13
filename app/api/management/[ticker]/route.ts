import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
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
const REVISAO_PERFIL = "r2-ceo-ancorado";

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

    const daRevisaoAtual = cached?.modelVersion?.startsWith(`${REVISAO_PERFIL}:`) ?? false
    if (cached && cached.expiresAt > new Date() && daRevisaoAtual) {
      // O nome vem da base mesmo quando o resto vem da cache.
      return NextResponse.json({ profile: { ...cached, ceoName: ceoDaBase ?? cached.ceoName } })
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
        tenure: z.object({
          en: z.string().describe("e.g. 'Since 2014'"),
          pt: z.string().describe("e.g. 'Desde 2014'")
        }).describe("How long the CEO has been in charge"),
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
      system: "You are a senior Wall Street value investor analyzing a management team. You MUST provide all textual descriptions in BOTH English ('en') and European Portuguese ('pt', strictly pt-PT, avoid Brazilian Portuguese). Be highly critical, concise, and professional.",
      prompt: [
        `Analyze the management team and CEO of ${company.name} (${company.ticker}).`,
        ceoDaBase
          ? `The current CEO is ${ceoDaBase}. This is verified company profile data, refreshed monthly, and is more recent than your training data: use this name, do not substitute anyone else, and write the tenure, capital allocation history and track record about ${ceoDaBase}. If you believe someone else holds the role, you are out of date.`
          : `There is no verified CEO on record for this company, so state who you believe currently holds the role.`,
        `Also assess whether it is a family/founder-run business and their skin in the game.`,
      ].join(" ")
    })

    // 3. Save to Cache (Expire in 30 days since management doesn't change daily)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const profileData = {
      // A âncora ganha sempre ao modelo; só quando a base não tem ninguém é
      // que se aceita o que ele diz.
      ceoName: ceoDaBase ?? object.ceoName,
      isFamilyRun: object.isFamilyRun,
      capitalAllocationRating: object.capitalAllocationRating,
      skinInTheGame: object.skinInTheGame,
      tenure_en: object.tenure.en,
      tenure_pt: object.tenure.pt,
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
