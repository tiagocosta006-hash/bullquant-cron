import { BullMarkAnimated } from "@/components/brand/BullMarkAnimated";

/**
 * BootScreen — a cortina de entrada da landing.
 *
 * Referência: landonorris.com. A nossa versão anima o PRÓPRIO logo: a cabeça
 * do touro aparece, as três barras do gráfico sobem 1-2-3, e a seta desenha-se
 * por elas. Depois a cortina levanta.
 *
 * DECISÕES QUE IMPORTAM (não mexer sem ler):
 *
 * 1. É SERVER-RENDERED, não montado no cliente. Se fosse montado por JS haveria
 *    um flash da página ANTES de a cortina aparecer — pior que não a ter.
 *
 * 2. Auto-dispensa-se por CSS (`animation-fill-mode: forwards`), NÃO por JS. Se
 *    o script falhar, a cortina sobe na mesma. Uma cortina dependente de JS é
 *    uma forma de partir o site inteiro.
 *
 * 3. SÓ NA PRIMEIRA PÁGINA DE CADA SESSÃO (27/10/2026). Antes aparecia em
 *    todos os refreshes; numa landing de vendas eram ~1,2 s em branco antes
 *    do vídeo do produto, a cada visita. O script inline no <head> do layout
 *    raiz põe `html[data-booted]` a partir da 2.ª página e o CSS esconde-a.
 *
 * 4. Sem texto. O logo a construir-se já diz o que é preciso.
 */
export function BootScreen() {
  return (
    <div className="boot-screen" aria-hidden>
      <BullMarkAnimated className="boot-mark" />
    </div>
  );
}
