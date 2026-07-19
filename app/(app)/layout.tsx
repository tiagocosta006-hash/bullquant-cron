import { TopNav } from "@/components/layout/TopNav";
import { MobileDock } from "@/components/layout/MobileDock";
import { ContourCanvas } from "@/components/fx/ContourCanvas";
import { InertiaScroll } from "@/components/fx/InertiaScroll";
import { PaddleRetain } from "@/components/providers/PaddleRetain";
import { getUser } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

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
  const user = await getUser();

  let userName: string | null = null;
  let userEmail: string | null = null;
  let devSlot: React.ReactNode = null;
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
    <div className="relative min-h-screen">
      <InertiaScroll />
      <ContourCanvas />
      <PaddleRetain email={userEmail} customerId={dbUser?.paddleCustomerId} />
      <TopNav userName={userName} userEmail={userEmail} plan={plan} devSlot={devSlot} />
      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-24 md:px-6 md:pb-12">
        {children}
      </main>
      <MobileDock />
    </div>
  );
}
