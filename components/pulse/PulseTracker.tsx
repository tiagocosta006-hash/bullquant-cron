"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/pulse/client";

/**
 * PulseTracker — montado uma vez no root layout (render null):
 *  - pageview automático em cada navegação (usePathname), com dedupe;
 *    o document.referrer só vai no primeiro pageview do page-load;
 *  - listener delegado de cliques em [data-track] → cta_click, para as
 *    páginas server (landing) não precisarem de client components.
 */
export function PulseTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === lastPath.current) return;
    const isFirst = lastPath.current === null;
    lastPath.current = pathname;
    track("pageview", undefined, {
      path: pathname,
      referrer: isFirst && document.referrer ? document.referrer : undefined,
    });
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-track]");
      const cta = el?.getAttribute("data-track");
      if (cta) track("cta_click", { cta });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
