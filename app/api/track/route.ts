import { NextResponse, type NextRequest } from "next/server";
import { pulsePayloadSchema, recordServerEvent } from "@/lib/pulse/server";

/**
 * POST /api/track — ingestão de eventos Pulse (analytics first-party).
 * Público (sem auth), rate-limited no proxy (bucket `track`).
 * Responde SEMPRE 204 sem corpo (sendBeacon-friendly): analytics nunca
 * pode partir UX nem dar sinal a bots. DNT/GPC são honrados no helper.
 */
export async function POST(request: NextRequest) {
  const done = new NextResponse(null, { status: 204 });

  try {
    // sendBeacon envia Blob text/plain — ler texto e fazer parse manual.
    let payload: unknown;
    try {
      payload = JSON.parse(await request.text());
    } catch {
      return done;
    }
    const parsed = pulsePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      if (process.env.NODE_ENV !== "production")
        console.warn("[pulse] payload inválido:", parsed.error.flatten());
      return done;
    }
    const { type, path, referrer, meta } = parsed.data;

    // referrer só se for externo (host diferente do site)
    let externalReferrer: string | null = null;
    if (referrer) {
      try {
        const refHost = new URL(referrer).host;
        if (refHost && refHost !== request.nextUrl.host) externalReferrer = referrer;
      } catch {
        // referrer não-URL → ignora
      }
    }

    await recordServerEvent(request.headers, type, path, meta, externalReferrer);
  } catch (err) {
    // nunca propagar erros de analytics
    if (process.env.NODE_ENV !== "production") console.error("[pulse] erro:", err);
  }
  return done;
}
