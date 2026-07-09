import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ContourCanvas } from "@/components/fx/ContourCanvas";
import { InertiaScroll } from "@/components/fx/InertiaScroll";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Cartografia topográfica fixa atrás de tudo + scroll pesado com rubber-band */}
      <ContourCanvas />
      <InertiaScroll wrapId="marketing-wrap" />
      <div id="marketing-wrap" className="flex flex-1 flex-col">
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
    </>
  );
}
