import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;

// Inicializa o cliente Resend apenas se a chave existir
export const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Substitui pelo email que tens configurado/verificado no Resend
const FROM_EMAIL = 'BullQuant <info@thebullocracy.com>';

/**
 * Envia o email de Boas-vindas (após registo/confirmação)
 */
export const sendWelcomeEmail = async (email: string, name: string) => {
  if (!resend) {
    console.warn('RESEND_API_KEY não encontrada. Email ignorado.');
    return;
  }
  
  return await resend.emails.send({
    from: FROM_EMAIL,
    to: [email],
    subject: 'Bem-vindo ao BullQuant!',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Olá ${name}, bem-vindo ao BullQuant!</h2>
        <p>Estamos muito felizes por te ter connosco. Explora a plataforma e tira o máximo partido da análise fundamental potenciada por IA.</p>
        <p>A tua jornada para melhores investimentos começa agora.</p>
      </div>
    `,
  });
};

/**
 * Envia o email de Upgrade para o Plano PRO
 */
export const sendUpgradeToProEmail = async (email: string, name: string) => {
  if (!resend) return;

  return await resend.emails.send({
    from: FROM_EMAIL,
    to: [email],
    subject: 'Bem-vindo ao Plano PRO!',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Parabéns ${name}, agora és PRO!</h2>
        <p>A tua conta foi atualizada com sucesso.</p>
        <p>A partir de agora tens acesso total a todas as funcionalidades exclusivas da plataforma, incluindo avaliações de gestão profundas e análises DCF ilimitadas.</p>
      </div>
    `,
  });
};

/**
 * Envia o email de Confirmação dos 7 dias gratuitos (Trial)
 */
export const sendTrialConfirmationEmail = async (email: string, name: string) => {
  if (!resend) return;

  return await resend.emails.send({
    from: FROM_EMAIL,
    to: [email],
    subject: 'O teu período gratuito de 7 dias começou!',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Olá ${name},</h2>
        <p>O teu período experimental de 7 dias do plano PRO começou agora mesmo.</p>
        <p>Aproveita para testar todas as nossas ferramentas premium sem qualquer compromisso.</p>
      </div>
    `,
  });
};
