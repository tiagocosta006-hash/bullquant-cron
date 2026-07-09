import { sendWelcomeEmail } from '../lib/resend';

async function main() {
  const testEmail = process.argv[2];
  
  if (!testEmail) {
    console.error('❌ Erro: Por favor, fornece um email de destino como argumento.');
    console.log('Uso: npx tsx --env-file=.env.local scripts/test-email.ts o-teu-email@exemplo.com');
    process.exit(1);
  }

  console.log(`A enviar email de teste (Boas-vindas) para: ${testEmail}...`);
  
  try {
    const response = await sendWelcomeEmail(testEmail, 'Sócio');
    console.log('✅ Email enviado com sucesso!');
    console.log('Detalhes:', response);
  } catch (error) {
    console.error('❌ Ocorreu um erro ao enviar o email:');
    console.error(error);
  }
}

main();
