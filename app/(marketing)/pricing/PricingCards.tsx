"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Check, Zap, ArrowRight, Loader2 } from "lucide-react";
import { buttonVariants, Button } from "@/components/ui/button";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { Reveal } from "@/components/fx/Reveal";
import { cn } from "@/lib/utils";
import { usePaddle } from "@/components/providers/PaddleProvider";

interface PricingCardsProps {
  userEmail?: string;
  userId?: string;
}

export function PricingCards({ userEmail, userId }: PricingCardsProps = {}) {
  const t = useTranslations("pricing");
  const router = useRouter();
  const { paddle } = usePaddle();

  const [proPrice, setProPrice] = useState<string>(t("pro.price"));
  const [loadingPrice, setLoadingPrice] = useState(true);

  const priceId = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO;

  const freeFeatures = t.raw("features.free") as string[];
  const proFeatures = t.raw("features.pro") as string[];

  useEffect(() => {
    if (!paddle || !priceId) {
      // Se faltarem as chaves de ambiente, parar o loading passado 2s para não ficar infinito
      const timer = setTimeout(() => setLoadingPrice(false), 2000);
      return () => clearTimeout(timer);
    }

    // Fetch localized price
    const request = {
      items: [
        {
          priceId: priceId,
          quantity: 1,
        },
      ],
    };

    paddle.PricePreview(request)
      .then((preview) => {
        if (preview.data.details.lineItems.length > 0) {
          setProPrice(preview.data.details.lineItems[0].formattedTotals.total);
        }
      })
      .catch((error) => {
        console.error("Error fetching Paddle price preview:", error);
      })
      .finally(() => {
        setLoadingPrice(false);
      });
  }, [paddle, priceId]);

  const handleCheckout = () => {
    if (!paddle || !priceId) return;

    if (!userId) {
      // Se não tiver conta, obrigar a criar conta primeiro
      router.push("/register");
      return;
    }

    paddle.Checkout.open({
      items: [
        {
          priceId: priceId,
          quantity: 1,
        },
      ],
      customer: userEmail ? { email: userEmail } : undefined,
      customData: userId ? { userId } : undefined,
      settings: {
        successUrl: "https://bullmetrics.thebullocracy.com/dashboard",
      }
    });
  };

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
          <div className="mt-4 flex items-end justify-center gap-1 min-h-[56px]">
            {loadingPrice ? (
              <div className="flex items-center justify-center h-[56px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <span className="text-5xl font-extrabold tracking-tight">
                  {proPrice}
                </span>
                <span className="mb-1.5 text-muted-foreground">
                  / {t("pro.period")}
                </span>
              </>
            )}
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

        <div className="mt-auto">
          <Button
            size="lg"
            id="pricing-pro-cta"
            onClick={handleCheckout}
            disabled={!paddle || loadingPrice}
            className="w-full shadow-[0_4px_30px_-6px_hsl(var(--primary)/0.5)]"
          >
            {t("pro.cta")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </Reveal>
  );
}
