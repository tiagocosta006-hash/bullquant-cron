import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { LandingA } from "./_landing/LandingA";
import { LandingB } from "./_landing/LandingB";
import { LandingC } from "./_landing/LandingC";
import { VariantSwitcher, type Variante } from "./_landing/VariantSwitcher";

/**
 * Landing com três versões lado a lado, para a equipa escolher (27/10/2026):
 *   ?v=a — a v3 direta ao ponto, só com as correções (versão por omissão);
 *   ?v=b — a landing toda redesenhada (copy, ordem e secções);
 *   ?v=c — igual à A, muda só a forma de mostrar os vídeos e os prints.
 * Com `?v=` na URL aparece o seletor flutuante para saltar entre elas; sem
 * parâmetro o público vê a A. Quando escolherem, fica só a escolhida.
 */
const VARIANTES = { a: LandingA, b: LandingB, c: LandingC } as const;

function lerVariante(v: string | undefined): Variante {
  return v === "b" || v === "c" ? v : "a";
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; v?: string }>;
}) {
  const [user, { preview, v }] = await Promise.all([getUser(), searchParams]);

  // ?preview=1 deixa ver a landing mesmo com sessão iniciada (rever design
  // sem ter de fazer logout / abrir janela anónima).
  if (user && preview !== "1") {
    redirect("/dashboard");
  }

  const variante = lerVariante(v);
  const Landing = VARIANTES[variante];

  return (
    <>
      <Landing />
      {v !== undefined && <VariantSwitcher atual={variante} preview={preview === "1"} />}
    </>
  );
}
