// Tema claro/escuro — classe `.dark` no <html> + localStorage('theme').
// O script anti-FOUC inline no root layout aplica a classe antes do primeiro
// paint; este módulo é a única outra peça que escreve o tema (toggle/settings).

export type Theme = "light" | "dark";

// Cores reais de --paper-bg / --night-bg (globals.css) para a UI do browser.
export const THEME_COLORS: Record<Theme, string> = {
  light: "#fafaf7",
  dark: "#100f0d",
};

export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

let transitionTimer: ReturnType<typeof setTimeout> | undefined;

export function applyTheme(theme: Theme) {
  const root = document.documentElement;

  // A transição de fundo só existe durante o toggle — no load inicial o body
  // não anima (senão qualquer flash claro→escuro fica visível 0.5s).
  root.classList.add("theme-transition");
  clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => root.classList.remove("theme-transition"), 550);

  root.classList.toggle("dark", theme === "dark");

  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* storage indisponível — o tema continua a funcionar na sessão */
  }

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
}
