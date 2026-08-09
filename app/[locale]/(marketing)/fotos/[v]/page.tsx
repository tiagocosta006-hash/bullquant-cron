import { notFound } from "next/navigation";

import { VariantSwitcher } from "@/components/devtools/VariantSwitcher";
import LandingPage from "../../page";

/**
 * /fotos/[v] — a landing REAL com cada uma das fotos de fundo do hero.
 *
 * As imagens já existiam em public/media/hero/ e o CSS das variantes também
 * (app/design-variants.css, `[data-v-hero]`), mas NÃO havia entrada nenhuma
 * no catálogo do painel Tweak (lib/devtools/tweak-variants.ts) — o controlo
 * nunca chegou a existir, e por isso não havia forma de as trocar.
 *
 * Um URL por foto resolve melhor do que um painel: vêem-se lado a lado em
 * separadores e o link é partilhável.
 *
 * Cada foto tem par CLARO e ESCURO — a troca é automática pelo `.dark` do
 * <html>, porque uma imagem pensada para papel fica ilegível sobre preto.
 * Para comparar as duas versões, usa o botão de tema no header.
 *
 * Só em desenvolvimento — é andaime de design, não produto.
 */

const FOTOS = [
  { id: "a", label: "Sem foto", hint: "Só a curva dourada (como está hoje)" },
  { id: "b", label: "Velas", hint: "candles — gráfico de velas macro" },
  { id: "c", label: "Fita", hint: "tape — fita de cotações" },
  { id: "d", label: "Bolsa", hint: "expo — fachada/edifício" },
  { id: "e", label: "Pregão", hint: "floor — chão de negociação" },
] as const;

export function generateStaticParams() {
  return FOTOS.map((f) => ({ v: f.id }));
}

export default async function FotosVariant({ params }: { params: Promise<{ v: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { v } = await params;
  if (!FOTOS.some((f) => f.id === v)) notFound();

  return (
    <div data-v-hero={v}>
      <VariantSwitcher
        title="Foto do hero"
        options={FOTOS}
        current={v}
        hrefFor={(id) => `/pt/fotos/${id}`}
        footer={
          <>
            Muda o tema no header para ver a versão clara/escura.
            <br />
            <a className="underline hover:text-foreground" href="/pt/tamanho/a">
              Tamanho dos mocks →
            </a>
            {/* /caras já não existe: o retrato 4:5 foi promovido a código em
                TeamMemberModal.tsx e o andaime das variantes foi apagado. */}
          </>
        }
      />

      {/* A landing é reutilizada TAL E QUAL (mesmo componente, não uma cópia):
          uma duplicação divergia ao segundo commit e deixava de servir para
          decidir. `preview: "1"` evita o redirect para /dashboard com sessão. */}
      <LandingPage searchParams={Promise.resolve({ preview: "1" })} />
    </div>
  );
}
