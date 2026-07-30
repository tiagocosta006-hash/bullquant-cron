import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Tailwind,
  Link,
} from "@react-email/components";
import * as React from "react";

interface BullValueUpgradeEmailProps {
  userFirstName?: string;
  planName?: string;
}

export const BullValueUpgradeEmail = ({
  userFirstName = "{{ nome }}",
  planName = "Pro",
}: BullValueUpgradeEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>O teu upgrade para o plano {planName} foi confirmado!</Preview>
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                brand: "#d6a64a",
                background: "#09090b",
                card: "#18181b",
                foreground: "#fafafa",
                muted: "#a1a1aa",
              },
            },
          },
        }}
      >
        <Body className="bg-background my-auto mx-auto font-sans text-foreground">
          <Container className="border border-solid border-[#27272a] rounded-xl my-[40px] mx-auto p-[30px] max-w-[600px] bg-card">
            <Section className="mt-[10px] text-center">
              <Img src="https://thebullvalue.com/brand/logo.svg" height="40" alt="BullValue" className="my-0 mx-auto" />
            </Section>
            
            <Heading className="text-foreground text-[24px] font-bold text-center p-0 mt-[20px] mb-[30px] mx-0">
              Bem-vindo ao plano <span className="text-brand">{planName}</span> 🚀
            </Heading>

            <Text className="text-foreground text-[16px] leading-[24px]">
              Olá {userFirstName},
            </Text>
            
            <Text className="text-muted text-[16px] leading-[24px]">
              O teu upgrade para o plano <strong>{planName}</strong> foi processado com sucesso. Obrigado por confiares na <strong>BullValue</strong> para levar a tua análise financeira para o próximo nível.
            </Text>

            <Text className="text-muted text-[16px] leading-[24px]">
              A partir deste momento, todas as funcionalidades avançadas estão desbloqueadas na tua conta. Prepara-te para explorar os mercados com dados institucionais em tempo real.
            </Text>

            <Section className="text-center mt-[40px] mb-[40px]">
              <Button
                className="bg-brand rounded-full text-[#17130a] text-[15px] font-semibold no-underline text-center px-6 py-3"
                href="https://thebullocracy.com/dashboard"
              >
                Aceder ao Dashboard
              </Button>
            </Section>

            <Hr className="border border-solid border-[#27272a] my-[26px] mx-0 w-full" />
            
            <Text className="text-muted text-[12px] leading-[24px] text-center">
              A equipa da BullValue e Bullocracy está à tua disposição se tiveres dúvidas.<br />
              Em caso de alguma dificuldade ou questão sobre a tua faturação, reporta no email <Link href="mailto:suporte@thebullvalue.com" className="text-brand no-underline">suporte@thebullvalue.com</Link>.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default BullValueUpgradeEmail;
