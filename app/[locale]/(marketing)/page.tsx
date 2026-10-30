import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { LandingA } from "./_landing/LandingA";
import { LandingB } from "./_landing/LandingB";
import { LandingC } from "./_landing/LandingC";
import { LandingD } from "./_landing/LandingD";
import { LandingE } from "./_landing/LandingE";
import { LandingF } from "./_landing/LandingF";
import { LandingG } from "./_landing/LandingG";
import { LandingH } from "./_landing/LandingH";
import { VARIANTES_RASCUNHO, VariantSwitcher, type Variante } from "./_landing/VariantSwitcher";

/**
 * Landing com três versões lado a lado, para a equipa escolher (27/10/2026):
 *   ?v=a — a v3 direta ao ponto, só com as correções (versão por omissão);
 *   ?v=b — a landing toda redesenhada (copy, ordem e secções);
 *   ?v=c — igual à A, muda só a forma de mostrar os vídeos e os prints;
 *   ?v=d…h — mais alternativas (29/10/2026): D editorial, E rascunho da
 *   campanha grátis + livros (só com LANDING_RASCUNHOS=1), F visita guiada com
 *   scroll, G ultra-curta para o telemóvel, H "feita pela Bullocracy";
 *   ?v=i / ?v=j — a F com o título e subtítulo (maiores) da A / da B.
 * Com `?v=` na URL aparece o seletor flutuante para saltar entre elas; sem
 * parâmetro o público vê a J (escolhida a 30/10/2026: a F com o texto da B). Quando escolherem, fica só a escolhida.
 */
const LandingI = () => LandingF({ heroTexto: "a" });
const LandingJ = () => LandingF({ heroTexto: "b" });
const VARIANTES = { a: LandingA, b: LandingB, c: LandingC, d: LandingD, e: LandingE, f: LandingF, g: LandingG, h: LandingH, i: LandingI, j: LandingJ } as const;

/** Rascunhos (E) só nas pré-visualizações da equipa: em produção caem na A. */
const RASCUNHOS = process.env.LANDING_RASCUNHOS === "1";

function lerVariante(v: string | undefined): Variante {
  if (!v || !(v in VARIANTES)) return "j";
  const x = v as Variante;
  return VARIANTES_RASCUNHO.includes(x) && !RASCUNHOS ? "j" : x;
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
      {v !== undefined && <VariantSwitcher atual={variante} preview={preview === "1"} rascunhos={RASCUNHOS} />}
    </>
  );
}
