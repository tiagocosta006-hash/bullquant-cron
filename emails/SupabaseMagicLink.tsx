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

export const SupabaseMagicLink = () => {
  return (
    <Html>
      <Head />
      <Preview>O teu link de acesso mágico à BullValue</Preview>
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
              Acesso Mágico 🪄
            </Heading>

            <Text className="text-foreground text-[16px] leading-[24px]">
              Olá {"{{ nome }}"},
            </Text>
            
            <Text className="text-muted text-[16px] leading-[24px]">
              Pediste um link de acesso mágico para entrar na tua conta da <strong>BullValue</strong>. Não precisas de password, basta clicar no botão abaixo para entrares diretamente de forma segura.
            </Text>

            <Section className="text-center mt-[40px] mb-[40px]">
              <Button
                className="bg-brand rounded-full text-[#17130a] text-[15px] font-semibold no-underline text-center px-6 py-3"
                href="{{ .ConfirmationURL }}"
              >
                Entrar na minha conta
              </Button>
            </Section>

            <Text className="text-muted text-[16px] leading-[24px]">
              Se não fizeste este pedido, não te preocupes, a tua conta está segura. Ninguém conseguirá entrar sem aceder à tua caixa de correio.
            </Text>

            <Hr className="border border-solid border-[#27272a] my-[26px] mx-0 w-full" />
            
            <Text className="text-muted text-[12px] leading-[24px] text-center">
              A equipa da BullValue e Bullocracy está à tua disposição se tiveres dúvidas.<br />
              Em caso de alguma dificuldade, reporta no email <Link href="mailto:suporte@thebullvalue.com" className="text-brand no-underline">suporte@thebullvalue.com</Link>.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default SupabaseMagicLink;
