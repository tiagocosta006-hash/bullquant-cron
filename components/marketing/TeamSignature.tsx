import Image from "next/image";

/**
 * TeamSignature — as caras da equipa em pequeno, no canto inferior direito
 * do hero, à mesma altura dos botões.
 *
 * Existe para responder a uma pergunta que o hero não respondia: *quem* está
 * por trás disto. Numa plataforma financeira feita por três estudantes, isso
 * não é vaidade — é a única prova social honesta que temos. Não temos números
 * de utilizadores para exibir, temos caras.
 *
 * ⚠️ NÃO copiar o "Usado por quem investe" do pludata. Aquilo é um claim sobre
 * UTILIZADORES; o nosso é sobre AUTORES. Com zero utilizadores no MVP, a frase
 * deles aplicada a nós seria falsa — e a landing já foi limpa de claims falsos
 * uma vez.
 *
 * O payoff está mais abaixo na página: as mesmas três caras, em retrato 4:5
 * grande, na secção da equipa. Pequeno em cima, grande em baixo.
 *
 * Escolhido entre 6 posições/formas alternativas (andaime `[data-v-teamhero]`,
 * entretanto apagado). Server Component, zero JS.
 */

export type TeamFace = { name: string; image?: string; initials: string };

/** 34px: +13% sobre os 30px iniciais, a pedido — grande o suficiente para se
 *  reconhecer uma cara, pequeno o suficiente para não competir com o CTA. */
const AVATAR = 34;

export function TeamSignature({
  faces,
  label,
  className,
}: {
  faces: TeamFace[];
  /** frase curta ao lado das caras (i18n: marketing.signature) */
  label: string;
  className?: string;
}) {
  return (
    <span className={className}>
      {/* A sobreposição negativa é o que faz três círculos lerem-se como UM
          objeto ("um grupo") em vez de três ícones soltos. */}
      <span className="flex shrink-0 items-center">
        {faces.map((f, i) => (
          <span
            key={f.name}
            className="relative rounded-full ring-2 ring-background"
            style={{ marginLeft: i === 0 ? 0 : -11, zIndex: faces.length - i }}
          >
            <span
              className="relative flex items-center justify-center overflow-hidden rounded-full bg-secondary"
              style={{ width: AVATAR, height: AVATAR }}
            >
              {f.image ? (
                <Image
                  src={f.image}
                  alt={f.name}
                  fill
                  sizes={`${AVATAR}px`}
                  /* 28% e não `center` nem `top`: são retratos de corpo até à
                     cintura com muito espaço vazio por cima da cabeça. Ao
                     centro o círculo apanhava o peito; no topo apanhava o
                     fundo cinzento. A cara vive por volta de um quarto abaixo
                     do topo do enquadramento. */
                  className="object-cover object-[50%_28%]"
                />
              ) : (
                <span className="text-[10px] font-semibold text-muted-foreground">{f.initials}</span>
              )}
            </span>
          </span>
        ))}
      </span>
      <span className="text-sm font-medium text-foreground/90">{label}</span>
    </span>
  );
}
