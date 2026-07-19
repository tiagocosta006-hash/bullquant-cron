/**
 * HeroHorizon — a assinatura do primeiro frame: uma linha de preço
 * dourada hairline (abstrata, 10 anos up-and-to-the-right) desenha-se
 * atrás da tipografia do hero no load, a área enche a 7% e um live-dot
 * fica a pulsar na ponta. Server Component, zero JS: `pathLength={1}`
 * permite animar o traço em CSS puro (globals.css .hero-horizon-*).
 * A curva é decorativa — nunca lhe pôr ticker/números (não é um claim
 * de retorno).
 */
const D =
  "M0 230 L90 214 L170 222 L260 196 L340 204 L430 172 L520 180 L610 148 L700 158 L790 122 L880 132 L980 96 L1080 106 L1200 52";

export function HeroHorizon() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-24 top-[28%] -z-10 [mask-image:linear-gradient(to_top,transparent_4%,black_32%,black_84%,transparent)]"
    >
      <svg viewBox="0 0 1200 260" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <path d={`${D} L1200 260 L0 260 Z`} className="hero-horizon-fill" fill="var(--primary)" />
        <path
          d={D}
          pathLength={1}
          className="hero-horizon-line"
          fill="none"
          stroke="var(--primary)"
          strokeOpacity="0.55"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
