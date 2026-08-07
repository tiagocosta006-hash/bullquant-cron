"use client";

import { useEffect, useState } from "react";
import { GoogleAnalytics } from "@next/third-parties/google";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { MetaPixel } from "@/components/analytics/MetaPixel";

export function CookieConsent({
  initialConsent = false,
  showInitialBanner = false,
}: {
  initialConsent?: boolean;
  showInitialBanner?: boolean;
}) {
  const t = useTranslations("cookieConsent");
  const [hasConsent, setHasConsent] = useState(initialConsent);
  const [showBanner, setShowBanner] = useState(showInitialBanner);

  // Fallback: se o utilizador já tiver aceite via localStorage (antigo) mas o
  // cookie ainda não existir no servidor, atualizamos o estado client-side.
  useEffect(() => {
    if (!initialConsent && showInitialBanner) {
      const oldConsent = localStorage.getItem("cookie_consent");
      if (oldConsent === "true") {
        setHasConsent(true);
        setShowBanner(false);
        document.cookie = "cookie_consent=true; path=/; max-age=31536000; SameSite=Lax";
      } else if (oldConsent === "false") {
        setShowBanner(false);
        document.cookie = "cookie_consent=false; path=/; max-age=31536000; SameSite=Lax";
      }
    }
  }, [initialConsent, showInitialBanner]);

  // Enquanto o banner está aberto no fundo do ecrã, sinaliza no <html> para a
  // landing esconder a sua pill flutuante (FloatingCta) — senão colidem
  // (banner z-50 vs CTA z-40, ambos fixed no fundo). Ver .cookie-open em globals.css.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("cookie-open", showBanner);
    return () => root.classList.remove("cookie-open");
  }, [showBanner]);

  const accept = () => {
    localStorage.setItem("cookie_consent", "true");
    document.cookie = "cookie_consent=true; path=/; max-age=31536000; SameSite=Lax";
    setHasConsent(true);
    setShowBanner(false);
  };

  const decline = () => {
    localStorage.setItem("cookie_consent", "false");
    document.cookie = "cookie_consent=false; path=/; max-age=31536000; SameSite=Lax";
    setShowBanner(false);
  };

  return (
    <>
      {hasConsent && process.env.NODE_ENV === "production" && (
        <>
          <GoogleAnalytics gaId="G-F89FT4052G" />
          <MetaPixel />
        </>
      )}
      
      {showBanner && (
        <div className="fixed bottom-0 w-full bg-background border-t p-4 z-50 flex flex-col md:flex-row justify-between items-center gap-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
          <p className="text-sm text-muted-foreground max-w-3xl">
            {t("text")}
          </p>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={decline}>
              {t("decline")}
            </Button>
            <Button size="sm" onClick={accept}>
              {t("accept")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
