import { notFound } from "next/navigation";

import { VariantSwitcher } from "@/components/devtools/VariantSwitcher";
import LandingPage from "../../page";

/**
 * /tamanho/[v] — a landing REAL, um URL por alternativa de TAMANHO do frame
 * do produto e das réplicas do bento. (As FOTOS de fundo do hero são outra
 * coisa e vivem em /fotos/[v].)
 *
 * Existe porque o painel Tweak deixou de conseguir mudar isto: as variantes
 * estavam presas ao seletor `.max-w-5xl:has(> [style*="preserve-3d"])`, e
 * `preserve-3d` na ScrollShowcase é uma classe utilitária do Tailwind, não um
 * atributo `style` inline — nunca casou com nada. O seletor está corrigido
 * (`[data-showcase-frame]`), mas comparar alternativas a alternar um painel é
 * mau: não se veem lado a lado nem se manda o link a ninguém.
 *
 * Só em desenvolvimento — é andaime de design, não produto.
 */

const TAMANHOS = [
  { id: "a", label: "Original", hint: "Como está hoje — moldura a ~1015px" },
  { id: "b", label: "Mais largo", hint: "Frame até 80rem, bento a 1 coluna" },
  { id: "c", label: "Full-bleed", hint: "O frame rompe a margem, de bordo a bordo" },
  { id: "d", label: "Zoom dentro", hint: "A moldura fica, o conteúdo cresce 15%" },
] as const;

// SEM generateStaticParams, de propósito.
//
// Com ele, o Next marcava estas rotas como SSG e tentava renderizá-las no
// build — mas a página importa a landing REAL (`import LandingPage`), que usa
// APIs dinâmicas de servidor. O resultado era DYNAMIC_SERVER_USAGE, e em
// produção /fotos/a e /tamanho/a devolviam 500 em vez do 404 que o guarda de
// NODE_ENV pretendia. As /preview-* nunca tiveram o problema justamente por
// não terem esta função: são dinâmicas, e aí o notFound() resolve-se em tempo
// de pedido.
//
// É andaime de design: pré-renderizar não trazia nada.

export default async function TamanhoVariant({ params }: { params: Promise<{ v: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { v } = await params;
  if (!TAMANHOS.some((t) => t.id === v)) notFound();

  return (
    <div data-v-imgsize={v}>
      <VariantSwitcher
        title="Tamanho dos mocks"
        options={TAMANHOS}
        current={v}
        hrefFor={(id) => `/pt/tamanho/${id}`}
        footer={
          <a className="underline hover:text-foreground" href="/pt/fotos/a">
            Foto do hero →
          </a>
        }
      />

      {/* mesma landing, não uma cópia (ver nota em /fotos/[v]) */}
      <LandingPage searchParams={Promise.resolve({ preview: "1" })} />
    </div>
  );
}
