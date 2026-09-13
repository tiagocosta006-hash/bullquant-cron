"use client";

import { Link } from '@/i18n/routing';
import { useTranslations } from "next-intl";

import { Check, Zap, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { Reveal } from "@/components/fx/Reveal";
import { cn } from "@/lib/utils";

/**
 * Cartões de preço SEM checkout.
 *
 * Nesta fase o PRO não se compra aqui: o acesso vem da comunidade privada no
 * Whop, e quem tem membership ativa recebe PRO pelo webhook
 * (app/api/webhooks/whop). Um botão de compra nesta página criava uma segunda
 * fonte de verdade para o mesmo campo `plan` — um cancelamento de um lado
 * despromovia quem paga do outro.
 *
 * Por isso saiu daqui o Paddle INTEIRO, e não só o botão:
 *
 *   · O `PricePreview` ia buscar o preço localizado à API do Paddle. Sem
 *     checkout isso era uma chamada de rede, um spinner e um estado de
 *     carregamento para mostrar um número que já está no ficheiro de
 *     traduções.
 *   · O botão estava `disabled={!paddle || loadingPrice}`, ou seja, dependia
 *     de um script que as extensões de bloqueio de anúncios bloqueiam com
 *     frequência — e aí ficava morto para sempre.
 *   · Com NEXT_PUBLIC_WHOP_URL vazia (era o caso em produção), o clique caía
 *     no `paddle.Checkout.open` apesar de o comentário dizer que o checkout
 *     estava suspenso. Quem clicasse com sessão iniciada abria mesmo um
 *     pagamento pelo Paddle.
 *
 * Para reativar vendas próprias: repor o Paddle aqui e o CTA no cartão.
 */
export function PricingCards() {
  const t = useTranslations("pricing");

  const whopUrl = process.env.NEXT_PUBLIC_WHOP_URL;

  const freeFeatures = t.raw("features.free") as string[];
  const proFeatures = t.raw("features.pro") as string[];

  return (
    <Reveal className="grid gap-5 md:grid-cols-2">
      {/* Plano Gratuito */}
      <LiquidGlass className="flex flex-col items-center text-center rounded-3xl p-8">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {t("free.name")}
          </p>
          <div className="mt-4 flex items-end justify-center gap-1">
            <span className="text-5xl font-extrabold tracking-tight">
              {t("free.price")}
            </span>
            <span className="mb-1.5 text-muted-foreground">
              / {t("free.period")}
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("free.description")}
          </p>
        </div>

        <ul className="mb-10 flex flex-col gap-3 text-left w-fit mx-auto">
          {freeFeatures.map((feature) => (
            <li key={feature} className="flex items-center gap-3 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                <Check className="h-3 w-3 text-muted-foreground" />
              </span>
              {feature}
            </li>
          ))}
        </ul>

        <div className="mt-auto">
          <Link
            href="/register"
            id="pricing-free-cta"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "w-full"
            )}
          >
            {t("free.cta")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </LiquidGlass>

      {/* Plano PRO */}
      <div className="relative flex flex-col items-center text-center rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/8 via-card/80 to-card/60 p-8 shadow-[0_0_60px_-10px_hsl(var(--primary)/0.25)] backdrop-blur">
        {/* Badge "Mais popular" */}
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1 text-xs font-bold text-primary-foreground shadow-lg">
            <Zap className="h-3 w-3 fill-current" />
            {t("pro.badge")}
          </div>
        </div>

        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            {t("pro.name")}
          </p>
          <div className="mt-4 flex items-end justify-center gap-1">
            <span className="text-5xl font-extrabold tracking-tight">
              {t("pro.price")}
            </span>
            <span className="mb-1.5 text-muted-foreground">
              / {t("pro.period")}
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("pro.description")}
          </p>
        </div>

        <ul className="mb-10 flex flex-col gap-3 text-left w-fit mx-auto">
          {proFeatures.map((feature) => (
            <li key={feature} className="flex items-center gap-3 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 border border-primary/30">
                <Check className="h-3 w-3 text-primary" />
              </span>
              {feature}
            </li>
          ))}
        </ul>

        <div className="mt-auto w-full">
          <p className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            {t("pro.accessNote")}
          </p>
          {/* Link de texto, NÃO um botão de compra: a página dizia "exclusivo
              da comunidade privada" e não dava forma nenhuma de lá chegar —
              um beco para quem quisesse entrar. Não abre checkout nenhum,
              leva à página da comunidade. */}
          {whopUrl && (
            <a
              href={whopUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              {t("pro.communityLink")}
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </Reveal>
  );
}
