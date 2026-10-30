/**
 * Prints da plataforma para a landing, em tema claro e escuro, a 5,33x
 * (viewport de 1440x900 CSS → 7680x4800 px, "8K"). O texto e os gráficos são
 * desenhados de raiz a essa resolução pelo Chrome (não é um upscale), por isso
 * os recortes da landing ficam nítidos mesmo em ecrãs retina.
 *
 * Tira as prints do site real com uma conta PRO: abre uma janela do Chrome
 * no login, a pessoa entra com a sua conta (o script nunca vê a password) e
 * a captura segue sozinha. A sessão fica num perfil temporário, por isso uma
 * segunda corrida já não pede login.
 *   node scripts/media/capture-plataforma.mjs [baseUrl] [pastaDeSaída]
 *   (baseUrl por omissão https://thebullvalue.com; ONLY=val,dcf para repetir só algumas;
 *    HEADLESS=1 nas corridas seguintes, já com sessão — é o modo que deve tirar as finais)
 *
 * Os masters (PNG, ~20 MB cada) não vão para o git: ficam na pasta de saída
 * (por omissão ../prints-hd, ao lado do repo). Os WebP da landing saem deles
 * com `node scripts/media/landing-c.mjs --src <pastaDeSaída>`.
 */
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer";

const BASE = process.argv[2] ?? "https://thebullvalue.com";
const OUT = path.resolve(process.argv[3] ?? path.join(import.meta.dirname, "../../../prints-hd"));
const W = 1440;
const H = 900;
const SCALE = 7680 / W;
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

/**
 * Enquadramento igual ao dos prints originais (1920x1200 = 1440x900 a 1,33x),
 * para as coordenadas de shots.json continuarem a bater certo:
 * `tab` = separador a abrir; `anchor` = texto de um título que fica a `top`
 * px CSS do topo; sem anchor, a página desce `scroll` px. O menu da app sai
 * da imagem e o corte de cima cai sempre em espaço vazio.
 */
const SHOTS = {
  fund: { url: "/stock/MSFT", tab: "Fundamentais", anchor: "Motor de Decisão", top: 112 },
  val: { url: "/stock/MSFT", tab: "Valuation", scroll: 72 },
  dcf: { url: "/dcf?ticker=MSFT", scroll: 72 },
  fmva: { url: "/dcf?ticker=MSFT&modo=modelo", tab: "Schedules", anchor: "Historicals", top: 24 },
  ai: { url: "/stock/MSFT", tab: "Analista", anchor: "Analista IA", top: 112 },
  cal: { url: "/calendar", scroll: 72 },
};

const only = process.env.ONLY?.split(",");
mkdirSync(OUT, { recursive: true });

// HEADLESS=1 depois do primeiro login (a sessão fica no perfil): a janela
// visível pinta por tiles e, a 6x, a print pode sair com zonas por pintar.
const HEADLESS = process.env.HEADLESS === "1";
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: HEADLESS,
  defaultViewport: null,
  userDataDir: process.env.PROFILE ?? path.join(os.tmpdir(), "bullvalue-capture-profile"),
  args: ["--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none", "--window-size=1300,900"],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Login feito pela pessoa, na janela: espera até sair das páginas de auth.
{
  const page = (await browser.pages())[0] ?? (await browser.newPage());
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
  if (HEADLESS && /\/login/.test(new URL(page.url()).pathname)) throw new Error("Sem sessão: corre primeiro sem HEADLESS=1 e faz login.");
  console.log("À espera do login na janela do Chrome (até 15 min)…");
  const fim = Date.now() + 15 * 60_000;
  while (/\/(login|register|verify-email|forgot-password)/.test(new URL(page.url()).pathname)) {
    if (Date.now() > fim) throw new Error("Login não feito a tempo.");
    await sleep(2000);
  }
  console.log("Sessão iniciada:", page.url());
}

for (const theme of ["light", "dark"]) {
  for (const [key, shot] of Object.entries(SHOTS)) {
    if (only && !only.includes(key)) continue;
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: SCALE });
    await page.evaluateOnNewDocument((t) => {
      localStorage.setItem("theme", t);
      // Sem cortina de arranque nas prints.
      sessionStorage.setItem("bv_booted", "1");
    }, theme);
    await page.goto(BASE + shot.url, { waitUntil: "networkidle2", timeout: 180_000 });
    // Banner de cookies: a opção mais privada, e sai da imagem.
    await page.evaluate(() => {
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Recusar não essenciais")?.click();
    });
    await page.addStyleTag({
      content: `*,*::before,*::after{caret-color:transparent!important}
        .boot-screen,[data-cookie-banner]{display:none!important}
        /* Menu da app (TopNav) fora da imagem; os separadores da empresa sobem para o topo. */
        .fixed.inset-x-3.top-3.z-50{display:none!important}
        .sticky.top-20{top:16px!important}`,
    });

    if (shot.tab) {
      const clicked = await page.evaluate((label) => {
        const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim().endsWith(label));
        btn?.click();
        return Boolean(btn);
      }, shot.tab);
      if (!clicked) throw new Error(`${key}: separador "${shot.tab}" não encontrado`);
      await page.waitForNetworkIdle({ idleTime: 1500, timeout: 120_000 }).catch(() => {});
    }

    await page.mouse.move(W - 1, H - 1);
    await page.evaluate(
      ({ anchor, top, scroll }) => {
        let y = scroll;
        if (anchor) {
          const el = [...document.querySelectorAll("h1,h2,h3,button,span")].find(
            (e) => {
              const t = e.textContent.trim();
              // Os passos do modelo são "1Historicals", "2Schedules"…: aceita o número à frente.
              return (t.startsWith(anchor) || (e.tagName === "BUTTON" && t.endsWith(anchor))) && e.getBoundingClientRect().height > 0;
            },
          );
          if (el) y = window.scrollY + el.getBoundingClientRect().top - top;
        }
        window.scrollTo({ top: y, behavior: "instant" });
      },
      { anchor: shot.anchor, top: shot.top ?? 0, scroll: shot.scroll ?? 0 },
    );
    // Animações de entrada, gráficos e o header que se esconde ao fazer scroll.
    await sleep(6000);

    const file = path.join(OUT, `${key}-${theme}.png`);
    await page.screenshot({ path: file, type: "png", captureBeyondViewport: false });
    console.log(file);
    await page.close();
  }
}

await browser.close();
