import { LEGAL } from "./config"
import type { Conteudo } from "./tipos"

const e = LEGAL.email

export const AVISO_LEGAL: Conteudo = {
  pt: {
    titulo: "Aviso Legal e Metodologia",
    descricao: "O que a plataforma é, de onde vêm os dados e como se calculam os valores.",
    blocos: [
      {
        h: "1. Natureza informativa",
        destaque:
          "A BullValue é uma ferramenta de análise e de educação financeira. Não presta serviços de investimento nem consultoria para investimento, e nada neste sítio é aconselhamento, recomendação personalizada ou convite a comprar, vender ou deter instrumentos financeiros. Investir envolve risco, incluindo a perda total do capital. A rendibilidade passada não garante rendibilidade futura.",
        p: ["Nenhum conteúdo tem em conta a situação financeira, os objetivos ou a tolerância ao risco de uma pessoa em concreto. As decisões de investimento são sempre da responsabilidade de quem as toma."],
      },
      {
        h: "2. Origem dos dados",
        ul: [
          "Demonstrações financeiras: documentos que as empresas entregam às autoridades (por exemplo, à SEC nos Estados Unidos) tratados por fornecedores de dados financeiros, com as correções que fazemos para uniformizar rubricas.",
          "Cotações: fornecedores de dados de mercado, que podem ter atraso; a data e hora do preço figuram junto dos valores que dele dependem.",
          "Estimativas de analistas: agregadas de terceiros. São opiniões de terceiros, não da BullValue.",
          "Taxas e indicadores macroeconómicos: fontes públicas (por exemplo, a taxa do Tesouro dos EUA a 10 anos).",
        ],
        p: ["Os dados podem conter erros, omissões ou atrasos. Confirme sempre na fonte original antes de decidir."],
      },
      {
        h: "3. Calculadoras e modelos",
        p: [
          "Os modelos (DCF simples, modelo avançado, modelo para financeiras) calculam o valor que resulta dos pressupostos usados. O resultado chama-se valor estimado do cenário e é a consequência matemática desses pressupostos; não é uma previsão, um preço-alvo nem uma recomendação.",
          "Os pressupostos pré-preenchidos vêm de dados históricos da própria empresa e, quando indicado, de estimativas de analistas de terceiros; não traduzem uma opinião da BullValue sobre o futuro da empresa. Pode e deve alterá-los. O resultado é muito sensível à taxa de desconto (WACC) e ao crescimento terminal: veja sempre a análise de sensibilidade e os cenários (Bear, Base, Bull).",
          "Os métodos principais: valor presente dos fluxos de caixa livres projetados e do valor terminal (crescimento perpétuo de Gordon e/ou múltiplo de saída); custo do capital próprio por CAPM; para bancos e seguradoras, retorno em excesso sobre o capital próprio.",
        ],
      },
      {
        h: "4. Frequência de atualização",
        p: ["Preços e indicadores dependentes do preço são atualizados ao longo do dia de negociação (com possível atraso); os fundamentais são atualizados diariamente após a publicação dos resultados; as estimativas de analistas, periodicamente. Cada página indica a data dos dados quando relevante."],
      },
      {
        h: "5. Inteligência artificial",
        p: ["Os textos do Analista IA, os resumos e as notícias são gerados ou apoiados por IA e estão identificados como tal. Podem conter erros. As notícias referem as fontes e podem ter revisão editorial, indicada na própria página."],
      },
      {
        h: "6. Interesses e independência",
        p: [
          "Os autores, os colaboradores e a BullValue podem deter, ou vir a deter, posições nos instrumentos financeiros mencionados e podem comprá-las ou vendê-las a qualquer momento. O conteúdo gerado automaticamente pela plataforma não resulta de análise individual de um analista.",
          "Conteúdos publicados noutros canais (vídeos, redes sociais, comunidades) trazem a sua própria divulgação de interesses, incluindo parcerias pagas e ligações de afiliado.",
        ],
      },
      { h: "7. Contacto", p: [`Correções, dúvidas ou denúncias de conteúdo: ${e}.`] },
    ],
  },
  en: {
    titulo: "Legal Notice and Methodology",
    descricao: "What the platform is, where the data comes from and how values are calculated.",
    blocos: [
      {
        h: "1. Informational nature",
        destaque:
          "BullValue is a financial analysis and education tool. It does not provide investment services or investment advice, and nothing on this site is advice, a personal recommendation or an invitation to buy, sell or hold financial instruments. Investing involves risk, including the total loss of capital. Past performance is not a reliable indicator of future results.",
        p: ["No content takes into account the financial situation, objectives or risk tolerance of any particular person. Investment decisions are always the responsibility of whoever takes them."],
      },
      {
        h: "2. Data sources",
        ul: [
          "Financial statements: documents companies file with authorities (for example, the SEC in the United States) processed by financial-data providers, with the corrections we make to standardise line items.",
          "Quotes: market-data providers, which may be delayed; the date and time of the price appear next to the values that depend on it.",
          "Analyst estimates: aggregated from third parties. They are third-party opinions, not BullValue's.",
          "Rates and macro indicators: public sources (for example, the 10-year US Treasury rate).",
        ],
        p: ["Data may contain errors, omissions or delays. Always check the original source before deciding."],
      },
      {
        h: "3. Calculators and models",
        p: [
          "The models (simple DCF, advanced model, financials model) compute the value that results from the assumptions used. The result is called the scenario's estimated value and is the mathematical consequence of those assumptions; it is not a forecast, a price target or a recommendation.",
          "Pre-filled assumptions come from the company's own historical data and, where indicated, from third-party analyst estimates; they do not reflect a BullValue opinion about the company's future. You can and should change them. The result is highly sensitive to the discount rate (WACC) and terminal growth: always look at the sensitivity analysis and the scenarios (Bear, Base, Bull).",
          "Main methods: present value of projected free cash flows and terminal value (Gordon perpetual growth and/or exit multiple); cost of equity by CAPM; for banks and insurers, residual income on equity.",
        ],
      },
      {
        h: "4. Update frequency",
        p: ["Prices and price-dependent indicators are updated during the trading day (possibly delayed); fundamentals are updated daily after results are published; analyst estimates periodically. Each page shows the data date where relevant."],
      },
      {
        h: "5. Artificial intelligence",
        p: ["AI Analyst texts, summaries and news are generated or assisted by AI and labelled as such. They may contain errors. News items cite their sources and may have editorial review, stated on the page itself."],
      },
      {
        h: "6. Interests and independence",
        p: [
          "The authors, collaborators and BullValue may hold, or come to hold, positions in the financial instruments mentioned and may buy or sell them at any time. Content generated automatically by the platform does not result from an individual analyst's analysis.",
          "Content published on other channels (videos, social media, communities) carries its own disclosure of interests, including paid partnerships and affiliate links.",
        ],
      },
      { h: "7. Contact", p: [`Corrections, questions or content reports: ${e}.`] },
    ],
  },
}
