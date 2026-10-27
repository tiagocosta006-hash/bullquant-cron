"use client";

import * as React from "react";
import { Link } from "@/i18n/routing";
import { useLocale, useTranslations } from "next-intl";
import { Check, Zap, ArrowRight, Lock, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/fx/Reveal";
import { cn } from "@/lib/utils";
import { PLANOS, PLANO_IDS, precoTexto, type PlanoId } from "@/lib/planos";

export type EstadoConta = "anonimo" | "semPro" | "pro";

/**
 * Os dois planos (lib/planos.ts): BullValue PRO e PRO + Comunidade.
 *
 * O que cada cartão pede depende de quem está a ver:
 *   - sem conta: o botão leva ao registo com o plano escolhido; o registo
 *     pede os Termos, os 18 anos e o início imediato (no botão), e segue
 *     sozinho para o checkout;
 *   - com conta sem PRO: os Termos já foram aceites no registo; cada botão
 *     submete o formulário (POST /api/checkout) com o seu plano, e é ele o
 *     pedido expresso de início imediato (DL 24/2014 art. 15.º) — sem caixa,
 *     com a frase que o diz colada ao botão, lida antes do clique;
 *   - com PRO: o plano que a conta já tem aparece como atual; do PRO só para a
 *     comunidade ainda se pode subir.
 * As condições de renovação aparecem ANTES do botão (informação pré-contratual).
 */
export function PricingCards({
  supportEmail,
  estado,
  planoAtual,
  erro,
}: {
  supportEmail: string;
  estado: EstadoConta;
  /** Com PRO: o plano que a conta tem (pelo produto da Whop). */
  planoAtual?: PlanoId | null;
  erro?: string;
}) {
  const t = useTranslations("pricing");
  const locale = useLocale();

  const [aEnviar, setAEnviar] = React.useState(false);
  const comFormulario = estado === "semPro" || (estado === "pro" && planoAtual === "pro");

  const cartao = (id: PlanoId) => {
    const destaque = id === "comunidade";
    const preco = precoTexto(PLANOS[id].preco, locale);
    const features = t.raw(`plans.${id}.features`) as string[];
    const atual = estado === "pro" && (planoAtual === id || (planoAtual !== "pro" && planoAtual !== "comunidade" && id === "pro"));
    const jaIncluido = estado === "pro" && planoAtual === "comunidade" && id === "pro";

    let acao: React.ReactNode;
    if (atual || jaIncluido) {
      acao = (
        <Link href="/dashboard" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full font-semibold")}>
          {atual ? t("consent.active") : t("consent.goDashboard")}
        </Link>
      );
    } else if (estado === "anonimo") {
      acao = (
        <Link
          href={`/register?plano=${id}`}
          data-track={`pricing_${id}`}
          className={cn(buttonVariants({ size: "lg", variant: destaque ? "default" : "outline" }), "w-full font-semibold")}
        >
          {id === "pro" ? t("consent.startPro") : t("consent.startComunidade")}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      );
    } else {
      acao = (
        <>
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            {t.rich("consent.immediate", {
              withdrawal: (chunks) => <Link href="/refund" target="_blank" className="font-medium text-foreground underline-offset-4 hover:underline">{chunks}</Link>,
            })}
          </p>
          <button
            type="submit"
            name="plano"
            value={id}
            form="form-checkout"
            data-track={`pricing_${id}`}
            disabled={aEnviar}
            className={cn(buttonVariants({ size: "lg", variant: destaque ? "default" : "outline" }), "w-full font-semibold")}
          >
            {id === "pro" ? t("consent.startPro") : t("consent.startComunidade")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </button>
        </>
      );
    }

    return (
      <div
        key={id}
        className={cn(
          "relative flex flex-col rounded-3xl border p-7 text-left backdrop-blur",
          destaque
            ? "border-primary/50 bg-gradient-to-br from-primary/10 via-card/80 to-card/60 shadow-[0_0_60px_-10px_hsl(var(--primary)/0.3)]"
            : "border-border/70 bg-card/70",
        )}
      >
        {destaque && (
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-4 py-1 text-xs font-bold text-primary-foreground shadow-lg">
              <Zap className="h-3 w-3 fill-current" />
              {t("plans.comunidade.badge")}
            </div>
          </div>
        )}
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary">
          {destaque && <Users className="h-4 w-4" />}
          {t(`plans.${id}.name`)}
        </p>
        <div className="mt-4 flex items-end gap-1">
          <span className="nums text-5xl font-extrabold tracking-tight">{preco} €</span>
          <span className="mb-1.5 text-muted-foreground">/ {t("pro.period")}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t(`plans.${id}.description`)}</p>

        <ul className="mb-7 mt-6 flex flex-1 flex-col gap-3">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/15">
                <Check className="h-3 w-3 text-primary" />
              </span>
              {f}
            </li>
          ))}
        </ul>

        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{t("consent.billing", { preco })}</p>
        {acao}
      </div>
    );
  };

  return (
    <Reveal className="mx-auto max-w-4xl">
      <div className="grid gap-8 md:grid-cols-2 md:gap-5">{PLANO_IDS.map(cartao)}</div>

      {comFormulario && (
        // Um formulário para os dois cartões: os botões levam form="form-checkout"
        // e o plano no seu value.
        <form id="form-checkout" method="post" action="/api/checkout" onSubmit={() => setAEnviar(true)} className="mx-auto mt-6 max-w-2xl space-y-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="imediato" value="on" />
          {estado === "pro" && planoAtual === "pro" && (
            <p className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">{t("consent.upgradeNote")}</p>
          )}
          {erro === "consentimento" && <p role="alert" className="text-center text-sm font-medium text-destructive">{t("consent.missing")}</p>}
        </form>
      )}

      {erro === "checkout" && (
        <p role="alert" className="mx-auto mt-4 max-w-2xl rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          {t("consent.error", { email: supportEmail })}
        </p>
      )}

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        {t("pro.steps")}
      </p>
      {estado === "anonimo" && (
        <p className="mt-3 text-center text-sm text-muted-foreground">
          {t("consent.haveAccount")}{" "}
          <Link href="/login" className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline">
            {t("consent.login")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </p>
      )}
    </Reveal>
  );
}
