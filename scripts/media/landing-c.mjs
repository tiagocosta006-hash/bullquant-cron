/**
 * Gera os media da versão C da landing (public/media/c) a partir dos prints e
 * vídeos da A, que ficam intactos. Os recortes saem de
 * components/marketing/showcase/shots.json (fonte única, também lida pela app).
 *
 *   node scripts/media/landing-c.mjs           → 18 WebP (wide/square/full) + 3 posters
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

for (const [k, s] of Object.entries(shots)) {
  const src = origem("plataforma", `${k}.jpg`);
  const wide = destino("shots", `${k}-wide${v}.webp`);
  const square = destino("shots", `${k}-square${v}.webp`);
  const full = destino("shots", `${k}-full${v}.webp`);
  await sharp(src).extract({ left: s.wide.x, top: s.wide.y, width: s.wide.w, height: s.wide.h }).webp({ quality: 80 }).toFile(wide);
  await sharp(src).extract({ left: s.square.x, top: s.square.y, width: s.square.s, height: s.square.s }).webp({ quality: 78 }).toFile(square);
  await sharp(src).webp({ quality: 80 }).toFile(full);
  console.log(k, kb(wide), kb(square), kb(full));
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
