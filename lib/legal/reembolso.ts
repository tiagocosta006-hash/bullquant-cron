import { LEGAL } from "./config"
import type { Conteudo } from "./tipos"

const e = LEGAL.email
const d = LEGAL.diasResolucao

export const REEMBOLSO: Conteudo = {
  pt: {
    titulo: "Reembolso, Cancelamento e Livre Resolução",
    descricao: "Como cancelar a subscrição e como exercer o direito de livre resolução de 14 dias.",
    intro: ["Esta política aplica-se à subscrição PRO, que é contratada e paga na Whop."],
    blocos: [
      {
        h: "1. Cancelar a subscrição",
        p: ["Pode cancelar a qualquer momento, sem penalização e sem indicar motivo."],
        ol: [
          "Entre na sua conta Whop, onde a subscrição foi comprada.",
          "Abra a secção de subscrições (Memberships).",
          "Escolha a subscrição da BullValue e selecione cancelar.",
        ],
        destaque:
          "O cancelamento impede as renovações seguintes. O acesso PRO mantém-se até ao fim do período já pago. O cancelamento por si só não gera reembolso do período em curso, salvo o direito de livre resolução abaixo ou outro direito que a lei lhe reconheça.",
      },
      {
        h: `2. Direito de livre resolução (${d} dias)`,
        p: [
          `Sendo consumidor, pode resolver o contrato no prazo de ${d} dias a contar da data em que o celebrou, sem indicar motivo e sem penalização.`,
          "Como a subscrição dá acesso imediato, é-lhe pedido, antes de pagar, que peça expressamente o início imediato do serviço. Se o fizer e depois resolver o contrato dentro do prazo, paga apenas o valor proporcional ao que já usufruiu até ao momento em que nos comunicou a resolução; o restante é-lhe devolvido.",
          "Se não pediu expressamente o início imediato, ou se não lhe prestámos a informação legalmente exigida, não paga nada pelo serviço prestado até à resolução.",
        ],
      },
      {
        h: "3. Como exercer o direito",
        ol: [
          'Use a página "Retratação" (função "Resolver o contrato aqui"): indique o nome e o e-mail da subscrição e confirme. Receberá de imediato uma confirmação por e-mail, em suporte duradouro.',
          `Em alternativa, envie uma declaração inequívoca para ${e} (pode usar o modelo abaixo).`,
        ],
        p: [
          `Modelo: "Comunico que resolvo o contrato de subscrição PRO da BullValue celebrado em [data], associado ao e-mail [e-mail]. Nome: [nome]. Data: [data]."`,
          `Basta enviar a comunicação antes de terminar o prazo de ${d} dias.`,
        ],
      },
      {
        h: "4. Reembolso",
        p: [
          `Devolvemos os pagamentos a que tenha direito sem demora injustificada e, no máximo, no prazo de 14 dias a contar da data em que tomámos conhecimento da resolução, usando o mesmo meio de pagamento, sem custos para si. Como o pagamento é processado pela Whop, o reembolso é executado através dela; se o reembolso não lhe chegar no prazo, contacte-nos em ${e}.`,
          "A resolução termina o acesso PRO a partir do momento da comunicação.",
        ],
      },
      {
        h: "5. Erros, cobranças indevidas e problemas técnicos",
        p: [
          `Se foi cobrado duas vezes, foi cobrado após cancelar, ou não conseguiu aceder ao serviço PRO por um problema nosso, escreva-nos para ${e}. Corrigimos o erro e reembolsamos o que tenha sido cobrado indevidamente.`,
        ],
      },
      {
        h: "6. Outros direitos",
        p: [
          "Esta política não afeta os direitos que a lei lhe reconhece como consumidor, incluindo em caso de falta de conformidade do serviço digital. Pode também apresentar reclamação no Livro de Reclamações Eletrónico (livroreclamacoes.pt) ou recorrer a uma entidade de resolução alternativa de litígios de consumo (lista em consumidor.gov.pt).",
        ],
      },
    ],
  },
  en: {
    titulo: "Refunds, Cancellation and Withdrawal",
    descricao: "How to cancel your subscription and how to exercise the 14-day right of withdrawal.",
    intro: ["This policy applies to the PRO subscription, which is purchased and paid on Whop."],
    blocos: [
      {
        h: "1. Cancelling the subscription",
        p: ["You can cancel at any time, without penalty and without giving a reason."],
        ol: [
          "Log in to your Whop account, where the subscription was purchased.",
          "Open the subscriptions section (Memberships).",
          "Choose the BullValue subscription and select cancel.",
        ],
        destaque:
          "Cancelling prevents later renewals. PRO access continues until the end of the period already paid. Cancelling on its own does not trigger a refund of the current period, except for the right of withdrawal below or any other right the law gives you.",
      },
      {
        h: `2. Right of withdrawal (${d} days)`,
        p: [
          `As a consumer you may withdraw from the contract within ${d} days of concluding it, without giving a reason and without penalty.`,
          "Because the subscription gives immediate access, before paying you are asked to expressly request immediate start of the service. If you do and then withdraw within the period, you only pay a proportionate amount for what you have used until you told us of your withdrawal; the rest is refunded.",
          "If you did not expressly request immediate start, or if we failed to give you the legally required information, you pay nothing for the service provided until withdrawal.",
        ],
      },
      {
        h: "3. How to exercise the right",
        ol: [
          'Use the "Withdrawal" page ("Withdraw from the contract here" function): enter the name and e-mail of the subscription and confirm. You will receive an immediate confirmation by e-mail, on a durable medium.',
          `Alternatively, send an unambiguous statement to ${e} (you can use the template below).`,
        ],
        p: [
          `Template: "I hereby withdraw from my BullValue PRO subscription contract concluded on [date], associated with e-mail [e-mail]. Name: [name]. Date: [date]."`,
          `It is enough to send the communication before the ${d}-day period ends.`,
        ],
      },
      {
        h: "4. Refund",
        p: [
          `We refund the payments you are entitled to without undue delay and at the latest within 14 days of learning of your withdrawal, using the same means of payment, at no cost to you. Since payment is processed by Whop, the refund is carried out through it; if the refund does not reach you in time, contact us at ${e}.`,
          "Withdrawal ends PRO access from the moment of the communication.",
        ],
      },
      {
        h: "5. Errors, wrongful charges and technical problems",
        p: [`If you were charged twice, charged after cancelling, or could not access the PRO service because of a problem on our side, write to ${e}. We correct the error and refund anything wrongly charged.`],
      },
      {
        h: "6. Other rights",
        p: [
          "This policy does not affect the rights the law gives you as a consumer, including in case of lack of conformity of the digital service. You may also complain in the Electronic Complaints Book (livroreclamacoes.pt) or turn to an alternative dispute resolution body for consumer disputes (list at consumidor.gov.pt).",
        ],
      },
    ],
  },
}
