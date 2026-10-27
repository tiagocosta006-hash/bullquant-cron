import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, Loader2, MailCheck, XCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { OpenInboxButtons } from "@/components/auth/OpenInboxButtons";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { LEGAL } from "@/lib/legal/config";
import { cn } from "@/lib/utils";
import { AtualizarAteAtivo } from "./AtualizarAteAtivo";

export const metadata = { title: "Bem-vindo", robots: { index: false } };

/**
 * Regresso do checkout da Whop (redirect_url em lib/whop.ts → criarCheckoutWhop).
 *
 * A Whop junta `status` ao URL. O browser não é a prova do pagamento — quem dá
 * o PRO é o webhook —, por isso a página só decide o que DIZER:
 *   - pagamento falhado/cancelado → nada foi cobrado, tentar de novo;
 *   - sem sessão (acabou de se registar, email por confirmar) → confirmar o email;
 *   - com sessão → espera pelo webhook (refresca sozinha) e abre o dashboard.
 */
export default async function BemVindoPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; email?: string }>;
}) {
  const { status = "", email = "" } = await searchParams;
  const t = await getTranslations("welcome");
  const falhou = ["failed", "error", "canceled", "cancelled"].includes(status.toLowerCase());

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const conta = user ? await prisma.user.findUnique({ where: { id: user.id }, select: { plan: true } }).catch(() => null) : null;
  const ativo = conta?.plan === "PRO";

  const icone = "mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      {falhou ? (
        <>
          <div className={icone}><XCircle className="h-7 w-7" /></div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("failedTitle")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("failed")}</p>
          <Link href={user ? "/pricing" : "/login"} className={cn(buttonVariants({ size: "lg" }), "mt-8 w-full font-semibold")}>
            {t("retry")}
          </Link>
        </>
      ) : !user ? (
        <>
          <div className={icone}><MailCheck className="h-7 w-7" /></div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("confirmEmail", { email: email || "none" })}</p>
          <OpenInboxButtons email={email} />
          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">{t("spam")}</p>
          <Link href={`/verify-email?email=${encodeURIComponent(email)}`} className="mt-2 text-sm font-semibold text-primary underline-offset-4 hover:underline">
            {t("resend")}
          </Link>
        </>
      ) : ativo ? (
        <>
          <div className={icone}><CheckCircle2 className="h-7 w-7" /></div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("active")}</h1>
          <Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }), "mt-8 w-full font-semibold")}>
            {t("goDashboard")}
          </Link>
        </>
      ) : (
        <>
          <div className={icone}><Loader2 className="h-7 w-7 animate-spin" /></div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("activating")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("activatingNote")}</p>
          <AtualizarAteAtivo aviso={t("slow", { email: LEGAL.email })} />
        </>
      )}
    </div>
  );
}
