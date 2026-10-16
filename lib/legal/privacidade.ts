import { LEGAL } from "./config"
import type { Conteudo } from "./tipos"

const e = LEGAL.email

export const PRIVACIDADE: Conteudo = {
  pt: {
    titulo: "Política de Privacidade",
    descricao: `Como a ${LEGAL.marca} trata os seus dados pessoais.`,
    intro: [
      "Explicamos que dados pessoais tratamos, porquê, durante quanto tempo, com quem os partilhamos e que direitos tem, nos termos do Regulamento Geral sobre a Proteção de Dados (RGPD), da Lei n.º 58/2019 e da Lei n.º 41/2004.",
    ],
    blocos: [
      {
        h: "1. Responsável pelo tratamento",
        p: [`O responsável pelo tratamento é a entidade identificada no topo desta página (a mesma dos Termos de Serviço). Contacto para questões de privacidade e exercício de direitos: ${e}.`],
      },
      {
        h: "2. Que dados tratamos, para quê e com que base legal",
        tabela: {
          cabecalho: ["Finalidade", "Dados", "Base legal", "Conservação"],
          linhas: [
            ["Criar e gerir a conta, autenticação, apoio", "Nome, e-mail, palavra-passe (cifrada), data de registo, plano", "Execução do contrato (art. 6.º/1/b RGPD)", "Enquanto a conta existir; depois, o necessário para defender direitos (até 5 anos)"],
            ["Fornecer as funcionalidades (portfólio, watchlist, análises DCF guardadas, definições)", "Os dados que introduz: posições, tickers, notas, pressupostos", "Execução do contrato", "Até apagar ou encerrar a conta"],
            ["Ligação opcional ao corretor (Trading212)", "Chave de API de leitura (guardada cifrada) e posições lidas", "Consentimento (art. 6.º/1/a), que pode retirar", "Até desligar a ligação ou encerrar a conta"],
            ["Acesso PRO", "E-mail, estado da subscrição e identificadores enviados pela Whop (não recebemos dados de cartão)", "Execução do contrato; obrigação legal (faturação, a cargo de quem fatura)", "Enquanto a subscrição existir; depois, prazos fiscais"],
            ["Analista IA e textos gerados por IA", "Mensagens do chat, empresa consultada e contexto financeiro enviados ao fornecedor de IA", "Execução do contrato", "Apagados com a conta; o fornecedor de IA trata-os segundo os seus termos"],
            ["Segurança e prevenção de abuso (limites de pedidos)", "Endereço IP, tipo de pedido", "Interesse legítimo (art. 6.º/1/f): proteger o serviço", "Janelas de minutos; não guardamos IP em registo permanente"],
            ["Estatísticas de utilização próprias (Pulse)", "País (aproximado), página, origem da visita, identificador de sessão derivado e renovado diariamente. O IP é usado só para derivar esse identificador e não é guardado. Respeitamos os sinais Do Not Track e Global Privacy Control", "Interesse legítimo: perceber e melhorar o serviço", "180 dias"],
            ["Estatística do sítio (Google Analytics)", "Identificadores e dados de navegação agregados", "Consentimento (cookies), que pode retirar a qualquer momento", "Conforme a configuração da Google (por omissão, até 14 meses)"],
            ["Marketing e remarketing (Meta Pixel)", "Identificadores de navegação e eventos", "Consentimento (cookies), que pode retirar a qualquer momento", "Conforme a Meta"],
            ["E-mails de serviço (confirmação, palavra-passe, avisos de conta)", "E-mail e nome", "Execução do contrato", "O necessário para o envio"],
          ],
        },
        p: ["Não tomamos decisões exclusivamente automatizadas com efeitos jurídicos sobre si, e não vendemos os seus dados."],
      },
      {
        h: "3. Quem recebe os dados (subcontratantes)",
        p: ["Recorremos a prestadores que tratam dados em nosso nome, com contrato (DPA) e garantias adequadas:"],
        ul: [
          "Supabase — autenticação e base de dados.",
          "Vercel — alojamento da aplicação e rede de entrega; Fly.io e Render — execução de tarefas e serviços de apoio.",
          "Whop — subscrição, pagamento e (conforme o caso) faturação; atua com os seus próprios termos e política de privacidade.",
          "Google — Gemini (geração de texto por IA; as suas mensagens de chat e o contexto da empresa são-lhe enviados) e Google Analytics (se consentir).",
          "Meta — Meta Pixel (se consentir).",
          "Resend — envio de e-mails de serviço.",
          "Upstash — limitação de pedidos (endereço IP, de forma transitória).",
          "Fornecedores de dados financeiros e de notícias — recebem pedidos técnicos; não lhes enviamos dados pessoais.",
        ],
      },
      {
        h: "4. Inteligência artificial",
        p: ["As mensagens que escreve no chat e a empresa que consulta são enviadas ao Google (Gemini) para gerar a resposta. Podem conter dados pessoais se os escrever: por isso, não introduza dados pessoais nem financeiros sensíveis. O Google trata estes dados nos termos aplicáveis à API Gemini; consulte os termos do fornecedor para detalhe."],
      },
      {
        h: "5. Transferências para fora do EEE",
        p: ["Alguns prestadores estão nos Estados Unidos. Essas transferências assentam na decisão de adequação do Data Privacy Framework UE–EUA (para os prestadores certificados) e, quando necessário, em cláusulas contratuais-tipo da Comissão Europeia, com medidas adicionais quando aplicável. Pode pedir-nos informação sobre as garantias em " + e + "."],
      },
      {
        h: "6. Cookies",
        p: ["Usamos cookies essenciais e, só com o seu consentimento, cookies de estatística e de marketing. Detalhes e forma de alterar a escolha na Política de Cookies."],
      },
      {
        h: "7. Os seus direitos",
        ul: [
          "Acesso, retificação e apagamento (pode corrigir e apagar a conta em Definições; pode também exportar os seus dados).",
          "Portabilidade: exportação dos seus dados em formato estruturado, em Definições.",
          "Limitação do tratamento e oposição (em especial ao tratamento baseado em interesse legítimo).",
          "Retirar o consentimento a qualquer momento, sem afetar o tratamento anterior.",
          "Reclamar junto da autoridade de controlo: Comissão Nacional de Proteção de Dados (CNPD), www.cnpd.pt.",
        ],
        p: [`Respondemos em até um mês. Para exercer direitos: ${e}. Podemos pedir prova de identidade.`],
      },
      {
        h: "8. Segurança",
        p: ["Usamos ligações cifradas (TLS), palavras-passe com hash, chaves de integração cifradas, controlo de acessos e limitação de pedidos. Nenhum sistema é infalível; em caso de violação de dados pessoais com risco para si, notificamos a CNPD e, quando a lei o exige, também a si."],
      },
      {
        h: "9. Menores",
        p: ["A plataforma destina-se a maiores de 18 anos. Se tomarmos conhecimento de que uma conta pertence a um menor, encerramo-la e apagamos os dados."],
      },
      {
        h: "10. Alterações",
        p: ["Atualizamos esta política quando o tratamento mudar. A versão em vigor e a data estão no topo; alterações relevantes são comunicadas por e-mail ou na plataforma."],
      },
    ],
  },
  en: {
    titulo: "Privacy Policy",
    descricao: `How ${LEGAL.marca} processes your personal data.`,
    intro: [
      "We explain what personal data we process, why, for how long, with whom we share it and what rights you have, under the General Data Protection Regulation (GDPR), Portuguese Law 58/2019 and Law 41/2004.",
    ],
    blocos: [
      {
        h: "1. Controller",
        p: [`The controller is the entity identified at the top of this page (the same as in the Terms of Service). Contact for privacy matters and to exercise rights: ${e}.`],
      },
      {
        h: "2. What data we process, why and on what legal basis",
        tabela: {
          cabecalho: ["Purpose", "Data", "Legal basis", "Retention"],
          linhas: [
            ["Create and manage the account, authentication, support", "Name, e-mail, password (hashed), sign-up date, plan", "Performance of contract (Art. 6(1)(b) GDPR)", "While the account exists; afterwards what is needed to defend legal claims (up to 5 years)"],
            ["Provide features (portfolio, watchlist, saved DCF analyses, settings)", "Data you enter: positions, tickers, notes, assumptions", "Performance of contract", "Until you delete or close the account"],
            ["Optional broker connection (Trading212)", "Read-only API key (stored encrypted) and positions read", "Consent (Art. 6(1)(a)), which you can withdraw", "Until you disconnect or close the account"],
            ["PRO access", "E-mail, subscription status and identifiers sent by Whop (we receive no card data)", "Performance of contract; legal obligation (invoicing, by whoever invoices)", "While the subscription exists; then tax retention periods"],
            ["AI Analyst and AI-generated texts", "Chat messages, company consulted and financial context sent to the AI provider", "Performance of contract", "Deleted with the account; the AI provider processes them under its own terms"],
            ["Security and abuse prevention (rate limiting)", "IP address, request type", "Legitimate interest (Art. 6(1)(f)): protecting the service", "Windows of minutes; we do not keep IPs in a permanent log"],
            ["Own usage statistics (Pulse)", "Approximate country, page, referrer, a derived session identifier renewed daily. The IP is used only to derive that identifier and is not stored. We honour Do Not Track and Global Privacy Control", "Legitimate interest: understanding and improving the service", "180 days"],
            ["Site statistics (Google Analytics)", "Identifiers and aggregated browsing data", "Consent (cookies), which you can withdraw at any time", "As per Google's configuration (by default up to 14 months)"],
            ["Marketing and remarketing (Meta Pixel)", "Browsing identifiers and events", "Consent (cookies), which you can withdraw at any time", "As per Meta"],
            ["Service e-mails (confirmation, password, account notices)", "E-mail and name", "Performance of contract", "As needed to send"],
          ],
        },
        p: ["We do not take decisions based solely on automated processing with legal effects on you, and we do not sell your data."],
      },
      {
        h: "3. Who receives the data (processors)",
        p: ["We use providers that process data on our behalf, under contract (DPA) and with adequate safeguards:"],
        ul: [
          "Supabase — authentication and database.",
          "Vercel — application hosting and delivery network; Fly.io and Render — task execution and supporting services.",
          "Whop — subscription, payment and (as applicable) invoicing; it acts under its own terms and privacy policy.",
          "Google — Gemini (AI text generation; your chat messages and company context are sent to it) and Google Analytics (if you consent).",
          "Meta — Meta Pixel (if you consent).",
          "Resend — service e-mails.",
          "Upstash — request rate limiting (IP address, transiently).",
          "Financial data and news providers — receive technical requests; we send them no personal data.",
        ],
      },
      {
        h: "4. Artificial intelligence",
        p: ["Messages you write in the chat and the company you consult are sent to Google (Gemini) to produce the answer. They may contain personal data if you type it: do not enter personal or sensitive financial data. Google processes this data under the terms applicable to the Gemini API; see the provider's terms for details."],
      },
      {
        h: "5. Transfers outside the EEA",
        p: [`Some providers are in the United States. These transfers rely on the EU–US Data Privacy Framework adequacy decision (for certified providers) and, where needed, on the European Commission's standard contractual clauses, with supplementary measures where applicable. You can ask us about the safeguards at ${e}.`],
      },
      {
        h: "6. Cookies",
        p: ["We use essential cookies and, only with your consent, analytics and marketing cookies. Details and how to change your choice are in the Cookie Policy."],
      },
      {
        h: "7. Your rights",
        ul: [
          "Access, rectification and erasure (you can correct and delete your account in Settings; you can also export your data).",
          "Portability: export your data in a structured format in Settings.",
          "Restriction of processing and objection (in particular to processing based on legitimate interest).",
          "Withdraw consent at any time, without affecting earlier processing.",
          "Lodge a complaint with the supervisory authority: Comissão Nacional de Proteção de Dados (CNPD), www.cnpd.pt.",
        ],
        p: [`We reply within one month. To exercise rights: ${e}. We may ask for proof of identity.`],
      },
      {
        h: "8. Security",
        p: ["We use encrypted connections (TLS), hashed passwords, encrypted integration keys, access control and rate limiting. No system is infallible; in case of a personal data breach that puts you at risk we notify the CNPD and, where required by law, you."],
      },
      { h: "9. Minors", p: ["The platform is for people aged 18 or over. If we learn that an account belongs to a minor we close it and delete the data."] },
      { h: "10. Changes", p: ["We update this policy when processing changes. The version in force and its date are at the top; material changes are communicated by e-mail or on the platform."] },
    ],
  },
}
