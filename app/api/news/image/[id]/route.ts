import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Proxy das imagens dos artigos do terminal.
 *
 * As imagens vêm de CDNs de terceiros arbitrários (media.zenfs.com,
 * image.cnbc.com, …) e a CSP da app só permite `img-src` de uma allowlist curta
 * (next.config.ts). Servi-las daqui faz com que contem como `'self'`, sem ter
 * de abrir a CSP a `https:` para toda a aplicação.
 *
 * O identificador é o **id do artigo**, nunca o URL. Aceitar um URL arbitrário
 * transformaria isto num proxy aberto — qualquer pessoa poderia usar o nosso
 * servidor para ir buscar o que quisesse. Assim só servimos URLs que já estão
 * na nossa base de dados.
 */

const FETCH_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 8_000_000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const article = await prisma.newsArticle.findUnique({
      where: { id },
      select: { imageUrl: true },
    });

    if (!article?.imageUrl) {
      return new NextResponse(null, { status: 404 });
    }

    const upstream = await fetch(article.imageUrl, {
      headers: { "User-Agent": "BullValueNewsBot/1.0 (+https://thebullvalue.com)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });

    if (!upstream.ok) return new NextResponse(null, { status: 404 });

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return new NextResponse(null, { status: 404 });

    const size = Number(upstream.headers.get("content-length") ?? 0);
    if (size > MAX_IMAGE_BYTES) return new NextResponse(null, { status: 404 });

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) return new NextResponse(null, { status: 404 });

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
        // As imagens dos artigos são imutáveis: o artigo nunca troca de imagem.
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch (err) {
    console.error("[news/image]", (err as Error).message);
    return new NextResponse(null, { status: 404 });
  }
}
