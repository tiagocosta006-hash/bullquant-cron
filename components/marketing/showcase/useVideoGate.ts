"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

const noop = () => () => {};

/** matchMedia como estado React; `server` é o valor no SSR e na hidratação. */
export function useMediaQuery<S extends boolean | null = boolean>(query: string, server: S = false as S): boolean | S {
  return useSyncExternalStore<boolean | S>(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => server,
  );
}

function readSaveData() {
  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  return Boolean(conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? ""));
}

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

/**
 * Condições para um vídeo da landing poder tocar sozinho: sem reduced motion,
 * sem Save-Data/2G, visível (IO com `threshold`), separador à vista e só
 * depois do `load` da página + idle (o vídeo nunca compete com o primeiro
 * render nem com o LCP).
 */
export function useVideoGate(ref: RefObject<HTMLElement | null>, { threshold = 0.5 } = {}) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const saveData = useSyncExternalStore(noop, readSaveData, () => false);
  const hidden = useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
  const [inView, setInView] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const afterLoad = () => {
      if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      else timeoutId = setTimeout(() => setReady(true), 1200);
    };
    if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });

    return () => {
      window.removeEventListener("load", afterLoad);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.intersectionRatio >= threshold), {
      threshold: [0, threshold],
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);

  return { reduced, saveData, inView, hidden, ready };
}
