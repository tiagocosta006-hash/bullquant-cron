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
    <>
      {/* Cartografia topográfica fixa atrás de tudo + scroll pesado com rubber-band.
          ScrollPriceLine é fixed → tem de viver FORA do #marketing-wrap
          (o rubber-band aplica transform ao wrap e partiria o fixed). */}
      <ContourCanvas />
      <SectionBackdrop />
      <FloatingCta label={t("primaryCta")} note={t("floatingNote")} />
      <InertiaScroll wrapId="marketing-wrap" />
      <div id="marketing-wrap" className="flex flex-1 flex-col">
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
    </>
  );
}
