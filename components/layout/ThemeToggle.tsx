"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * ThemeToggle — claro por defeito, escuro a um toque (fundações).
 * Persiste em localStorage('theme'); o script anti-FOUC no root layout
 * aplica a classe antes do primeiro paint.
 */
export function ThemeToggle() {
  const t = useTranslations("header");
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* storage indisponível — o toggle continua a funcionar na sessão */
    }
    setDark(next);
  };

  return (
    <Button type="button" variant="ghost" size="icon" onClick={toggle} title={t("theme")}>
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      <span className="sr-only">{t("theme")}</span>
    </Button>
  );
}
