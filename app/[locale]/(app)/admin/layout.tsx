import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { isPulseAdmin } from "@/lib/pulse/server";

/**
 * Gate de TODAS as rotas /admin/*. Acesso restrito à allowlist
 * ANALYTICS_ADMIN_EMAILS (o mesmo grupo interno do /analytics; não há campo
 * admin no modelo User). Fora dela → 404 (não revela a rota).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user || !isPulseAdmin(user.email)) notFound();

  return <>{children}</>;
}
