import cron from "node-cron";
import express from "express";
import { spawn } from "child_process";

const PORT = process.env.PORT || 8080;
const app = express();

// Dummy endpoint for Render Health Check and UptimeRobot
app.get("/", (req, res) => {
  res.send("BullQuant Cron Server is running!");
});

async function runCommand(commandStr: string) {
  console.log(`[CRON] Executing: ${commandStr} at ${new Date().toISOString()}`);
  return new Promise((resolve) => {
    const parts = commandStr.split(" ");
    const cmd = parts[0];
    const args = parts.slice(1);
    
    const child = spawn(cmd, args, { stdio: "inherit" });
    
    child.on("close", (code) => {
      console.log(`[CRON] [${commandStr}] Exited with code ${code}`);
      resolve(code);
    });
    child.on("error", (err) => {
      console.error(`[CRON] [${commandStr}] Failed to start:`, err);
      resolve(1);
    });
  });
}

// 1. Ingest News (De hora a hora)
cron.schedule("0 * * * *", () => runCommand("node --import tsx scripts/ingest_news.ts --max=5"));

// 2. Ingest Earnings (3x por dia: 7h, 14h, 21h)
cron.schedule("0 7,14,21 * * *", () => runCommand("python3 scripts/ingest_earnings.py"));

// 3. Ingest Insider (Semanal, domingo 7h30)
cron.schedule("30 7 * * 0", () => runCommand("python3 scripts/ingest_insider.py"));

// 4. Ingest Macro Events (Semanal, 2ª feira 8h)
cron.schedule("0 8 * * 1", () => runCommand("python3 scripts/ingest_macro_events.py"));

// 5. Ingest Fundamentals (Diário 3h UTC)
cron.schedule("0 3 * * *", () => {
  runCommand("python3 scripts/ingest_fundamentals.py").then(() => {
    runCommand("python3 scripts/adjust_splits.py");
  });
});

// 6. Ingest Prices (Dias de semana 23h UTC)
cron.schedule("0 23 * * 1-5", () => runCommand("python3 scripts/ingest_prices.py"));

// 7. Validate Database (Todos os dias à 01:00)
cron.schedule("0 1 * * *", () => runCommand("node --import tsx scripts/check_db.ts"));

// 8. Ingest CEOs (Mensal, dia 1 às 2h)
cron.schedule("0 2 1 * *", () => runCommand("python3 scripts/ingest_ceos.py"));

// 9. Ingest Fast Fundamentals (Diário 8h UTC)
cron.schedule("0 8 * * *", () => runCommand("node --import tsx scripts/ingest_fast_fundamentals.ts"));

// 10. Ingest Corporate Events (Diário 7h UTC)
cron.schedule("0 7 * * *", () => runCommand("python3 scripts/ingest_corporate_events.py"));

// 11. Ingest Segments (Diário 6h UTC)
cron.schedule("0 6 * * *", () => {
  runCommand("python3 scripts/derive_q4_segments.py").then(() => {
    runCommand("python3 scripts/backfill_minority_interest.py --tenks 9 --tenqs 24");
    runCommand("python3 scripts/fill_insider_titles.py");
  });
});

// 12. Triage Macro (Todos os dias às 18:30)
cron.schedule("30 18 * * *", () => runCommand("node --import tsx scripts/triage_macro.ts"));

app.listen(PORT, () => {
  console.log(`BullQuant Cron Server is listening on port ${PORT}`);
  console.log(`Cron schedules initialized!`);
});
