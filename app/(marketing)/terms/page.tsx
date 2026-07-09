import React from "react";

export const metadata = {
  title: "Termos de Serviço | BullMetrics",
  description: "Termos e Condições de Uso da plataforma BullMetrics.",
};

export default function TermsOfServicePage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl text-foreground dark:text-foreground">
      <h1 className="text-4xl font-extrabold tracking-tight mb-8">Termos de Serviço e Condições de Uso</h1>

      <div className="space-y-8 leading-relaxed">
        <section>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground mb-6">
            Última atualização: {new Date().toLocaleDateString("pt-PT")}
          </p>
          <p>
            Bem-vindo à <strong>BullMetrics</strong>. Os presentes Termos de Serviço ("Termos") regulam o seu acesso e utilização
            da nossa plataforma, serviços e ferramentas. Ao aceder ou utilizar o BullMetrics, concorda em ficar vinculado por estes Termos.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">1. Natureza do Serviço e Isenção de Responsabilidade</h2>
          <p className="mb-4">
            A plataforma BullMetrics fornece ferramentas analíticas, modelos financeiros interativos (como a calculadora DCF),
            agregadores de dados históricos baseados em fontes oficiais (como a SEC) e resumos gerados automatizadamente por
            Inteligência Artificial.
          </p>
          <p className="mb-4 font-semibold text-red-600 dark:text-red-400">
            AVISO CRUCIAL: A BullMetrics é uma ferramenta de natureza estritamente educacional e informativa. NÃO constituímos,
            sob qualquer forma, aconselhamento financeiro, recomendação de investimento, intermediação financeira ou gestão
            de património.
          </p>
          <p>
            A BullMetrics não é uma entidade regulada pela Comissão do Mercado de Valores Mobiliários (CMVM) nem por qualquer
            outra autoridade de supervisão financeira europeia. Qualquer decisão de investimento baseada nos dados, análises,
            ou resumos de IA fornecidos pela plataforma é da sua exclusiva e total responsabilidade. Recomendamos
            a consulta de um consultor financeiro certificado antes de efetuar qualquer investimento no mercado de capitais.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">2. Regras de Subscrição, Faturação e Pagamento</h2>
          <p className="mb-4">
            A BullMetrics opera através de um modelo "Freemium", disponibilizando um Plano FREE limitado e um Plano PRO pago.
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>
              <strong>Comerciante de Registo (Merchant of Record):</strong> Todos os pagamentos, transações financeiras,
              recolha automatizada de impostos (incluindo IVA aplicável consoante a sua jurisdição) e processamento
              de faturação são geridos integralmente pelo nosso parceiro autorizado, o <strong>Paddle</strong>. Ao efetuar
              a subscrição, estará a sujeitar-se também aos termos e condições de processamento do Paddle.
            </li>
            <li>
              <strong>Renovação Automática:</strong> A subscrição do Plano PRO é recorrente, podendo ser mensal ou anual.
              No final de cada período de faturação, a subscrição renovar-se-á automaticamente por um período idêntico.
            </li>
            <li>
              <strong>Falhas de Pagamento:</strong> Caso ocorra uma falha na cobrança automática (por expiração de cartão,
              falta de fundos, etc.), o acesso às funcionalidades PRO poderá ser suspenso após tentativas consecutivas
              de cobrança, regressando a conta ao Plano FREE até à regularização do pagamento.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">3. Propriedade Intelectual e Uso Aceitável</h2>
          <p className="mb-4">
            A arquitetura da plataforma, código-fonte, design, logótipos e infraestrutura tecnológica (o "Motor") são
            propriedade exclusiva da BullMetrics. Concorda que, ao utilizar a plataforma, é expressamente <strong>proibido</strong>:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Efetuar engenharia reversa, descompilar, ou desmontar qualquer componente da plataforma.</li>
            <li>Utilizar *bots*, *crawlers*, *spiders* ou qualquer ferramenta de extração de dados (*scraping*) para contornar limites, armazenar ou distribuir em massa os dados financeiros e relatórios disponíveis na plataforma.</li>
          </ul>
          <p className="mt-4">
            Qualquer violação destas regras de uso aceitável confere à BullMetrics o direito de suspender ou terminar
            imediatamente o seu acesso à plataforma, sem aviso prévio ou direito a reembolso.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">4. Inteligência Artificial e Dados Históricos</h2>
          <p>
            Apesar de fazermos todos os esforços para obter dados fidedignos a partir dos
            relatórios formais da SEC ou agregadores oficiais de preço, anomalias e erros de base de dados podem ocorrer.
            O utilizador aceita estes riscos tecnológicos e exime a BullMetrics de qualquer responsabilidade por eventuais
            perdas financeiras decorrentes da utilização das informações disponibilizadas.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">5. Legislação Aplicável e Jurisdição</h2>
          <p>
            Estes Termos de Serviço são regidos e interpretados em conformidade com as leis de Portugal e da União Europeia.
            Em caso de litígio emergente da utilização dos serviços, este será submetido à jurisdição exclusiva dos
            tribunais portugueses competentes.
          </p>
        </section>
      </div>
    </div>
  );
}
