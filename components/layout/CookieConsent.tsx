"use client";

import { useEffect, useState } from "react";
import { GoogleAnalytics } from "@next/third-parties/google";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function CookieConsent() {
  const t = useTranslations("cookieConsent");
  const [hasConsent, setHasConsent] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie_consent");
    if (consent === "true") {
      setHasConsent(true);
    } else if (consent === null) {
      setShowBanner(true);
    }
  }, []);

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
    setHasConsent(true);
    setShowBanner(false);
  };

  const decline = () => {
    localStorage.setItem("cookie_consent", "false");
    setShowBanner(false);
  };

  return (
    <>
      {hasConsent && process.env.NODE_ENV === "production" && (
        <GoogleAnalytics gaId="G-F89FT4052G" />
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
