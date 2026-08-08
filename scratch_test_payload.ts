import http from 'http'
import fetch from 'node-fetch' // we can just use native fetch if node 18+

async function testPost() {
  const payload = {
    ticker: 'META',
    label: 'Teste',
    notes: 'apenas um teste',
    inputs: {
      fcf0: 46861150000,
      growthStage1: 0.168,
      growthStage2: 0.084,
      wacc: 0.094,
      terminalGrowth: 0.02,
      shares: 2574000000,
      netDebt: -22848000000,
      fcfMode: 'FCFF'
    },
    result: {
      fairValue: 573.96,
      currentPrice: 593.32,
      marginOfSafety: -0.034
    }
  }

  try {
    // Note: We can't actually call the local Next.js server unless it's running.
    // If it's not running, we can't test the API route this way.
    // However, I can test the logic of the route manually.
    console.log("Payload:", JSON.stringify(payload))
  } catch (e) {
    console.error(e)
  }
}

testPost()
