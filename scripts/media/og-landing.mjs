/**
 * Imagens de partilha (Open Graph, 1200x630) a partir dos masters 8K de
 * scripts/media/capture-plataforma.mjs ({k}-light.png / {k}-dark.png).
 * O recorte de cada print é o "wide" de components/marketing/showcase/shots.json
 * (coordenadas de um print de 1920x1200, escaladas para o tamanho do master).
 *
 *   node scripts/media/og-landing.mjs                      → ../prints-hd → ../prints-hd/og
 *   node scripts/media/og-landing.mjs --src X --out Y
 *
 * Gera og-{fund,dcf,ai}-{light,dark}.png. Não mexe em public/og-image.png.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const SRC = path.resolve(ROOT, arg("--src", "../prints-hd"));
const OUT = path.resolve(ROOT, arg("--out", path.join(SRC, "og")));
if (path.resolve(OUT) === path.resolve(ROOT, "public")) throw new Error("não escrever em public/");

const SHOTS = JSON.parse(readFileSync(path.join(ROOT, "components/marketing/showcase/shots.json"), "utf8")).shots;

const W = 1200;
const H = 630;
const FRAME = { x: 600, y: 140, w: 560, h: 350, r: 14 };
const SANS = "'Segoe UI', Inter, Arial, Helvetica, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

const THEMES = {
  light: { bg: "#fafaf7", ink: "#1a1814", muted: "#6b665c", gold: "#b8862f", border: "rgba(26,24,20,0.10)", shadow: "rgba(26,24,20,0.16)" },
  dark: { bg: "#100f0d", ink: "#f3efe6", muted: "#a39d90", gold: "#c39340", border: "rgba(243,239,230,0.12)", shadow: "rgba(0,0,0,0.55)" },
};

// *palavra* = destaque em serif itálico dourado (como na landing).
const VARIANTS = [
  { key: "fund", lines: ["Percebe quanto *vale*", "uma ação antes", "de a comprares."], sub: "S&P 500 · 10 anos de dados da SEC" },
  { key: "dcf", lines: ["O DCF chega", "já *preenchido*.", "Tu só ajustas."], sub: "Sem folhas de cálculo · S&P 500" },
  { key: "ai", lines: ["Um analista de IA", "que te explica", "tudo em *português*."], sub: "Análise fundamental para quem investe" },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const spans = (line, t) =>
  line
    .split(/(\*[^*]+\*)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("*")
        ? `<tspan font-family="${SERIF}" font-style="italic" fill="${t.gold}">${esc(part.slice(1, -1))}</tspan>`
        : esc(part),
    )
    .join("");

const logoSvg = readFileSync(path.join(ROOT, "public/brand/logo.svg"), "utf8");
const logoInner = (gold) =>
  logoSvg
    .slice(logoSvg.indexOf(">") + 1, logoSvg.lastIndexOf("</svg>"))
    .replace(/#C28B1A/gi, gold);

async function shot(key, theme) {
  const file = path.join(SRC, `${key}-${theme}.png`);
  const meta = await sharp(file).metadata();
  const k = meta.width / 1920;
  const c = SHOTS[key].wide;
  const left = Math.round(c.x * k);
  const top = Math.round(c.y * k);
  const region = {
    left,
    top,
    width: Math.min(Math.round(c.w * k), meta.width - left),
    height: Math.min(Math.round(c.h * k), meta.height - top),
  };
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME.w}" height="${FRAME.h}"><rect width="${FRAME.w}" height="${FRAME.h}" rx="${FRAME.r}" ry="${FRAME.r}" fill="#fff"/></svg>`,
  );
  const resized = await sharp(file)
    .extract(region)
    .resize(FRAME.w, FRAME.h, { fit: "cover", position: "top", kernel: "lanczos3" })
    .png()
    .toBuffer();
  return sharp(resized).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

async function render(v, theme) {
  const t = THEMES[theme];
  const shadow = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="${FRAME.x}" y="${FRAME.y + 14}" width="${FRAME.w}" height="${FRAME.h}" rx="${FRAME.r}" fill="${t.shadow}"/></svg>`,
    ),
  )
    .blur(18)
    .png()
    .toBuffer();

  const base = 236;
  const lh = 52;
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <svg x="64" y="48" width="34" height="36" viewBox="0 0 600 636">${logoInner(t.gold)}</svg>
  <text x="108" y="76" font-family="${SANS}" font-size="24" font-weight="700" fill="${t.ink}">The BullValue</text>
  <rect x="64" y="174" width="36" height="3" rx="1.5" fill="${t.gold}"/>
  ${v.lines
    .map(
      (l, i) =>
        `<text x="64" y="${base + i * lh}" font-family="${SANS}" font-size="42" font-weight="700" letter-spacing="-0.4" fill="${t.ink}">${spans(l, t)}</text>`,
    )
    .join("\n  ")}
  <text x="64" y="${base + v.lines.length * lh + 24}" font-family="${SANS}" font-size="19" fill="${t.muted}">${esc(v.sub)}</text>
  <text x="64" y="572" font-family="${SANS}" font-size="17" font-weight="600" letter-spacing="0.4" fill="${t.gold}">thebullvalue.com</text>
  <rect x="${FRAME.x + 0.5}" y="${FRAME.y + 0.5}" width="${FRAME.w - 1}" height="${FRAME.h - 1}" rx="${FRAME.r}" fill="none" stroke="${t.border}"/>
</svg>`;

  const out = path.join(OUT, `og-${v.key}-${theme}.png`);
  await sharp({ create: { width: W, height: H, channels: 3, background: t.bg } })
    .composite([
      { input: shadow, left: 0, top: 0 },
      { input: await shot(v.key, theme), left: FRAME.x, top: FRAME.y },
      { input: Buffer.from(overlay), left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(out);
  return out;
}

mkdirSync(OUT, { recursive: true });
for (const theme of ["light", "dark"]) {
  for (const v of VARIANTS) console.log(await render(v, theme));
}
