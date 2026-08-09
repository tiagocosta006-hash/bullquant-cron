/**
 * HeroHorizon — a assinatura do primeiro frame: uma silhueta de preço em ouro
 * muito ténue por trás da tipografia do hero, que aparece no load.
 * Server Component, zero JS (globals.css .hero-horizon-fill).
 *
 * A curva é DECORATIVA — nunca lhe pôr ticker nem números. Não é um claim
 * de retorno, é textura de marca.
 *
 * ── Porque já não há traço ────────────────────────────────────────────
 * Havia uma hairline dourada por cima da silhueta. Parecia cortada a meio, e
 * era: com `vector-effect: non-scaling-stroke` a 1px, nos troços a pique o
 * traço fica repartido pelo antialiasing por várias colunas de píxeis e o
 * contraste contra o preenchimento logo abaixo desaparece — nítido na parte
 * plana, invisível na subida. Engrossá-lo resolvia o corte mas empastava os
 * 640 dentes, que são a razão de a curva existir. Ficou só a silhueta, que
 * não tem traço nenhum para se partir.
 *
 * ── Porque é um passeio aleatório e não uma polyline à mão ─────────────
 * Tinha 14 pontos em zigzag regular, e lia-se como um gráfico de ícone: os
 * segmentos eram longos e todos com o mesmo comprimento, coisa que nenhuma
 * série de preços real faz. Agora são ~640 passos com:
 *   · deriva ascendente constante (o "up and to the right")
 *   · ruído por passo, para o dente-de-serra fino
 *   · volatilidade a variar em ondas lentas — as séries reais têm períodos
 *     agitados e períodos calmos, e é isso que dá o ar orgânico
 *   · alguns saltos maiores esparsos, como gaps de sessão
 *
 * Gerado com um LCG SEMEADO, no topo do módulo: é determinístico, corre uma
 * vez no servidor e serializa. `Math.random()` aqui daria um path diferente
 * no servidor e no cliente — erro de hidratação garantido.
 */

const W = 1200;
const H = 260;
const STEPS = 640;

/** LCG (Numerical Recipes). Semeado → mesma curva em todos os renders. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildPath(): string {
  const rnd = makeRng(20260807);
  const pts: string[] = [];

  /* Começa em baixo à esquerda e sobe até ao topo à direita.
     yStart não vai até ao fundo do viewBox: a máscara do contentor apaga a
     faixa de baixo, e com o troço plano encostado a 248 a primeira metade da
     série — justamente onde está o detalhe fino — desaparecia toda. */
  const yStart = 226;
  const yEnd = 8;
  let y = yStart;

  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const x = t * W;

    /* Deriva EXPONENCIAL, não linear. Com uma reta, a subida era constante e
       lia-se como uma rampa; um compounder real acelera. O expoente mantém a
       curva quase plana no primeiro terço e dispara no último — a forma de
       juros compostos. Subir o expoente = acabar mais a pique. */
    const drift = yStart + (yEnd - yStart) * Math.pow(t, 3.4);

    // volatilidade em ondas lentas: períodos agitados e períodos calmos
    const vol = 3.2 + 2.6 * Math.sin(t * Math.PI * 3.1) * Math.sin(t * Math.PI * 1.3);

    // ruído por passo + salto esparso (gap de sessão)
    const jump = rnd() > 0.985 ? (rnd() - 0.5) * 26 : 0;
    y += (rnd() - 0.5) * vol * 2 + jump;

    // puxar para a deriva, senão o passeio afasta-se e perde a tendência
    y += (drift - y) * 0.085;

    const clamped = Math.max(3, Math.min(H - 8, y));
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${clamped.toFixed(1)}`);
  }

  return pts.join(" ");
}

const D = buildPath();

export function HeroHorizon() {
  return (
    <div
      aria-hidden
      /* Máscara SÓ em baixo. O fade de topo (black 84% → transparent) apanhava
         precisamente o pico da curva e apagava-lho a meio da subida — daí
         parecer cortada no canto. Em cima não há nada para esconder: a curva
         nunca chega ao limite do contentor, por isso não existe aresta. */
      className="pointer-events-none absolute inset-x-0 bottom-24 top-[28%] -z-10 [mask-image:linear-gradient(to_top,transparent_0%,black_12%,black_100%)]"
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        {/* massa ténue por baixo da linha (7%), sem desfoque */}
        <path d={`${D} L${W} ${H} L0 ${H} Z`} className="hero-horizon-fill" fill="var(--primary)" />
        <path
          d={D}
          pathLength={1}
          className="hero-horizon-line"
          fill="none"
          stroke="var(--primary)"
          strokeOpacity="0.8"
          /* SEM `vector-effect: non-scaling-stroke`, que era a causa do corte:
             fixava o traço em 1px de ecrã, e num troço a pique esse 1px
             espalha-se por várias colunas de píxeis via antialiasing até o
             contraste contra o preenchimento desaparecer — nítido na parte
             plana, invisível na subida.
             A escalar, a largura acompanha a inclinação (o viewBox é esticado
             1.2× em x e ~1.5× em y por `preserveAspectRatio="none"`), por isso
             é nos troços verticais que fica MAIS grosso, que é exatamente onde
             antes desaparecia. */
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
