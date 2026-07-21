"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

/**
 * Ponto único de registo do GSAP para a landing. ScrollTrigger é usado
 * SÓ para scrub (animação presa ao progresso do scroll) — nunca `pin:`,
 * porque o rubber-band do InertiaScroll aplica um transform ao wrapper
 * nos extremos da página e partiria `position: fixed`; secções "pinned"
 * são sempre CSS `position: sticky`.
 *
 * O scroll do InertiaScroll é nativo (escreve scrollTop), por isso o
 * ScrollTrigger lê a posição real sem scrollerProxy.
 */
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

/** matchMedia gate: animações só quando o utilizador aceita movimento. */
export const MOTION_OK = "(prefers-reduced-motion: no-preference)";

export { gsap, ScrollTrigger, useGSAP };
