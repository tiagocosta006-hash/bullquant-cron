"use client";

import * as React from "react";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Check, Zap, ArrowRight, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/fx/Reveal";
import { cn } from "@/lib/utils";

/**
 * Cartão de preço único: PRO, pago na Whop.
 *
 * Não há plano gratuito. A subscrição compra-se na Whop (NEXT_PUBLIC_WHOP_URL) e o acesso chega à
 * conta pelo webhook (app/api/webhooks/whop) por e-mail. Antes de abrir o checkout, o utilizador
 * confirma duas coisas, que ficam à vista e travam o botão enquanto não estiverem marcadas:
 *   1. aceita Termos e Privacidade e declara ter 18 anos;
 *   2. pede expressamente o início imediato do serviço e reconhece o pagamento proporcional se
 *      resolver o contrato nos 14 dias (DL 24/2014 art. 15.º).
 * O preço e as condições de renovação aparecem ANTES do botão (informação pré-contratual).
 * Os impostos aplicáveis são calculados no checkout da Whop.
 */
export function PricingCards({ supportEmail }: { supportEmail: string }) {
  const t = useTranslations("pricing");
  const whopUrl = process.env.NEXT_PUBLIC_WHOP_URL;
  const proFeatures = t.raw("features.pro") as string[];

  const [aceita, setAceita] = React.useState(false);
  const [imediato, setImediato] = React.useState(false);
  const [tentou, setTentou] = React.useState(false);
  const pronto = aceita && imediato;

  const irParaWhop = (e: React.MouseEvent) => {
    if (!pronto || !whopUrl) { e.preventDefault(); setTentou(true); }
  };

  return (
    <Reveal className="mx-auto max-w-xl">
      <div className="relative flex flex-col items-center rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/8 via-card/80 to-card/60 p-8 text-center shadow-[0_0_60px_-10px_hsl(var(--primary)/0.25)] backdrop-blur">
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1 text-xs font-bold text-primary-foreground shadow-lg">
            <Zap className="h-3 w-3 fill-current" />
            {t("pro.badge")}
          </div>
        </div>

        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">{t("pro.name")}</p>
          <div className="mt-4 flex items-end justify-center gap-1">
            <span className="text-5xl font-extrabold tracking-tight">{t("pro.price")}</span>
            <span className="mb-1.5 text-muted-foreground">/ {t("pro.period")}</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{t("pro.description")}</p>
        </div>

        <ul className="mx-auto mb-8 flex w-fit flex-col gap-3 text-left">
          {proFeatures.map((feature) => (
            <li key={feature} className="flex items-center gap-3 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/15">
                <Check className="h-3 w-3 text-primary" />
              </span>
              {feature}
            </li>
          ))}
        </ul>

        <div className="w-full space-y-4 text-left">
          <p className="rounded-xl border border-border/60 bg-background/60 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            {t("consent.billing")}
          </p>

          <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
            <input type="checkbox" checked={aceita} onChange={(e) => setAceita(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]" />
            <span>
              {t.rich("consent.terms", {
                terms: (c) => <Link href="/terms" target="_blank" className="font-medium underline underline-offset-4">{c}</Link>,
                privacy: (c) => <Link href="/privacy" target="_blank" className="font-medium underline underline-offset-4">{c}</Link>,
              })}
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
            <input type="checkbox" checked={imediato} onChange={(e) => setImediato(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]" />
            <span>
              {t("consent.immediate")}{" "}
              <Link href="/refund" target="_blank" className="whitespace-nowrap font-medium underline underline-offset-4">{t("consent.withdrawalLink")}</Link>
            </span>
          </label>

          {whopUrl ? (
            <a
              href={pronto ? whopUrl : "#"}
              onClick={irParaWhop}
              target={pronto ? "_blank" : undefined}
              rel="noopener noreferrer"
              id="pricing-pro-cta"
              aria-disabled={!pronto}
              className={cn(buttonVariants({ size: "lg" }), "w-full font-semibold", !pronto && "cursor-not-allowed opacity-60")}
            >
              {t("consent.checkout")}
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          ) : (
            <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
              {t("consent.unavailable", { email: supportEmail })}
            </p>
          )}
          {tentou && !pronto && <p role="alert" className="text-center text-sm font-medium text-destructive">{t("consent.missing")}</p>}
        </div>

        <p className="mt-6 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          {t("pro.accessNote")}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          {t("consent.haveAccount")}{" "}
          <Link href="/register" className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline">
            {t("consent.createAccount")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </p>
      </div>
    </Reveal>
  );
}
