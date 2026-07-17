"use client";

import { useEffect, useState } from "react";
import { GoogleAnalytics } from "@next/third-parties/google";

export function DelayedAnalytics() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    // Atrasar a injeção do Google Analytics em 4 segundos
    // Evita que a main thread seja bloqueada durante o LCP e FCP
    const timer = setTimeout(() => {
      if ("requestIdleCallback" in window) {
        requestIdleCallback(() => setShouldRender(true));
      } else {
        setShouldRender(true);
      }
    }, 4000);

    return () => clearTimeout(timer);
  }, []);

  if (!shouldRender) return null;

  return <GoogleAnalytics gaId="G-F89FT4052G" />;
}
