"use client";

import type { PulseEventType } from "@/lib/pulse/server";

/**
 * Pulse — util de tracking client-side. Nunca lança, nunca bloqueia:
 * usa sendBeacon (sobrevive à navegação) com fallback fetch keepalive.
 * Respeita Do Not Track / Global Privacy Control.
 */
export function track(
  type: PulseEventType,
  meta?: Record<string, string>,
  opts?: { path?: string; referrer?: string },
): void {
  try {
    if (typeof window === "undefined") return;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return;

    const body = JSON.stringify({
      type,
      path: opts?.path ?? window.location.pathname,
      referrer: opts?.referrer,
      meta,
    });

    if (navigator.sendBeacon?.("/api/track", new Blob([body], { type: "text/plain" }))) return;
    void fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    // analytics nunca pode partir a app
  }
}
