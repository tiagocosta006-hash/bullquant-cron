import { TopNav } from "@/components/layout/TopNav";
import { MobileDock } from "@/components/layout/MobileDock";
import { ContourCanvas } from "@/components/fx/ContourCanvas";
import { SmoothScroll } from "@/components/fx/SmoothScroll";
import { PaddleRetain } from "@/components/providers/PaddleRetain";
import { getUser } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isPulseAdmin } from "@/lib/pulse/server";

/**
 * Terminal — navegação ÚNICA: pill Liquid Glass flutuante no topo
 * (dock no fundo em mobile), cartografia atrás. Sem sidebar, sem
 * header duplo. Peso de scroll partilhado com a landing (InertiaScroll).
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // O grupo (app) é navegável por anónimos (ver empresas, usar a calculadora
  // DCF, explorar). As páginas PESSOAIS (portfolio/watchlist/settings) protegem-
  // se individualmente; guardar dados protege-se sempre na API (401). Por isso
  // o layout lida com user === null de forma graciosa (TopNav mostra "Entrar").
  const user = await getUser();

  let userName: string | null = null;
  let userEmail: string | null = null;
  const devSlot: React.ReactNode = null;
  let plan = "FREE";
  let dbUser = null;

  if (user) {
    userName = user.user_metadata?.name || user.email?.split("@")[0] || null;
    userEmail = user.email ?? null;
    dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { plan: true, paddleCustomerId: true },
    });

    if (dbUser) {
      plan = dbUser.plan;
    }
  }

  return (
    // overflow-x-clip: os filhos full-bleed (ex. a fita de ações da dashboard,
    // que usa 100vw para escapar ao max-w-7xl do <main>) não podem gerar scroll
    // horizontal — o 100vw inclui a largura da barra de scroll vertical.
    <div className="relative min-h-screen overflow-x-clip">
      <SmoothScroll />
      <ContourCanvas />
      <PaddleRetain email={userEmail} customerId={dbUser?.paddleCustomerId} />
      <TopNav
        userName={userName}
        userEmail={userEmail}
        plan={plan}
        devSlot={devSlot}
        isAdmin={isPulseAdmin(userEmail)}
      />
      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-24 md:px-6 md:pb-12">
        {children}
      </main>
      <MobileDock />
    </div>
  );
}
