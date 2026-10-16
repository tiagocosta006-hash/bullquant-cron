"use client";

import { useCallback, useEffect, useState } from "react";
import { GoogleAnalytics } from "@next/third-parties/google";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { MetaPixel } from "@/components/analytics/MetaPixel";
import { NOME_COOKIE_PREFS, serializarPrefs as serializar, type PrefsCookies, EVENTO_DEFINICOES_COOKIES } from "@/lib/legal/cookiePrefs";

/**
 * Consentimento de cookies, por categoria (Lei 41/2004 art. 5.º; RGPD).
 *
 *  - Essenciais: sempre; não precisam de consentimento.
 *  - Estatística (Google Analytics) e Marketing (Meta Pixel): desligadas por omissão,
 *    escolhidas separadamente; "Recusar" e "Aceitar" com o mesmo peso visual.
 *  - A escolha vive 12 meses no cookie `cookie_prefs` (a=estatística, m=marketing) e pode ser
 *    revista a qualquer altura: o rodapé dispara o evento `bv:cookie-settings`.
 *  - O antigo `cookie_consent` (um sim/não para uma finalidade só) NÃO vale como consentimento
 *    de marketing: é ignorado e volta-se a perguntar.
 */

const NOME = NOME_COOKIE_PREFS;
const UM_ANO = 31536000;

/** Apaga cookies de terceiros de uma categoria revogada (só os do nosso domínio são alcançáveis). */
function limparCookies(prefixos: string[]) {
  const hosts = [location.hostname, "." + location.hostname.replace(/^www\./, "")];
  for (const c of document.cookie.split(";")) {
    const nome = c.split("=")[0].trim();
    if (!prefixos.some((p) => nome === p || nome.startsWith(p))) continue;
    for (const h of hosts) document.cookie = `${nome}=; path=/; domain=${h}; max-age=0; SameSite=Lax`;
    document.cookie = `${nome}=; path=/; max-age=0; SameSite=Lax`;
  }
}

export function CookieConsent({ initialPrefs = null }: { initialPrefs?: PrefsCookies | null }) {
  const t = useTranslations("cookieConsent");
  const [prefs, setPrefs] = useState<PrefsCookies | null>(initialPrefs);
  const [aberto, setAberto] = useState(initialPrefs === null);
  const [detalhe, setDetalhe] = useState(false);
  const [rascunho, setRascunho] = useState<PrefsCookies>(initialPrefs ?? { analytics: false, marketing: false });

  // O rodapé abre as definições a qualquer momento.
  useEffect(() => {
    const abrir = () => { setRascunho(prefs ?? { analytics: false, marketing: false }); setDetalhe(true); setAberto(true); };
    window.addEventListener(EVENTO_DEFINICOES_COOKIES, abrir);
    return () => window.removeEventListener(EVENTO_DEFINICOES_COOKIES, abrir);
  }, [prefs]);

  // Sinaliza no <html> para a landing esconder a pill flutuante (ver .cookie-open em globals.css).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("cookie-open", aberto);
    return () => root.classList.remove("cookie-open");
  }, [aberto]);

  const guardar = useCallback((novo: PrefsCookies) => {
    const antes = prefs;
    document.cookie = `${NOME}=${serializar(novo)}; path=/; max-age=${UM_ANO}; SameSite=Lax`;
    // Limpa o cookie antigo, que não distinguia categorias.
    document.cookie = "cookie_consent=; path=/; max-age=0; SameSite=Lax";
    try { localStorage.removeItem("cookie_consent"); } catch { /* modo privado */ }
    const revogou = (antes?.analytics && !novo.analytics) || (antes?.marketing && !novo.marketing);
    if (antes?.analytics && !novo.analytics) limparCookies(["_ga", "_gid", "_gat"]);
    if (antes?.marketing && !novo.marketing) limparCookies(["_fbp", "_fbc"]);
    setPrefs(novo);
    setAberto(false);
    setDetalhe(false);
    // Os scripts já carregados só param com um recarregamento.
    if (revogou) window.location.reload();
  }, [prefs]);

  const producao = process.env.NODE_ENV === "production";
  return (
    <>
      {producao && prefs?.analytics && <GoogleAnalytics gaId="G-F89FT4052G" />}
      {producao && prefs?.marketing && <MetaPixel />}

      {aberto && (
        <div role="dialog" aria-label={t("titulo")} className="fixed bottom-0 z-50 w-full border-t bg-background p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
          <div className="mx-auto flex max-w-5xl flex-col gap-4">
            <p className="max-w-[80ch] text-sm text-muted-foreground">
              {t("text")}{" "}
              <Link href="/cookies" className="font-medium text-foreground underline underline-offset-4">{t("politica")}</Link>
            </p>
            {detalhe && (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex items-start gap-2 rounded-lg border border-border/60 p-3 text-sm">
                  <input type="checkbox" checked disabled className="mt-0.5" />
                  <span><strong>{t("essenciais")}</strong><br /><span className="text-muted-foreground">{t("essenciaisDesc")}</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/60 p-3 text-sm">
                  <input type="checkbox" checked={rascunho.analytics} onChange={(e) => setRascunho({ ...rascunho, analytics: e.target.checked })} className="mt-0.5" />
                  <span><strong>{t("estatistica")}</strong><br /><span className="text-muted-foreground">{t("estatisticaDesc")}</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/60 p-3 text-sm">
                  <input type="checkbox" checked={rascunho.marketing} onChange={(e) => setRascunho({ ...rascunho, marketing: e.target.checked })} className="mt-0.5" />
                  <span><strong>{t("marketing")}</strong><br /><span className="text-muted-foreground">{t("marketingDesc")}</span></span>
                </label>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => guardar({ analytics: false, marketing: false })}>{t("decline")}</Button>
              {detalhe ? (
                <Button variant="outline" size="sm" onClick={() => guardar(rascunho)}>{t("guardarEscolha")}</Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setDetalhe(true)}>{t("personalizar")}</Button>
              )}
              <Button size="sm" onClick={() => guardar({ analytics: true, marketing: true })}>{t("accept")}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
