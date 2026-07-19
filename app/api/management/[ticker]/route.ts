import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { z } from 'zod'
import { assertCreditsAvailable, chargeCredits } from '@/lib/ai/credits'

export const maxDuration = 60; // Vercel function timeout (60s is good for AI)

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

    // Require auth because it consumes AI quota
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Check Cache
    const cached = await prisma.managementProfile.findUnique({
      where: { companyId: company.id }
    })

    if (cached && cached.expiresAt > new Date()) {
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
      prompt: `Analyze the management team and CEO of ${company.name} (${company.ticker}). Identify the current CEO, whether it is a family/founder-run business, their capital allocation history, and their skin in the game.`
    })

    // 3. Save to Cache (Expire in 30 days since management doesn't change daily)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const profileData = {
      ceoName: object.ceoName,
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
        modelVersion: modelName,
        generatedAt: new Date()
      },
      create: {
        companyId: company.id,
        ...profileData,
        expiresAt,
        modelVersion: modelName
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
