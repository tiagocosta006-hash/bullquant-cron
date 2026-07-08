import React from "react";

export const metadata = {
  title: "Política de Reembolso e Cancelamento | Bullmetrics",
  description: "Regras de cancelamento e reembolso para assinaturas na plataforma Bullmetrics.",
};

export default function RefundPolicyPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl text-gray-900 dark:text-gray-100">
      <h1 className="text-4xl font-extrabold tracking-tight mb-8">Política de Reembolso e Cancelamento</h1>
      
      <div className="space-y-8 leading-relaxed">
        <section>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Última atualização: {new Date().toLocaleDateString("pt-PT")}
          </p>
          <p>
            Esta política estabelece os termos e condições relativos a cancelamentos e reembolsos aplicáveis aos
            planos de subscrição (Plano PRO) adquiridos na <strong>Bullmetrics</strong>. Como a faturação é gerida
            pelo nosso parceiro integrado <strong>Paddle</strong>, enquanto *Merchant of Record*, aderimos estritamente
            a estes processos padronizados e transparentes.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">1. Natureza do Serviço e Execução Imediata</h2>
          <p>
            O Plano PRO da Bullmetrics é classificado legalmente como <strong>conteúdo digital de execução imediata</strong>.
            Ao ativar a subscrição, obtém acesso instantâneo aos relatórios avançados gerados por Inteligência Artificial,
            às componentes exclusivas da calculadora DCF, base de dados profunda e sem limitações de uso impostas ao Plano FREE.
            Consequentemente, o consumo do produto digital começa no momento exato em que a transação é confirmada e o
            serviço é desbloqueado no seu painel.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">2. Regra Estrita de Não-Reembolso</h2>
          <p className="mb-4">
            Devido à natureza de consumo imediato de acesso a dados financeiros valiosos, consultas de IA (que comportam
            custos técnicos de processamento não recuperáveis) e modelos avançados, a Bullmetrics <strong>não efetua
            reembolsos, devoluções parciais ou créditos</strong> aplicados a períodos de faturação parciais.
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>A ativação de qualquer ciclo de faturação, seja Mensal ou Anual, é definitiva para o período pago.</li>
            <li>Se o utilizador decidir não utilizar a plataforma, esquecer-se de cancelar, ou utilizar o serviço num volume menor do que antecipava, tais cenários não configuram uma base para elegibilidade de reembolso.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">3. Cancelamento da Subscrição e Renovação Automática</h2>
          <p className="mb-4">
            Respeitamos totalmente a sua liberdade contratual. O utilizador tem o direito e total controlo para
            proceder ao cancelamento da sua subscrição a qualquer momento, e sem a aplicação de qualquer
            taxa de cancelamento ou penalização.
          </p>
          <p className="mb-4 font-semibold">Como Cancelar:</p>
          <ul className="list-decimal pl-6 space-y-2 mb-4">
            <li>Efetue o login na sua conta Bullmetrics.</li>
            <li>Aceda à secção de definições de conta (<strong>Configurações / O Meu Perfil</strong>).</li>
            <li>Navegue até ao painel de Faturação, que conectará diretamente ao portal self-service e seguro do <strong>Paddle</strong>.</li>
            <li>Selecione a opção para cancelar a subscrição ativa.</li>
          </ul>
          <p>
            <strong>Efeitos do Cancelamento:</strong> O cancelamento não resulta num reembolso pelo tempo já pago
            no ciclo atual. Em vez disso, o cancelamento impede as futuras cobranças de renovação. O acesso total
            às funcionalidades do Plano PRO manter-se-á ininterruptamente até ao último dia do período de 
            faturação em curso. No dia seguinte ao término do ciclo, a sua conta reverterá automaticamente
            para as funcionalidades do Plano FREE.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">4. Anomalias Técnicas, Cobranças Indevidas ou Erros</h2>
          <p>
            Caso seja identificada uma cobrança dupla, erro de sistema no momento do checkout via Paddle,
            ou incapacidade técnica devidamente comprovada em aceder à infraestrutura PRO nas primeiras 48 horas
            pós-compra (por responsabilidade exclusiva da Bullmetrics), deverá contactar imediatamente a equipa
            através de <strong>support@bullocracy.com</strong>. Estes casos manifestamente excecionais serão
            revisados num prazo de 3 a 5 dias úteis, e as retificações ou devoluções serão executadas caso
            se confirme o erro de processamento fiduciário.
          </p>
        </section>
      </div>
    </div>
  );
}
