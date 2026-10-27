import { LEGAL } from "./config"
import { PLANOS, precoTexto } from "@/lib/planos"
import type { Conteudo } from "./tipos"

const e = LEGAL.email
const d = LEGAL.diasResolucao

export const TERMOS: Conteudo = {
  pt: {
    titulo: "Termos de Serviço",
    descricao: `Termos e condições de utilização da plataforma ${LEGAL.marca}.`,
    intro: [
      `Estes Termos regulam o acesso e a utilização da plataforma ${LEGAL.marca} ("plataforma", "serviço"). Ao criar conta, subscrever ou utilizar o serviço aceita-os. Leia também a Política de Privacidade, a Política de Cookies, o Aviso Legal e a Política de Reembolso e Livre Resolução, que fazem parte do contrato.`,
    ],
    blocos: [
      {
        h: "1. O que é a plataforma (e o que não é)",
        p: [
          "A plataforma é uma ferramenta de dados e análise: apresenta demonstrações financeiras e indicadores de empresas cotadas, calculadoras e modelos (como a calculadora DCF), notícias e textos gerados com apoio de inteligência artificial, calendários e listas.",
          "A plataforma não presta serviços de investimento nem consultoria para investimento, não gere carteiras, não recebe, executa ou transmite ordens e não faz recomendações personalizadas. Nada na plataforma tem em conta a sua situação financeira, os seus objetivos ou a sua tolerância ao risco.",
        ],
        destaque:
          "Os resultados dos modelos dependem dos pressupostos usados (incluindo os que define e os que vêm pré-preenchidos a partir de dados históricos e de estimativas de terceiros). São estimativas que podem estar erradas, não são previsões, preços-alvo nem recomendações. Investir envolve risco, incluindo a perda total do capital; a rendibilidade passada não garante rendibilidade futura. A decisão é sempre sua; se precisar de aconselhamento, recorra a um intermediário financeiro ou consultor autorizado pela CMVM.",
      },
      {
        h: "2. Conta e idade mínima",
        p: [
          "Para criar conta e subscrever tem de ter pelo menos 18 anos e fornecer dados verdadeiros. É responsável por manter a palavra-passe confidencial e por toda a atividade na sua conta. Avise-nos de imediato se suspeitar de uso indevido.",
        ],
      },
      {
        h: "3. Subscrição PRO, preço e pagamento",
        p: [
          `O acesso às funcionalidades da plataforma exige uma subscrição PRO paga. Não existe, nesta fase, plano gratuito. Há dois planos mensais, com impostos incluídos no preço: "BullValue PRO", a ${precoTexto(PLANOS.pro.preco)} € por mês, que dá acesso à plataforma; e "BullValue PRO + Comunidade", a ${precoTexto(PLANOS.comunidade.preco)} € por mês, que dá acesso à plataforma e à comunidade TCValue Group. O preço e as condições são apresentados antes de confirmar a compra.`,
          `A comunidade TCValue Group (canais no Discord, dossiers de empresas, notas de mercado e conteúdos relacionados) é disponibilizada através da Whop. Tem fins educativos: não constitui aconselhamento financeiro, recomendação personalizada nem serviço de investimento, e as decisões de investimento são sempre suas.`,
          `A subscrição é contratada e paga através da plataforma Whop, que processa o pagamento (e, conforme o caso, a faturação e a cobrança de impostos) e tem os seus próprios termos. Nós não vemos nem guardamos dados de cartão: recebemos da Whop apenas a confirmação de que a subscrição está ativa, a identificação da conta a partir da qual a compra foi feita e o e-mail associado, para atribuir o acesso PRO a essa conta.`,
        ],
        ul: [
          "Renovação automática: a subscrição renova-se todos os meses, pelo mesmo período e preço, até a cancelar.",
          "Cancelamento: pode cancelar a qualquer momento na sua conta Whop, sem penalização. O acesso mantém-se até ao fim do período já pago; depois, a conta deixa de ter acesso às funcionalidades PRO.",
          "Falha de pagamento: se a cobrança falhar, o acesso pode ser suspenso após as tentativas de cobrança da Whop, e é reposto assim que o pagamento for regularizado.",
          "Alterações de preço: comunicamo-las com antecedência razoável e só se aplicam ao período seguinte; pode cancelar antes de se aplicarem.",
        ],
      },
      {
        h: "4. Direito de livre resolução (14 dias)",
        p: [
          `Como consumidor, tem o direito de resolver o contrato no prazo de ${d} dias a contar da data em que o celebrou, sem indicar motivo. Se pediu expressamente que o serviço começasse durante esse prazo (o acesso é imediato), e resolver, paga apenas o valor proporcional ao serviço já prestado até ao momento em que nos comunicou a resolução. Como exercer o direito e o que acontece a seguir: ver a Política de Reembolso e Livre Resolução e a página "Retratação".`,
        ],
      },
      {
        h: "5. Qualidade do serviço e alterações",
        p: [
          "Prestamos o serviço com a diligência devida, mas não garantimos funcionamento ininterrupto nem ausência de erros. Podemos atualizar, melhorar, alterar ou retirar funcionalidades, e fazemo-lo quando necessário para segurança, evolução técnica, mudança de fornecedores de dados ou obrigações legais; quando a alteração afetar de modo significativo o que contratou, informamo-lo com antecedência razoável e pode resolver o contrato sem custos.",
          "Os direitos que a lei lhe reconhece como consumidor em caso de falta de conformidade do serviço digital (incluindo a reposição da conformidade, a redução do preço e a resolução do contrato) mantêm-se e não são afetados por estes Termos.",
        ],
      },
      {
        h: "6. Dados de terceiros",
        p: [
          "Os dados financeiros vêm de fontes públicas (como os documentos entregues pelas empresas à SEC) e de fornecedores de dados de mercado. Podem conter erros, omissões, ajustamentos ou atrasos, e as cotações podem não ser em tempo real. Confirme sempre na fonte antes de decidir.",
          "Nomes, logótipos e marcas de empresas pertencem aos respetivos titulares e são usados apenas para identificar os emitentes; não sugerem patrocínio nem parceria.",
        ],
      },
      {
        h: "7. Conteúdo gerado por inteligência artificial",
        p: [
          "Alguns textos (como o Analista IA, os resumos e as notícias) são gerados ou apoiados por inteligência artificial e estão identificados como tal. Podem conter erros, omissões ou interpretações incorretas e não são revistos individualmente, salvo indicação em contrário na própria página (por exemplo, notícias com revisão editorial). Não insira dados pessoais ou financeiros sensíveis nas mensagens do chat: são enviadas a um fornecedor de IA para gerar a resposta.",
        ],
      },
      {
        h: "8. Conteúdo que cria e partilha pública",
        p: [
          "As análises, notas e etiquetas que guarda são seus. Concede-nos uma licença limitada, não exclusiva e gratuita para os alojar e apresentar a si e, se ativar a partilha pública de uma análise, a quem tiver a ligação. Uma análise partilhada é da sua autoria e responsabilidade: não foi criada, revista nem subscrita por nós e não é recomendação de investimento. Não partilhe publicamente conteúdo ilegal, enganoso, que promova a compra ou venda de instrumentos financeiros ou que revele dados pessoais de terceiros. Pode desativar a partilha a qualquer momento e qualquer pessoa pode denunciar conteúdo em " + e + ".",
        ],
      },
      {
        h: "9. Utilização aceitável",
        p: ["É proibido:"],
        ul: [
          "contornar limites, autenticação ou controlos de acesso, ou partilhar a conta com terceiros;",
          "extrair dados de forma automatizada (scraping, bots, crawlers) ou redistribuir, revender ou publicar em massa os dados e relatórios da plataforma;",
          "fazer engenharia reversa do serviço ou comprometer a sua segurança ou desempenho;",
          "usar a plataforma para atividades ilícitas ou para induzir terceiros em erro, designadamente apresentando resultados da plataforma como recomendações personalizadas ou como aconselhamento.",
        ],
      },
      {
        h: "10. Propriedade intelectual",
        p: [
          "O software, o desenho, a marca e a organização da plataforma pertencem-nos ou são usados sob licença. Concedemos-lhe uma licença pessoal, limitada, revogável e não transmissível para usar a plataforma enquanto a subscrição estiver ativa. Os dados e conteúdos de terceiros mantêm os direitos dos respetivos titulares; os textos gerados por IA não conferem direitos exclusivos a ninguém.",
        ],
      },
      {
        h: "11. Responsabilidade",
        p: [
          "Na medida permitida pela lei, não respondemos por perdas ou danos decorrentes de decisões de investimento tomadas com base na plataforma, nem por falhas de serviços de terceiros fora do nosso controlo. Esta limitação não exclui nem limita a responsabilidade por dolo ou culpa grave, por danos à vida, integridade física ou saúde, nem os direitos que a lei lhe reconhece como consumidor.",
        ],
      },
      {
        h: "12. Suspensão e cessação",
        p: [
          "Podemos suspender ou encerrar o acesso em caso de violação grave destes Termos, de fraude ou de uso que ponha em risco a plataforma ou terceiros, informando o motivo sempre que possível. Pode encerrar a conta a qualquer momento nas Definições; a eliminação da conta não cancela por si a subscrição na Whop, que tem de cancelar separadamente.",
        ],
      },
      {
        h: "13. Alterações aos Termos",
        p: [
          "Podemos alterar estes Termos. As alterações relevantes são comunicadas por e-mail ou na plataforma com antecedência razoável e aplicam-se ao período de subscrição seguinte; se não concordar, pode cancelar. A versão em vigor e a data estão no topo desta página.",
        ],
      },
      {
        h: "14. Lei aplicável, reclamações e litígios",
        p: [
          "Estes Termos regem-se pela lei portuguesa, sem prejuízo das normas imperativas de proteção do consumidor do país da sua residência habitual. Pode apresentar reclamações através do Livro de Reclamações Eletrónico (livroreclamacoes.pt) e dos contactos abaixo. Como consumidor, pode também recorrer às entidades de resolução alternativa de litígios de consumo (lista no Portal do Consumidor, consumidor.gov.pt) e aos tribunais competentes.",
        ],
      },
      {
        h: "15. Contactos",
        p: [`Dúvidas, reclamações, pedidos de retratação ou denúncias de conteúdo: ${e}.`],
      },
    ],
  },
  en: {
    titulo: "Terms of Service",
    descricao: `Terms and conditions for using the ${LEGAL.marca} platform.`,
    intro: [
      `These Terms govern access to and use of the ${LEGAL.marca} platform (the "platform", the "service"). By creating an account, subscribing or using the service you accept them. Please also read the Privacy Policy, the Cookie Policy, the Legal Notice and the Refund and Withdrawal Policy, which form part of the contract.`,
    ],
    blocos: [
      {
        h: "1. What the platform is (and is not)",
        p: [
          "The platform is a data and analysis tool: it presents financial statements and indicators of listed companies, calculators and models (such as the DCF calculator), news and AI-assisted texts, calendars and lists.",
          "The platform does not provide investment services or investment advice, does not manage portfolios, does not receive, execute or transmit orders and does not make personal recommendations. Nothing on the platform takes into account your financial situation, objectives or risk tolerance.",
        ],
        destaque:
          "Model outputs depend on the assumptions used (including those you set and those pre-filled from historical data and third-party estimates). They are estimates that may be wrong; they are not forecasts, price targets or recommendations. Investing involves risk, including the total loss of capital; past performance is not a reliable indicator of future results. The decision is always yours; if you need advice, consult an authorised financial intermediary or adviser.",
      },
      {
        h: "2. Account and minimum age",
        p: [
          "To create an account and subscribe you must be at least 18 and provide truthful information. You are responsible for keeping your password confidential and for all activity on your account. Tell us immediately if you suspect misuse.",
        ],
      },
      {
        h: "3. PRO subscription, price and payment",
        p: [
          `Access to the platform's features requires a paid PRO subscription. There is no free plan at this stage. There are two monthly plans, with taxes included in the price: "BullValue PRO", at €${precoTexto(PLANOS.pro.preco, "en")} per month, which gives access to the platform; and "BullValue PRO + Community", at €${precoTexto(PLANOS.comunidade.preco, "en")} per month, which gives access to the platform and to the TCValue Group community. The price and conditions are shown before you confirm the purchase.`,
          "The TCValue Group community (Discord channels, company dossiers, market notes and related content) is provided through Whop. It is educational: it is not financial advice, a personal recommendation or an investment service, and investment decisions are always yours.",
          "The subscription is purchased and paid through the Whop platform, which processes the payment (and, as applicable, invoicing and tax collection) and has its own terms. We do not see or store card details: we only receive from Whop confirmation that the subscription is active, the identification of the account from which the purchase was made and the associated e-mail, in order to grant PRO access to that account.",
        ],
        ul: [
          "Automatic renewal: the subscription renews every month, for the same period and price, until you cancel.",
          "Cancellation: you can cancel at any time in your Whop account, without penalty. Access continues until the end of the period already paid; afterwards the account no longer has PRO access.",
          "Failed payment: if a charge fails, access may be suspended after Whop's retry attempts, and is restored as soon as payment is settled.",
          "Price changes: we give reasonable advance notice and they only apply to the next period; you may cancel before they apply.",
        ],
      },
      {
        h: "4. Right of withdrawal (14 days)",
        p: [
          `As a consumer you may withdraw from the contract within ${d} days of concluding it, without giving a reason. If you expressly asked for the service to start during that period (access is immediate) and then withdraw, you only pay a proportionate amount for the service already provided until you told us of your withdrawal. How to exercise the right and what happens next: see the Refund and Withdrawal Policy and the "Withdrawal" page.`,
        ],
      },
      {
        h: "5. Service quality and changes",
        p: [
          "We provide the service with due care but do not guarantee uninterrupted operation or the absence of errors. We may update, improve, change or withdraw features where necessary for security, technical evolution, changes of data providers or legal obligations; where a change significantly affects what you bought, we will inform you in advance and you may terminate the contract at no cost.",
          "The rights the law gives you as a consumer in case of lack of conformity of a digital service (including restoring conformity, price reduction and termination) are unaffected by these Terms.",
        ],
      },
      {
        h: "6. Third-party data",
        p: [
          "Financial data comes from public sources (such as documents companies file with the SEC) and from market-data providers. It may contain errors, omissions, adjustments or delays, and quotes may not be real-time. Always check the source before deciding.",
          "Company names, logos and trademarks belong to their owners and are used only to identify issuers; they do not imply sponsorship or partnership.",
        ],
      },
      {
        h: "7. AI-generated content",
        p: [
          "Some texts (such as the AI Analyst, summaries and news) are generated or assisted by artificial intelligence and are labelled as such. They may contain errors, omissions or incorrect interpretations and are not individually reviewed unless the page says otherwise (for example, news with editorial review). Do not enter personal or sensitive financial data in chat messages: they are sent to an AI provider to produce the answer.",
        ],
      },
      {
        h: "8. Content you create and public sharing",
        p: [
          `The analyses, notes and labels you save are yours. You grant us a limited, non-exclusive, free licence to host and display them to you and, if you enable public sharing of an analysis, to anyone with the link. A shared analysis is authored by and the responsibility of the user: it was not created, reviewed or endorsed by us and is not investment advice. Do not publicly share content that is unlawful, misleading, promotes buying or selling financial instruments or discloses third parties' personal data. You can disable sharing at any time and anyone can report content at ${e}.`,
        ],
      },
      {
        h: "9. Acceptable use",
        p: ["It is forbidden to:"],
        ul: [
          "circumvent limits, authentication or access controls, or share the account with third parties;",
          "extract data in an automated way (scraping, bots, crawlers) or redistribute, resell or mass-publish the platform's data and reports;",
          "reverse-engineer the service or compromise its security or performance;",
          "use the platform for unlawful purposes or to mislead others, in particular by presenting platform outputs as personal recommendations or advice.",
        ],
      },
      {
        h: "10. Intellectual property",
        p: [
          "The software, design, brand and organisation of the platform belong to us or are used under licence. We grant you a personal, limited, revocable, non-transferable licence to use the platform while your subscription is active. Third-party data and content remain the property of their owners; AI-generated texts do not confer exclusive rights on anyone.",
        ],
      },
      {
        h: "11. Liability",
        p: [
          "To the extent permitted by law, we are not liable for losses or damage arising from investment decisions made on the basis of the platform, or for failures of third-party services outside our control. This limitation does not exclude or limit liability for wilful misconduct or gross negligence, for damage to life, physical integrity or health, or the rights the law gives you as a consumer.",
        ],
      },
      {
        h: "12. Suspension and termination",
        p: [
          "We may suspend or end access in case of serious breach of these Terms, fraud or use that endangers the platform or third parties, stating the reason where possible. You may close your account at any time in Settings; deleting the account does not by itself cancel the Whop subscription, which you must cancel separately.",
        ],
      },
      {
        h: "13. Changes to the Terms",
        p: [
          "We may change these Terms. Material changes are communicated by e-mail or on the platform with reasonable notice and apply to the next subscription period; if you disagree, you can cancel. The version in force and its date are at the top of this page.",
        ],
      },
      {
        h: "14. Governing law, complaints and disputes",
        p: [
          "These Terms are governed by Portuguese law, without prejudice to the mandatory consumer-protection rules of the country of your habitual residence. You may complain through the Electronic Complaints Book (livroreclamacoes.pt) and the contacts below. As a consumer you may also use alternative dispute resolution bodies for consumer disputes (list on the Consumer Portal, consumidor.gov.pt) and the competent courts.",
        ],
      },
      { h: "15. Contact", p: [`Questions, complaints, withdrawal requests or content reports: ${e}.`] },
    ],
  },
}
