import { ContourCanvas } from "@/components/fx/ContourCanvas";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { Logo } from "@/components/brand/Logo";

/**
 * Auth — formulários num cartão Liquid Glass centrado sobre a
 * cartografia topográfica. As páginas (login/registo/reset) só
 * trazem o conteúdo do formulário.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-12">
      <ContourCanvas />
      <div className="mb-8">
        <Logo href="/" size="lg" />
      </div>
      <LiquidGlass className="w-full max-w-md p-8 sm:p-10">{children}</LiquidGlass>
    </div>
  );
}
