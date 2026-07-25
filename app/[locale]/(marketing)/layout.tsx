import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ContourCanvas } from "@/components/fx/ContourCanvas";
import { InertiaScroll } from "@/components/fx/InertiaScroll";
import { getTranslations } from "next-intl/server";
import { FloatingCta } from "@/components/marketing/FloatingCta";
import { SectionBackdrop } from "@/components/marketing/SectionBackdrop";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("marketing");
  return (
    /* `motion-lush` = hovers longos (450ms, ease-in-out) SÓ nas páginas
       públicas; o terminal fica nos 260ms. Os tokens são custom properties,
       por isso herdam para toda a subárvore (ver globals.css).
       `contents` é deliberado: não gera caixa, logo não cria containing block
       (o ContourCanvas/SectionBackdrop/FloatingCta continuam `fixed` ao
       viewport), não cria stacking context (os -z-10 continuam a resolver na
       raiz) e o `flex-1` do #marketing-wrap continua a resolver contra o
       <main> do layout raiz. Serve apenas de portador dos tokens — incluindo
       para o que tem de viver FORA do #marketing-wrap. */
    <div className="contents motion-lush">
      {/* Cartografia topográfica fixa atrás de tudo + scroll pesado com rubber-band.
          ScrollPriceLine é fixed → tem de viver FORA do #marketing-wrap
          (o rubber-band aplica transform ao wrap e partiria o fixed). */}
      <ContourCanvas />
      <SectionBackdrop />
      <FloatingCta
        label={t("primaryCta")}
        peekLabel={t("peekCta")}
        note={t("floatingNote")}
      />
      <InertiaScroll wrapId="marketing-wrap" />
      <div id="marketing-wrap" className="flex flex-1 flex-col">
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
    </div>
  );
}
