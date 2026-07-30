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

export const SupabaseConfirmSignup = () => {
  return (
    <Html>
      <Head />
      <Preview>Confirma a tua conta na BullValue</Preview>
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
              <Img
                src="https://framerusercontent.com/images/3K0Y47k7Xw8tW5s6X8x6Z2g5w.png"
                width="150"
                alt="BullValue"
                className="my-0 mx-auto"
              />
            </Section>
            
            <Heading className="text-foreground text-[24px] font-bold text-center p-0 mt-[20px] mb-[30px] mx-0">
              Quase lá! Confirma o teu email 🐂
            </Heading>

            <Text className="text-foreground text-[16px] leading-[24px]">
              Olá {"{{ if .Data.name }}{{ .Data.name }}{{ else }}Investidor{{ end }}"},
            </Text>
            
            <Text className="text-muted text-[16px] leading-[24px]">
              Bem-vindo(a) à <strong>BullValue</strong>! Só falta mais um passo para teres acesso a mais de 10 anos de dados financeiros e análises institucionais.
            </Text>

            <Section className="text-center mt-[40px] mb-[40px]">
              <Button
                className="bg-brand rounded-full text-[#17130a] text-[15px] font-semibold no-underline text-center px-6 py-3"
                href="{{ .ConfirmationURL }}"
              >
                Confirmar Conta
              </Button>
            </Section>

            <Text className="text-muted text-[16px] leading-[24px]">
              Se não criaste uma conta connosco, podes ignorar este email de forma segura.
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

export default SupabaseConfirmSignup;
