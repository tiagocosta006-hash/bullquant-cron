/**
 * Grava a versão em modo escuro do vídeo do hero (tour da plataforma em /stock/MSFT).
 * Usa o perfil com sessão PRO criado pelo capture-plataforma.mjs (headless).
 *
 *   node scripts/media/record-hero-dark.mjs
 *
 * Saída: prints-hd/videos/showcase-terminal-dark.mp4 (libx264, crf 24, -g 30, sem áudio).
 * Nunca escreve em public/.
 */
import puppeteer from "puppeteer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE ?? "https://thebullvalue.com";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? "C:/ffmpeg/bin/ffmpeg.exe";
const OUT_DIR = process.env.OUT_DIR ?? "C:/Users/alexm/Desktop/Bullocracy/prints-hd/videos";
const FINAL = path.join(OUT_DIR, "showcase-terminal-dark.mp4");
const RAW = path.join(OUT_DIR, "showcase-terminal-dark.raw.webm");
const W = 1440;
const H = 900;
const SCALE = 2;

process.env.PATH = `${path.dirname(FFMPEG)}${path.delimiter}${process.env.PATH ?? ""}`;
fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: null,
  userDataDir: process.env.PROFILE ?? path.join(os.tmpdir(), "bullvalue-capture-profile"),
  args: ["--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none", `--window-size=${W},${H}`],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: SCALE });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("theme", "dark");
    sessionStorage.setItem("bv_booted", "1");
  });
  await page.goto(BASE + "/stock/MSFT", { waitUntil: "networkidle2", timeout: 120_000 });
  if (/\/(login|register)/.test(new URL(page.url()).pathname)) {
    throw new Error("Sem sessão no perfil: corre capture-plataforma.mjs sem HEADLESS=1 e faz login.");
  }
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Recusar não essenciais")?.click();
  });
  await page.addStyleTag({
    content: `*,*::before,*::after{caret-color:transparent!important}
      .boot-screen,[data-cookie-banner]{display:none!important}
      .fixed.inset-x-3.top-3.z-50{display:none!important}
      .sticky.top-20{top:16px!important}
      html{scroll-behavior:auto!important}`,
  });
  await sleep(1200);

  /** Scroll suave (easeInOutCubic) do documento, em ms. */
  const smoothScroll = (to, ms) =>
    page.evaluate(
      (target, dur) =>
        new Promise((resolve) => {
          const el = document.scrollingElement || document.documentElement;
          const max = el.scrollHeight - window.innerHeight;
          const from = el.scrollTop;
          const end = Math.max(0, Math.min(max, target));
          const t0 = performance.now();
          const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
          const step = (now) => {
            const t = Math.min(1, (now - t0) / dur);
            el.scrollTop = from + (end - from) * ease(t);
            if (t < 1) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        }),
      to,
      ms,
    );

  const clickTab = async (label) => {
    const ok = await page.evaluate((l) => {
      const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim().endsWith(l));
      btn?.click();
      return Boolean(btn);
    }, label);
    if (!ok) throw new Error(`Separador "${label}" não encontrado`);
  };

  const tour = async () => {
    // Resumo (3s)
    await smoothScroll(220, 2200);
    await sleep(800);
    // Fundamentais (6s)
    await smoothScroll(0, 500);
    await clickTab("Fundamentais");
    await sleep(1200);
    await smoothScroll(1600, 4300);
    // Analista (5s)
    await smoothScroll(0, 500);
    await clickTab("Analista");
    await sleep(1500);
    await smoothScroll(500, 3000);
    // Valuation (6s)
    await smoothScroll(0, 500);
    await clickTab("Valuation");
    await sleep(1200);
    await smoothScroll(1400, 4300);
    await sleep(500);
  };

  let mode = "screencast";
  if (typeof page.screencast === "function") {
    const rec = await page.screencast({ path: RAW, ffmpegPath: FFMPEG });
    try {
      await tour();
    } finally {
      await rec.stop();
    }
  } else {
    // Recurso: PNGs a ~15 fps + ffmpeg.
    mode = "frames";
    const dir = path.join(OUT_DIR, "_frames-dark");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    let n = 0;
    let done = false;
    const grab = (async () => {
      while (!done) {
        const t = Date.now();
        await page.screenshot({ path: path.join(dir, `f${String(n++).padStart(5, "0")}.png`), type: "png" });
        await sleep(Math.max(0, 66 - (Date.now() - t)));
      }
    })();
    await tour();
    done = true;
    await grab;
    execFileSync(FFMPEG, ["-y", "-framerate", "15", "-i", path.join(dir, "f%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", RAW.replace(/\.webm$/, ".frames.mp4")]);
  }

  const src = mode === "screencast" ? RAW : RAW.replace(/\.webm$/, ".frames.mp4");
  execFileSync(FFMPEG, ["-y", "-i", src, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-g", "30", "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-movflags", "+faststart", FINAL], { stdio: "inherit" });
  console.log(`OK (${mode}): ${FINAL} — ${(fs.statSync(FINAL).size / 1e6).toFixed(2)} MB`);
} finally {
  await browser.close();
}
