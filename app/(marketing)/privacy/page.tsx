import React from "react";

export const metadata = {
  title: "Política de Privacidade | Bullmetrics",
  description: "Como a Bullmetrics trata e protege os seus dados pessoais.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl text-gray-900 dark:text-gray-100">
      <h1 className="text-4xl font-extrabold tracking-tight mb-8">Política de Privacidade</h1>
      
      <div className="space-y-8 leading-relaxed">
        <section>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Última atualização: {new Date().toLocaleDateString("pt-PT")}
          </p>
          <p>
            A <strong>Bullmetrics</strong> assume o compromisso de garantir a privacidade e segurança dos seus dados pessoais.
            A presente Política de Privacidade estabelece as práticas da plataforma relativamente à recolha, uso, processamento
            e proteção de informações, em estrita conformidade com o Regulamento Geral sobre a Proteção de Dados (RGPD)
            europeu e a legislação nacional aplicável em Portugal.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">1. Identidade e Responsável pelo Tratamento</h2>
          <p>
            A Bullmetrics é a entidade responsável pelo tratamento dos seus dados pessoais no âmbito da prestação dos
            serviços descritos nos nossos Termos de Serviço. Em caso de dúvidas ou necessidade de exercer os seus direitos,
            pode contactar o Responsável pelo Tratamento através do e-mail corporativo: <strong>info@thebullocracy.com</strong>.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">2. Que Dados Recolhemos e a Nossa Base Legal</h2>
          <p className="mb-4">
            Para que possamos fornecer a nossa plataforma, procedemos à recolha de dados mínimos necessários, baseando o seu
            tratamento na execução de contrato (os nossos Termos de Serviço) e no seu consentimento informado:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Dados de Autenticação (E-mail e Perfil):</strong> Utilizamos a plataforma de infraestrutura segura
              Supabase para efetuar a gestão de utilizadores, gerir o seu registo, redefinição de palavras-passe e acesso.
            </li>
            <li>
              <strong>Dados de Portfólio e Uso:</strong> Guardamos na nossa base de dados os portfólios que cria, as suas
              pesquisas e históricos de utilização na plataforma para fornecer uma experiência integrada e personalizada.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">3. Transparência na Partilha de Dados com Terceiros</h2>
          <p className="mb-4">
            O seu direito à transparência é fundamental para a Bullmetrics. Não vendemos, alugamos ou comercializamos os seus
            dados pessoais. Operamos, no entanto, com subprocessadores autorizados estritamente para manter a plataforma
            em funcionamento:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Gestão de Identidade (Supabase):</strong> As informações de autenticação (como o endereço de correio
              eletrónico) são processadas e armazenadas através do Supabase.
            </li>
            <li>
              <strong>Dados de Faturação e Transações Financeiras (Paddle):</strong> A Bullmetrics <strong>não recolhe nem armazena</strong> 
              os seus dados bancários ou números de cartão de crédito. Todo o processo de checkout, subscrição, recolha
              de impostos e faturação é efetuado integralmente pelo nosso parceiro Paddle (na qualidade de Merchant of Record).
              Poderemos receber da Paddle informação de faturação para gerir o seu estatuto (Plano PRO).
            </li>
            <li>
              <strong>Inteligência Artificial (Google Gemini API):</strong> De forma a gerar os AI Insights da plataforma,
              as consultas e tickers solicitados por si são enviados para a infraestrutura do Google Gemini. Informamos
              que estas transmissões limitam-se ao contexto do pedido financeiro (ex: nome da empresa) e passam de
              forma completamente <strong>anónima</strong>, não contendo dados de identificação pessoal.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">4. Segurança dos Dados</h2>
          <p>
            Utilizamos medidas técnicas e organizativas adequadas (criptografia em trânsito TLS/SSL e dados em repouso
            em infraestruturas certificadas) para proteger os dados pessoais contra destruição, perda, alteração,
            divulgação ou acesso não autorizado, de acordo com as melhores práticas de cibersegurança e standards do RGPD.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">5. Os Seus Direitos enquanto Titular de Dados (RGPD)</h2>
          <p className="mb-4">
            Em conformidade com o RGPD, assistem-lhe os seguintes direitos relativamente aos seus dados pessoais:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Direito de Acesso:</strong> Obter confirmação de que os seus dados estão a ser tratados e respetivo acesso.</li>
            <li><strong>Direito de Retificação:</strong> Corrigir informações incorretas ou incompletas na sua conta (via painel /settings).</li>
            <li><strong>Direito ao Apagamento ("Direito ao Esquecimento"):</strong> Solicitar a eliminação total e irrevogável dos seus dados de conta e portfólios das nossas bases de dados.</li>
            <li><strong>Direito de Portabilidade:</strong> Receber os seus dados pessoais num formato estruturado e de uso corrente.</li>
            <li><strong>Direito de Oposição e Limitação:</strong> Opor-se a certos tipos de tratamentos ou pedir a sua suspensão.</li>
          </ul>
          <p className="mt-4">
            Para exercer qualquer um dos seus direitos, contacte-nos de forma inequívoca através do e-mail <strong>info@thebullocracy.com</strong>.
            Garantimos resposta atempada dentro dos prazos legais estipulados. Caso considere existir infração no tratamento,
            assiste-lhe o direito de apresentar queixa à autoridade de controlo competente nacional (CNPD em Portugal).
          </p>
        </section>
      </div>
    </div>
  );
}
