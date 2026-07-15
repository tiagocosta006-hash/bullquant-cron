"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { applyTheme, currentTheme } from "@/lib/theme";

/**
 * ThemeToggle — claro por defeito, escuro a um toque (fundações).
 * Persiste em localStorage('theme'); o script anti-FOUC no root layout
 * aplica a classe antes do primeiro paint.
 */
export function ThemeToggle() {
  const t = useTranslations("header");
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(currentTheme() === "dark");
  }, []);

  const toggle = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    setDark(next === "dark");
  };

  return (
    <Button type="button" variant="ghost" size="icon" onClick={toggle} title={t("theme")}>
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      <span className="sr-only">{t("theme")}</span>
    </Button>
  );
}
