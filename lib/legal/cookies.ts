import { LEGAL } from "./config"
import type { Conteudo } from "./tipos"

const e = LEGAL.email

export const COOKIES: Conteudo = {
  pt: {
    titulo: "Política de Cookies",
    descricao: "Que cookies usamos, para quê e como alterar a sua escolha.",
    intro: ["Cookies são pequenos ficheiros guardados no seu dispositivo. Só usamos cookies não essenciais com o seu consentimento prévio, que pode dar por categoria e retirar quando quiser."],
    blocos: [
      {
        h: "1. Categorias",
        tabela: {
          cabecalho: ["Categoria", "Para quê", "Exemplos", "Consentimento"],
          linhas: [
            ["Essenciais", "Manter a sessão iniciada, a língua escolhida e a sua escolha de cookies", "Cookies de sessão da autenticação; cookie_consent / cookie_prefs", "Não necessário (indispensáveis ao serviço)"],
            ["Estatística", "Perceber como o sítio é usado, de forma agregada, para o melhorar", "Google Analytics (_ga, _ga_*)", "Necessário; desligado por omissão"],
            ["Marketing", "Medir campanhas e apresentar anúncios relevantes noutras plataformas", "Meta Pixel (_fbp, _fbc)", "Necessário; desligado por omissão"],
          ],
        },
      },
      {
        h: "2. Estatística sem cookies (Pulse)",
        p: ["Medimos visitas com um sistema próprio que não usa cookies nem guarda o seu IP: deriva um identificador de sessão que muda todos os dias e respeita os sinais Do Not Track e Global Privacy Control. Mais detalhe na Política de Privacidade."],
      },
      {
        h: "3. Como alterar a escolha",
        p: ["Pode aceitar todas, recusar as não essenciais ou escolher por categoria no aviso que aparece na primeira visita. Para mudar de ideias depois, use a ligação 'Definições de cookies' no rodapé. Recusar não limita o acesso ao serviço. A escolha é guardada por 12 meses e voltamos a perguntar passado esse prazo ou se as finalidades mudarem."],
      },
      {
        h: "4. Dúvidas",
        p: [`Escreva-nos para ${e}.`],
      },
    ],
  },
  en: {
    titulo: "Cookie Policy",
    descricao: "Which cookies we use, what for and how to change your choice.",
    intro: ["Cookies are small files stored on your device. We only use non-essential cookies with your prior consent, which you can give per category and withdraw whenever you like."],
    blocos: [
      {
        h: "1. Categories",
        tabela: {
          cabecalho: ["Category", "Purpose", "Examples", "Consent"],
          linhas: [
            ["Essential", "Keep you signed in, remember your language and your cookie choice", "Authentication session cookies; cookie_consent / cookie_prefs", "Not required (necessary for the service)"],
            ["Analytics", "Understand how the site is used, in aggregate, to improve it", "Google Analytics (_ga, _ga_*)", "Required; off by default"],
            ["Marketing", "Measure campaigns and show relevant ads on other platforms", "Meta Pixel (_fbp, _fbc)", "Required; off by default"],
          ],
        },
      },
      {
        h: "2. Cookie-less statistics (Pulse)",
        p: ["We measure visits with our own system that uses no cookies and does not store your IP: it derives a session identifier that changes every day and honours Do Not Track and Global Privacy Control signals. More detail in the Privacy Policy."],
      },
      {
        h: "3. How to change your choice",
        p: ["You can accept all, refuse non-essential ones or choose per category in the notice shown on your first visit. To change your mind later, use the 'Cookie settings' link in the footer. Refusing does not limit access to the service. Your choice is kept for 12 months and we ask again after that or if the purposes change."],
      },
      { h: "4. Questions", p: [`Write to us at ${e}.`] },
    ],
  },
}
