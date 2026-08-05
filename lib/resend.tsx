import * as React from 'react';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { BullValueWelcomeEmail } from '@/emails/BullValueWelcome';
import { BullValueUpgradeEmail } from '@/emails/BullValueUpgrade';


const resendApiKey = process.env.RESEND_API_KEY;

// Inicializa o cliente Resend apenas se a chave existir
export const resend = resendApiKey ? new Resend(resendApiKey) : null;

// O domínio tem de corresponder ao domínio verificado na Resend (thebullvalue.com)
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'BullValue <no-reply@thebullvalue.com>';

/**
 * HTML Base Wrapper
 */
const getEmailTemplate = (content: string) => `
<!DOCTYPE html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8">
  <title>BullValue</title>
  <style>
    body {
      background-color: #fafaf7;
      color: #1a1a17;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      padding: 40px 20px;
      width: 100%;
      box-sizing: border-box;
      background-color: #fafaf7;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border: 1px solid #e7e5de;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
    }
    .gold-line {
      height: 4px;
      background: linear-gradient(90deg, #e4aa33, #b8873b);
      width: 100%;
    }
    .header {
      padding: 32px 32px 24px 32px;
      text-align: center;
      border-bottom: 1px solid #f0efea;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      color: #1a1a17;
      letter-spacing: -0.05em;
    }
    .header h1 span {
      color: #b8873b;
    }
    .content {
      padding: 40px 32px;
      font-size: 16px;
      line-height: 1.6;
      color: #1a1a17;
    }
    .content h2 {
      margin-top: 0;
      font-size: 22px;
      font-weight: 600;
      color: #1a1a17;
      letter-spacing: -0.02em;
    }
    .content p {
      margin-bottom: 16px;
      color: #57544d;
    }
    .content a.btn {
      display: inline-block;
      background-color: #1a1a17;
      color: #ffffff !important;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 500;
      margin-top: 24px;
      margin-bottom: 16px;
      font-size: 15px;
    }
    .footer {
      padding: 32px;
      background-color: #fafaf7;
      border-top: 1px solid #e7e5de;
      text-align: center;
      font-size: 13px;
      color: #8b877d;
    }
    .footer p {
      margin: 0 0 8px 0;
    }
    .footer a {
      color: #b8873b;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="gold-line"></div>
      <div class="header">
        <h1>Bull<span>Value</span></h1>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} BullValue. Todos os direitos reservados.</p>
        <p><a href="https://thebullvalue.com">Visitar a Plataforma</a></p>
      </div>
    </div>
  </div>
</body>
</html>
`;

/** Indica se o envio de emails (Resend) está configurado neste ambiente. */
export const isEmailEnabled = () => resend !== null

/**
 * Envia o email de Confirmação de conta (com a marca BullValue).
 * `confirmLink` é o link direto gerado pelo Supabase (com token_hash) que, ao ser
 * aberto, confirma o email e devolve o utilizador autenticado à app.
 */
export const sendConfirmationEmail = async (email: string, name: string, confirmLink: string) => {
  if (!resend) {
    console.warn('[Resend] RESEND_API_KEY não encontrada. Email de confirmação ignorado.');
    return { data: null, error: { message: 'RESEND_API_KEY não configurada' } };
  }

  try {
    const res = await resend.emails.send({
      from: FROM_EMAIL,
      to: [email],
      subject: 'Confirma a tua conta — BullValue',
      text: `Olá ${name},\n\nFalta só um passo para ativares a tua conta no BullValue.\nConfirma o teu email abrindo este link:\n\n${confirmLink}\n\nSe não foste tu a criar esta conta, ignora este email.`,
      html: getEmailTemplate(`
        <h2>Olá ${name}, confirma a tua conta</h2>
        <p>Falta só um passo para começares a usar o BullValue. Clica no botão abaixo para confirmar o teu email e ativar a conta.</p>
        <div style="text-align: center;">
          <a href="${confirmLink}" class="btn">Confirmar Email</a>
        </div>
        <p style="margin-top: 24px; font-size: 14px;">Se não foste tu a criar esta conta, podes ignorar este email com segurança.</p>
      `),
    });

    if (res.error) {
      console.error('[Resend] Erro ao enviar email de confirmação para', email, res.error);
    }
    return res;
  } catch (err: any) {
    console.error('[Resend] Exceção ao enviar email de confirmação:', err);
    return { data: null, error: { message: err?.message || 'Falha de rede ao contactar Resend' } };
  }
};

/**
 * Envia o email de Boas-vindas e Confirmação de Registo
 */
export const sendWelcomeEmail = async (email: string, name: string, confirmationLink?: string) => {
  if (!resend) {
    console.warn('[Resend] RESEND_API_KEY não encontrada. Email ignorado.');
    return { data: null, error: { message: 'RESEND_API_KEY não configurada' } };
  }
  
  const link = confirmationLink || 'https://thebullvalue.com/dashboard';
  try {
    const html = await render(<BullValueWelcomeEmail userFirstName={name} />);

    const res = await resend.emails.send({
      from: FROM_EMAIL,
      to: [email],
      subject: 'Bem-vindo ao BullValue!',
      text: `Olá ${name}, bem-vindo ao BullValue! A tua jornada para melhores investimentos começa agora. Acede à plataforma aqui: ${link}`,
      html: html,
    });

    if (res.error) {
      console.error('[Resend] Erro ao enviar email de boas-vindas para', email, res.error);
    }
    return res;
  } catch (err: any) {
    console.error('[Resend] Exceção ao enviar email de boas-vindas:', err);
    return { data: null, error: { message: err?.message || 'Falha de rede ao contactar Resend' } };
  }
};

/**
 * Envia o email de Upgrade para o Plano PRO
 */
export const sendUpgradeToProEmail = async (email: string, name: string) => {
  if (!resend) return { data: null, error: { message: 'RESEND_API_KEY não configurada' } };

  try {
    const html = await render(<BullValueUpgradeEmail userFirstName={name} />);

    const res = await resend.emails.send({
      from: FROM_EMAIL,
      to: [email],
      subject: 'Bem-vindo ao Plano PRO!',
      text: `Parabéns ${name}, agora és PRO! Tens acesso total a todas as funcionalidades exclusivas da plataforma.`,
      html: html,
    });

    if (res.error) {
      console.error('[Resend] Erro ao enviar email de upgrade PRO para', email, res.error);
    }
    return res;
  } catch (err: any) {
    console.error('[Resend] Exceção ao enviar email de upgrade PRO:', err);
    return { data: null, error: { message: err?.message || 'Falha de rede ao contactar Resend' } };
  }
};

/**
 * Envia o email de Confirmação dos 7 dias gratuitos (Trial)
 */
export const sendTrialConfirmationEmail = async (email: string, name: string) => {
  if (!resend) return { data: null, error: { message: 'RESEND_API_KEY não configurada' } };

  try {
    const res = await resend.emails.send({
      from: FROM_EMAIL,
      to: [email],
      subject: 'O teu período gratuito de 7 dias começou!',
      text: `Olá ${name},\n\nO teu período experimental de 7 dias do plano PRO começou agora mesmo.\n\nAproveita para testar todas as nossas ferramentas premium sem qualquer compromisso durante os próximos 7 dias.\n\nAproveitar o Trial: https://thebullvalue.com/dashboard`,
      html: getEmailTemplate(`
        <h2>Olá ${name},</h2>
        <p>O teu período experimental de 7 dias do plano PRO começou agora mesmo.</p>
        <p>Aproveita para testar todas as nossas ferramentas premium sem qualquer compromisso durante os próximos 7 dias.</p>
        <div style="text-align: center;">
          <a href="https://thebullvalue.com/dashboard" class="btn">Aproveitar o Trial</a>
        </div>
      `),
    });

    if (res.error) {
      console.error('[Resend] Erro ao enviar email de trial para', email, res.error);
    }
    return res;
  } catch (err: any) {
    console.error('[Resend] Exceção ao enviar email de trial:', err);
    return { data: null, error: { message: err?.message || 'Falha de rede ao contactar Resend' } };
  }
};

/**
 * Envia o email de Recuperação de Password
 */
export const sendPasswordResetEmail = async (email: string, resetLink: string) => {
  if (!resend) return { data: null, error: { message: 'RESEND_API_KEY não configurada' } };

  try {
    const res = await resend.emails.send({
      from: FROM_EMAIL,
      to: [email],
      subject: 'Recuperação de Password - BullValue',
      text: `Olá,\n\nRecebemos um pedido para repor a password da tua conta.\nClica no link abaixo para criar uma nova password:\n\n${resetLink}\n\nSe não pediste para repor a password, ignora este email.`,
      html: getEmailTemplate(`
        <h2>Recuperação de Password</h2>
        <p>Recebemos um pedido para repor a password da tua conta no BullValue.</p>
        <p>Clica no botão abaixo para definir uma password nova e segura:</p>
        <div style="text-align: center;">
          <a href="${resetLink}" class="btn">Repor Password</a>
        </div>
        <p style="margin-top: 24px; font-size: 14px;">Se não fizeste este pedido, podes ignorar este email com segurança.</p>
      `),
    });

    if (res.error) {
      console.error('[Resend] Erro ao enviar email de recuperação para', email, res.error);
    }
    return res;
  } catch (err: any) {
    console.error('[Resend] Exceção ao enviar email de recuperação:', err);
    return { data: null, error: { message: err?.message || 'Falha de rede ao contactar Resend' } };
  }
};
