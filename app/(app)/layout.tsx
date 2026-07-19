import { TopNav } from "@/components/layout/TopNav";
import { MobileDock } from "@/components/layout/MobileDock";
import { ContourCanvas } from "@/components/fx/ContourCanvas";
import { InertiaScroll } from "@/components/fx/InertiaScroll";
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
  const user = await getUser();

  let userName: string | null = null;
  let userEmail: string | null = null;
  let plan: string | null = null;
  if (user) {
    userName = user.user_metadata?.name || user.email?.split("@")[0] || null;
    userEmail = user.email ?? null;
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { plan: true },
    });
    plan = dbUser?.plan ?? null;
  }

  return (
    <div className="relative min-h-screen">
      <InertiaScroll />
      <ContourCanvas />
      <TopNav
        userName={userName}
        userEmail={userEmail}
        plan={plan}
        isAdmin={isPulseAdmin(userEmail)}
      />
      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-24 md:px-6 md:pb-12">
        {children}
      </main>
      <MobileDock />
    </div>
  );
}
