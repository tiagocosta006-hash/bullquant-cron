import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Tailwind,
} from "@react-email/components";
import * as React from "react";

interface BullValueWelcomeEmailProps {
  userFirstName?: string;
}

export const BullValueWelcomeEmail = ({
  userFirstName = "{{ nome }}",
}: BullValueWelcomeEmailProps) => {
  const previewText = `Bem-vindo(a) à BullValue. Vê o valor que os outros não veem.`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                brand: "#d6a64a", // gold-matte-bright
                background: "#09090b", // zinc-950
                card: "#18181b", // zinc-900
                foreground: "#fafafa",
                muted: "#a1a1aa", // zinc-400
              },
            },
          },
        }}
      >
        <Body className="bg-background my-auto mx-auto font-sans text-foreground">
          <Container className="border border-solid border-[#27272a] rounded-xl my-[40px] mx-auto p-[20px] max-w-[600px] bg-card">
            <Section className="mt-[32px] text-center">
              {/* Nota: Em produção, deves substituir o src por um URL público e absoluto (ex: https://thebullocracy.com/brand/logo.png) */}
              <Img src="https://raw.githubusercontent.com/alequece2/bullquant/main/public/brand/logo.svg" height="40" alt="BullValue" className="my-0 mx-auto" />
            </Section>
            
            <Heading className="text-foreground text-[24px] font-bold text-center p-0 mt-[10px] mb-[30px] mx-0">
              Bem-vindo(a) à Bull<span className="text-brand">Value</span>
            </Heading>

            <Text className="text-foreground text-[16px] leading-[24px]">
              Olá {userFirstName},
            </Text>
            <Text className="text-muted text-[16px] leading-[24px]">
              Obrigado por te juntares à <strong>BullValue</strong>, a plataforma criada pela <em>Bullocracy</em> para democratizar o acesso a dados financeiros institucionais.
            </Text>
            
            <Text className="text-muted text-[16px] leading-[24px]">
              A partir de agora, tens acesso a mais de 10 anos de dados fundamentais das empresas do S&P 500, análises DCF interativas com inteligência artificial, e muito mais. Tudo desenhado para value investers com visão a longo prazo como tu.
            </Text>

            <Section className="text-center mt-[32px] mb-[32px]">
              <Button
                className="bg-brand rounded-full text-[#17130a] text-[15px] font-semibold no-underline text-center px-6 py-3"
                href="https://thebullocracy.com"
              >
                Começar a explorar
              </Button>
            </Section>

            <Hr className="border border-solid border-[#27272a] my-[26px] mx-0 w-full" />
            
            <Text className="text-muted text-[12px] leading-[24px] text-center">
              A equipa da BullValue e Bullocracy está à tua disposição se tiveres dúvidas ou propostas de parceria.<br />
              Em caso de alguma dúvida ou dificuldade na plataforma, reportem no email <Link href="mailto:suporte@thebullvalue.com" className="text-brand no-underline">suporte@thebullvalue.com</Link>.<br />
              Se não criaste conta connosco, podes ignorar este email.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default BullValueWelcomeEmail;
