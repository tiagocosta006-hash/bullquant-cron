import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { z } from 'zod'

export const maxDuration = 60; // Vercel function timeout (60s is good for AI)

// Limite diário de gerações de IA no plano FREE (CLAUDE.md §10, feature 6).
// Só gerações reais contam; servir da cache não consome quota.
const DAILY_FREE_LIMIT = 5

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const ticker = searchParams.get('ticker')
    
    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 })
    }

    const company = await prisma.company.findUnique({ 
      where: { ticker: ticker.toUpperCase() } 
    })
    
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Auth — este endpoint chama Gemini/Finnhub; exige utilizador autenticado
    // para não expor o custo a pedidos anónimos.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Check Cache (servir da cache não consome quota de IA)
    const cached = await prisma.companyBrief.findUnique({
      where: { companyId: company.id }
    })

    if (cached && cached.expiresAt > new Date()) {
      return NextResponse.json({ brief: cached.briefData })
    }

    // 1b. Rate limit — só conta gerações reais. FREE: limite diário; PRO: sem limite.
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { plan: true },
    })
    if (dbUser?.plan !== 'PRO') {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const usedToday = await prisma.aIUsageLog.count({
        where: { userId: user.id, usedAt: { gte: startOfDay } },
      })
      if (usedToday >= DAILY_FREE_LIMIT) {
        return NextResponse.json(
          {
            error: 'rate_limit',
            message: 'Limite diário de análises de IA atingido. Tenta novamente amanhã.',
          },
          { status: 429 },
        )
      }
    }

    // 2. Fetch Finnhub News (last 15 days)
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - 15)
    
    const toStr = to.toISOString().split('T')[0]
    const fromStr = from.toISOString().split('T')[0]
    
    const finnhubRes = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${ticker.toUpperCase()}&from=${fromStr}&to=${toStr}&token=${process.env.FINNHUB_API_KEY}`)
    
    if (!finnhubRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch news from Finnhub' }, { status: 500 })
    }

    const rawNews = await finnhubRes.json()
    
    // Sort descending by datetime, take top 20
    let newsContext = ''
    if (Array.isArray(rawNews)) {
      const sortedNews = rawNews.sort((a, b) => b.datetime - a.datetime).slice(0, 20)
      newsContext = sortedNews.map(n => `Date: ${new Date(n.datetime * 1000).toISOString().split('T')[0]} | Title: ${n.headline} | Summary: ${n.summary}`).join('\n\n')
    }

    if (!newsContext) {
      // Return empty if no news
      return NextResponse.json({ brief: { events: [] } })
    }

    // 3. Generate AI Brief
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
    }

    const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

    const { object } = await generateObject({
      model: google(modelName),
      schema: z.object({
        events: z.array(z.object({
          sentiment: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']),
          title: z.string(),
          date: z.string(), // e.g., "June 25, 2026"
          content: z.string() // 2-3 sentences max
        }))
      }),
      system: "You are a senior Wall Street quantitative analyst. You are provided with a feed of recent news for a company. Your task is to identify the 3 to 4 most significant developments from the news provided, and summarize them into an institutional brief format. Each event must be classified as BULLISH, BEARISH, or NEUTRAL. Provide a catchy, descriptive title, the date of the event in readable format (e.g. 'June 25, 2026'), and a 2-3 sentence analytical summary explaining the event and its potential impact on the stock's margins, revenue, or strategic moat. Keep it highly professional, analytical, and insightful. Ignore minor noise.",
      prompt: `Company: ${company.name} (${company.ticker})\n\nRecent News:\n${newsContext}`
    })

    // 4. Save to Cache (Expire in 24 hours)
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    await prisma.companyBrief.upsert({
      where: { companyId: company.id },
      update: {
        briefData: object as Prisma.InputJsonValue,
        expiresAt,
        modelVersion: modelName,
        generatedAt: new Date()
      },
      create: {
        companyId: company.id,
        briefData: object as Prisma.InputJsonValue,
        expiresAt,
        modelVersion: modelName
      }
    })

    // 5. Registar uso (só após geração real bem-sucedida)
    await prisma.aIUsageLog.create({
      data: { userId: user.id, ticker: company.ticker },
    })

    return NextResponse.json({ brief: object })

  } catch (error) {
    console.error('AI Brief Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
