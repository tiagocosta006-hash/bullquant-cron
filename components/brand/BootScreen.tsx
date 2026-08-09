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
 * 3. APARECE EM TODOS OS REFRESHES (decisão do Alex). Por isso a coreografia é
 *    curta — ~1,15s do início ao fim — para não custar retenção. Se um dia
 *    quiseres voltar a limitá-la à primeira visita da sessão, o gancho já
 *    existe: o `html[data-booted]` em globals.css continua a funcionar, basta
 *    repor o script inline no <head> do layout raiz.
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
