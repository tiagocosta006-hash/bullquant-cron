import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

import { SmoothScroll } from "@/components/fx/SmoothScroll";
import { getTranslations } from "next-intl/server";
import { FloatingCta } from "@/components/marketing/FloatingCta";
import { BootScreen } from "@/components/brand/BootScreen";

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
      {/* ContourCanvas removido no orçamento de performance (ver globals.css):
          canvas full-viewport com um requestAnimationFrame contínuo a
          redesenhar linhas de contorno — repintura permanente por um fundo
          decorativo. A concorrência (pludata) não tem canvas nenhum. */}
      {/* Cortina de entrada — só na landing/marketing, nunca no terminal:
          quem já entrou na app quer chegar aos dados, não ver uma abertura. */}
      <BootScreen />
      {/* SectionBackdrop removido: eram 9 camadas fixas a trocar de tom
          conforme a secção passava (transparente → card/40 → secondary/50 →
          primary/.04). Esses degraus de tom eram o que fazia cada secção
          parecer um bloco separado — o fundo mudava enquanto o conteúdo
          corria. Um fundo contínuo junta a página toda, e poupa 9 camadas
          fixas mais um IntersectionObserver sobre 12 secções. */}
      <FloatingCta
        label={t("primaryCta")}
        peekLabel={t("peekCta")}
        note={t("floatingNote")}
      />
      <SmoothScroll />
      <div id="marketing-wrap" className="flex flex-1 flex-col">
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
    </div>
  );
}
