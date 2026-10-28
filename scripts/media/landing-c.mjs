/**
 * Gera os media da versão C da landing (public/media/c) e os prints da A
 * (public/media/plataforma). Os recortes saem de
 * components/marketing/showcase/shots.json (fonte única, também lida pela app),
 * em coordenadas de um print de 1920x1200; escalam para o tamanho do master.
 *
 *   node scripts/media/landing-c.mjs --src ../prints-hd   → a partir dos masters
 *        {k}-light.png / {k}-dark.png de scripts/media/capture-plataforma.mjs:
 *        recortes a 2x (wide 2304x1440, square 2s), full a 3840 e os prints
 *        da A a 2560, em claro e em escuro (sufixo -dark)
 *   node scripts/media/landing-c.mjs           → só claro, dos JPG da A
 *   node scripts/media/landing-c.mjs --video   → também os 3 MP4 com keyframe a cada 1 s
 *
 * O ffmpeg vem de $FFMPEG ou do PATH.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const raiz = path.resolve(import.meta.dirname, "../..");
const { version, shots } = JSON.parse(readFileSync(path.join(raiz, "components/marketing/showcase/shots.json"), "utf8"));
const v = version > 1 ? `.v${version}` : "";
const origem = (...p) => path.join(raiz, "public/media", ...p);
const destino = (...p) => path.join(raiz, "public/media/c", ...p);
mkdirSync(destino("shots"), { recursive: true });

const kb = (f) => `${Math.round(statSync(f).size / 1024)} KB`;
const srcIdx = process.argv.indexOf("--src");
const srcDir = srcIdx > 0 ? path.resolve(process.argv[srcIdx + 1]) : null;

for (const [k, s] of Object.entries(shots)) {
  for (const theme of srcDir ? ["light", "dark"] : ["light"]) {
    const src = srcDir ? path.join(srcDir, `${k}-${theme}.png`) : origem("plataforma", `${k}.jpg`);
    const { width } = await sharp(src).metadata();
    const f = width / 1920;
    const px = (n) => Math.round(n * f);
    // Nunca ampliar: no máximo 2x o tamanho nominal do recorte.
    const alvo = (w) => Math.min(px(w), w * 2);
    const suf = theme === "dark" ? "-dark" : "";

    const wide = destino("shots", `${k}-wide${suf}${v}.webp`);
    const square = destino("shots", `${k}-square${suf}${v}.webp`);
    const full = destino("shots", `${k}-full${suf}${v}.webp`);
    await sharp(src)
      .extract({ left: px(s.wide.x), top: px(s.wide.y), width: px(s.wide.w), height: px(s.wide.h) })
      .resize(alvo(s.wide.w))
      .webp({ quality: 84, smartSubsample: true })
      .toFile(wide);
    await sharp(src)
      .extract({ left: px(s.square.x), top: px(s.square.y), width: px(s.square.s), height: px(s.square.s) })
      .resize(alvo(s.square.s))
      .webp({ quality: 84, smartSubsample: true })
      .toFile(square);
    await sharp(src).resize(Math.min(width, 3840)).webp({ quality: 82, smartSubsample: true }).toFile(full);
    let a = "";
    if (srcDir) {
      const jpg = origem("plataforma", `${k}${suf}.jpg`);
      await sharp(src).resize(2560).jpeg({ quality: 86, mozjpeg: true }).toFile(jpg);
      a = ` A ${kb(jpg)}`;
    }
    console.log(k, theme, kb(wide), kb(square), kb(full) + a);
  }
}

for (const nome of ["showcase-terminal", "feature-tour", "showcase-mobile"]) {
  const out = destino(`${nome}.webp`);
  await sharp(origem(`${nome}.jpg`)).webp({ quality: 78 }).toFile(out);
  console.log(nome, "poster", kb(out));
}

if (process.argv.includes("--video")) {
  const ffmpeg = process.env.FFMPEG || "ffmpeg";
  for (const [nome, crf] of [["showcase-terminal", 24], ["feature-tour", 28], ["showcase-mobile", 26]]) {
    const out = destino(`${nome}.mp4`);
    execFileSync(ffmpeg, [
      "-y", "-loglevel", "error", "-i", origem(`${nome}.mp4`), "-an",
      "-c:v", "libx264", "-preset", "slow", "-crf", String(crf),
      "-g", "30", "-keyint_min", "30", "-sc_threshold", "0",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
    ], { stdio: "inherit" });
    console.log(nome, "mp4", kb(out));
  }
}
