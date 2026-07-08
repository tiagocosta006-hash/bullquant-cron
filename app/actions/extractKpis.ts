'use server'

import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import * as cheerio from 'cheerio'
import { GoogleGenAI, Type } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

export async function extractKpisAction(ticker: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'User not authenticated' }
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id }
    })

    if (!dbUser || dbUser.plan !== 'PRO') {
      return { success: false, error: 'Only Pro users can request AI KPI extraction' }
    }

    const company = await prisma.company.findUnique({
      where: { ticker: ticker.toUpperCase() }
    })

    if (!company || !company.cik) {
      return { success: false, error: 'Company or CIK not found' }
    }

    // Fetch SEC Submissions to get the latest 10-K URL
    const headers = { 'User-Agent': 'TiagoCosta18 (tiago@example.com)' }
    const cik = company.cik.padStart(10, '0')
    const subsRes = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers })
    
    if (!subsRes.ok) {
      return { success: false, error: 'Failed to fetch SEC submissions' }
    }
    
    const subsData = await subsRes.json()
    const recent = subsData?.filings?.recent || {}
    const forms = recent.form || []
    const accessionNumbers = recent.accessionNumber || []
    const primaryDocuments = recent.primaryDocument || []
    
    let latest10KUrl = null
    for (let i = 0; i < forms.length; i++) {
      if (forms[i] === '10-K' || forms[i] === '20-F' || forms[i] === '40-F') {
        const accNumNoDash = accessionNumbers[i].replace(/-/g, '')
        latest10KUrl = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accNumNoDash}/${primaryDocuments[i]}`
        break
      }
    }

    if (!latest10KUrl) {
      return { success: false, error: 'Latest 10-K document not found' }
    }

    // Fetch the HTML document
    const docRes = await fetch(latest10KUrl, { headers })
    if (!docRes.ok) {
      return { success: false, error: 'Failed to fetch 10-K document' }
    }
    
    const htmlText = await docRes.text()
    const $ = cheerio.load(htmlText)
    const rawText = $.text().replace(/\s+/g, ' ').trim()

    const prompt = `You are an Elite Equity Research Analyst specializing in forensic accounting and SEC filings. 
    I am providing you with the text of an SEC annual report (10-K, 20-F, etc) for ${company.name} (${ticker}).
    
    # MISSION
    Your sole job is to read the document and extract their EXACT, specific Business KPIs (Key Performance Indicators) and operational metrics ALONG WITH their historical numerical values for the last 3 fiscal years.

    # CRITICAL RULES (ZERO TOLERANCE)
    1. NO GUESSING / NO HALLUCINATION: If a KPI is not explicitly mentioned and tracked as a core operating metric, DO NOT invent it.
    2. NO GENERIC FINANCIALS: Do NOT extract standard GAAP metrics like "Net Income", "EBITDA", or "Gross Margin". We want Non-GAAP operating metrics (e.g., "Monthly Active Users", "Same-Store Sales", "Vehicle Deliveries", "Shipments", "Memberships", "Segment Revenues").
    3. INDUSTRY SPECIFICITY: Extract the KPIs that are unique to this company's business model.
    4. NUMERICAL EXTRACTION: You MUST extract the EXACT, full numerical values. DO NOT abbreviate to millions! If a document says "15,000 million" or "15 billion", you MUST output 15000000000. For non-currency metrics, keep the exact native number.
    5. UNIT SPECIFICITY: You MUST append the specific unit of measurement or currency to the KPI name in parentheses. For example: "Vehicle Deliveries (Units)", "Free Cash Flow (EUR)", "Average Revenue Per User (USD)".
    6. PROOF: For each value, provide an exact quote ("quote") from the text (max 2 sentences) that proves where you found the number. CRITICAL: DO NOT quote raw table rows or disconnected numbers! If the metric is found inside a table, you MUST quote the natural language sentence directly preceding the table (e.g., "The following table summarizes our shipments..."). Chrome Text Fragments cannot highlight tables.
    7. INSIGHT: For each metric, provide a short 1-sentence analytical insight ("insight") summarizing the business context, trend, or reason for its performance, based purely on the management's commentary in the text.

    Provide the official URL of the document so we can link to it: ${latest10KUrl}

    CRITICAL: DO NOT return an empty object for years. You MUST find the core operating metrics.
    Output a JSON object exactly matching this schema (and nothing else, no markdown formatting):
    {
      "secUrl": "${latest10KUrl}",
      "years": {
        "2024": {
          "Vehicle Deliveries (Units)": {
            "value": 1808581,
            "quote": "We delivered 1,808,581 vehicles in 2024, representing a 38% increase...",
            "insight": "Deliveries surged by 38% year-over-year, driven primarily by the ramp-up of Model Y production in the Texas and Berlin gigafactories."
          },
          "Energy Storage Deployed (GWh)": {
            "value": 14.7,
            "quote": "Energy storage deployments grew to 14.7 GWh in 2024...",
            "insight": "Storage deployments experienced significant growth due to high demand for Megapack products globally."
          },
          "Free Cash Flow (USD)": {
            "value": 2500000000,
            "quote": "Free cash flow for the year was 2.5 billion dollars.",
            "insight": "Strong operating cash flows were partially offset by continued heavy capital expenditures in new factory infrastructure."
          }
        },
        "2023": { ... }
      }
    }`

    // Find the starting point of the financial data to avoid cutting it off
    let startIndex = rawText.indexOf('Item 7. Management')
    if (startIndex === -1) startIndex = rawText.indexOf('Item 7.')
    if (startIndex === -1) startIndex = rawText.indexOf('Item 5. Operating and Financial Review')
    if (startIndex === -1) startIndex = rawText.indexOf('Item 5.')
    
    // If we can't find the exact headers, fallback to the middle of the document where financials usually live
    if (startIndex === -1 || startIndex > rawText.length - 100000) {
      startIndex = Math.max(0, rawText.length - 900000) 
    }

    const optimalText = rawText.substring(startIndex, startIndex + 800000)

    let response
    let attempts = 0
    const maxAttempts = 2

    while (attempts < maxAttempts) {
      try {
        response = await ai.models.generateContent({
          model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
          contents: [
            prompt,
            optimalText
          ],
          config: {}
        })
        break
      } catch (err: any) {
        attempts++
        if (attempts >= maxAttempts) throw err
        
        // Only retry on 503 or 429
        const errMsg = err.message || ''
        if (errMsg.includes('503') || errMsg.includes('429') || errMsg.includes('UNAVAILABLE')) {
          console.warn(`[AI RETRY] Gemini API overloaded. Retrying in 3 seconds... (Attempt ${attempts})`)
          await new Promise(resolve => setTimeout(resolve, 3000))
        } else {
          throw err
        }
      }
    }

    let resultText = response?.text
    if (!resultText) {
      return { success: false, error: 'Failed to generate content from AI' }
    }
    
    // Clean up potential markdown formatting from Gemini
    if (resultText.startsWith('```json')) {
      resultText = resultText.replace(/^```json\n/, '').replace(/\n```$/, '')
    } else if (resultText.startsWith('```')) {
      resultText = resultText.replace(/^```\n/, '').replace(/\n```$/, '')
    }
    
    console.log(`[AI RESULT FOR ${ticker}]:`, resultText)
    const parsedData = JSON.parse(resultText)
    
    // Save to database
    const fundamentals = await prisma.fundamental.findMany({
      where: { companyId: company.id, periodType: 'ANNUAL' }
    })
    
    let updatedCount = 0
    for (const fund of fundamentals) {
      const fy = String(fund.fiscalYear)
      if (parsedData.years[fy]) {
        // Prepare the payload to store in businessKpis
        const dataToSave = {
          ...parsedData.years[fy],
          _metadata: { secUrl: parsedData.secUrl } // store URL to use in Text Fragments
        }
        
        await prisma.fundamental.update({
          where: { id: fund.id },
          data: { businessKpis: dataToSave }
        })
        updatedCount++
      }
    }

    revalidatePath(`/stock/[ticker]`, 'page')
    return { success: true, updatedCount }

  } catch (error: any) {
    console.error('Extract KPIs error:', error)
    
    let userMsg = error.message || 'Internal server error'
    
    // Parse ugly JSON errors from Google GenAI SDK
    try {
      if (userMsg.startsWith('{')) {
        const parsedErr = JSON.parse(userMsg)
        if (parsedErr.error && parsedErr.error.message) {
          const apiMsg = parsedErr.error.message
          if (parsedErr.error.code === 503 || apiMsg.includes('high demand') || apiMsg.includes('UNAVAILABLE')) {
            userMsg = 'Os servidores de Inteligência Artificial estão com tráfego elevado neste momento. Por favor aguarde uns instantes e tente novamente.'
          } else {
            userMsg = apiMsg
          }
        }
      } else if (userMsg.includes('503') || userMsg.includes('high demand')) {
        userMsg = 'Os servidores de Inteligência Artificial estão com tráfego elevado neste momento. Por favor aguarde uns instantes e tente novamente.'
      }
    } catch(e) {
      // JSON parse failed, leave userMsg as is
    }
    
    return { success: false, error: userMsg }
  }
}
