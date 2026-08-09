import { notFound } from "next/navigation";

import LandingPage from "../page";

/**
 * /preview — a landing com as escolhas de design do Alex aplicadas.
 *
 * NÃO é uma cópia da landing: importa o próprio componente da landing e
 * envolve-o num wrapper que carrega as variantes escolhidas. Assim não há
 * duplicação de 750 linhas nem risco de as duas versões divergirem — o
 * conteúdo é literalmente o mesmo, só muda a camada de design.
 *
 * Escolhas capturadas no painel Tweak (2026-08-06):
 *   Ícone dos cartões ....... "Ao lado"    (data-v-icon=b)      corrige icon-tile-stack ×7
 *   Sobretítulo ............. "Removido"   (data-v-kicker=b)    corrige kicker-above-heading ×6
 *   Elevação ................ "Papel"      (data-v-elev=c)      corrige gpt-thin-border-wide-shadow ×5
 *   Texto minúsculo ......... "Piso 12px"  (data-v-microtext=c) corrige undersized-ui-text ×40
 *   Hover ................... 50ms         (--dur-hover)
 *   Ar entre secções ........ 140px        (.preview-rhythm)
 *
 * Mantidos no original de propósito (escolha do Alex): cartões aninhados,
 * texto com gradiente, contraste do dourado e conteúdo escondido.
 *
 * Só existe em desenvolvimento — é uma bancada de comparação, não uma rota
 * de produto. Comparar lado a lado: /pt (actual) vs /pt/preview (proposta).
 */
export default async function DesignPreviewPage(props: {
  searchParams: Promise<{ preview?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <div
      data-v-icon="b"
      data-v-kicker="b"
      data-v-microtext="c"
      className="preview-rhythm"
      style={{ "--dur-hover": "50ms" } as React.CSSProperties}
    >
      {/* A landing recebe preview=1 para não redirecionar quem tem sessão
          iniciada — se não, o Alex autenticado nunca via esta página. */}
      <LandingPage searchParams={Promise.resolve({ preview: "1" })} />
    </div>
  );
}
