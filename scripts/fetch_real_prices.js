// IMPORTANT: Load env vars BEFORE requiring @prisma/client, because Prisma's
// internal loader reads the bare .env file (which has an empty FINNHUB_API_KEY)
// and would overwrite our value if we called dotenv after.
const path = require('path');
// Override env — dotenv only sets a key if it isn't already in process.env,
// so we force-set the ones we need from .env.local FIRST.
const fs = require('fs');
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    // Force-set so Prisma's .env loader can't blank these out
    process.env[key] = val;
  }
}
loadEnvFile(path.join(__dirname, '../.env.local'));
loadEnvFile(path.join(__dirname, '../.env.dev'));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const companies = await prisma.company.findMany({ select: { ticker: true }, where: { isActive: true } });
  console.log(`Fetching prices for ${companies.length} companies...`);
  
  const results = [];
  const date = new Date();
  date.setHours(0,0,0,0);
  const apiKey = process.env.FINNHUB_API_KEY;
  
  if (!apiKey) {
    console.error('ERROR: FINNHUB_API_KEY is not set. Aborting.');
    process.exit(1);
  }
  console.log(`Using API key: ${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`);
  
  // Finnhub allows 60 req / min -> 1 req per sec.
  for (let i = 0; i < companies.length; i++) {
    const ticker = companies[i].ticker;
    try {
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`);
      const data = await res.json();
      
      if (data && data.c) {
        results.push({
          ticker: ticker,
          date: date,
          open: data.o || data.c,
          high: data.h || data.c,
          low: data.l || data.c,
          close: data.c,
          volume: 0
        });
      }
    } catch (e) {}
    
    process.stdout.write(`\rFetched ${i + 1} / ${companies.length} - Found: ${results.length}`);
    await new Promise(r => setTimeout(r, 1050)); // 1.05 sec delay -> ~ 8.5 minutes total.
  }
  
  console.log(`\nUpserting ${results.length} valid prices to database...`);
  
  for (let i = 0; i < results.length; i += 100) {
    const chunk = results.slice(i, i + 100);
    await prisma.price.createMany({
      data: chunk,
      skipDuplicates: true
    });
  }
  
  console.log('All real prices saved successfully!');
  process.exit(0);
}
run();
