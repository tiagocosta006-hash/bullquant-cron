import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

/**
 * OG image do site (1200×630) — papel quente + dourado matte, wordmark
 * SF e acento Scotch itálico (o mesmo momento display do hero). Gerada
 * em build/request via next/og; aplica-se a todas as rotas sem imagem
 * própria (o root metadata não tinha openGraph.images).
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Bull Metrics — análise fundamental e value investing";

const PAPER = "#fafaf7";
const INK = "#1a1a17";
const INK_2 = "#57544d";
const GOLD = "#b8873b";
const BORDER = "#e7e5de";

export default async function OpengraphImage() {
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  const [sfHeavy, sfRegular, scotchBoldItalic, logo] = await Promise.all([
    readFile(path.join(fontsDir, "sf-ui-text", "SFUIText-Heavy.woff")),
    readFile(path.join(fontsDir, "sf-ui-text", "SFUIText-Regular.woff")),
    readFile(path.join(fontsDir, "scotch-display", "ScotchDisplay-BoldItalic.ttf")),
    readFile(path.join(process.cwd(), "public", "brand", "bull-metrics-icon.png")),
  ]);

  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: PAPER,
          padding: "64px 72px",
          fontFamily: "SF",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og exige <img> */}
          <img src={logoSrc} width={64} height={64} style={{ borderRadius: 16 }} alt="" />
          <span style={{ fontSize: 30, fontWeight: 800, color: INK, letterSpacing: -0.5 }}>
            {BRAND.name}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: 84,
              fontWeight: 800,
              color: INK,
              letterSpacing: -3,
              lineHeight: 1.02,
            }}
          >
            Vê o valor que
          </span>
          <span
            style={{
              fontFamily: "Scotch",
              fontStyle: "italic",
              fontSize: 84,
              color: GOLD,
              letterSpacing: -2,
              lineHeight: 1.1,
            }}
          >
            os outros não veem.
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              height: 2,
              width: 620,
              backgroundImage: `linear-gradient(90deg, ${GOLD}, ${BORDER})`,
            }}
          />
          <span style={{ fontSize: 26, color: INK_2 }}>
            10 anos de fundamentais · DCF integrada · AI Insights — grátis, em português
          </span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "SF", data: sfHeavy, weight: 800, style: "normal" },
        { name: "SF", data: sfRegular, weight: 400, style: "normal" },
        { name: "Scotch", data: scotchBoldItalic, weight: 700, style: "italic" },
      ],
    },
  );
}
