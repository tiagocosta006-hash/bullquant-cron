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

export const SupabaseResetPassword = () => {
  return (
    <Html>
      <Head />
      <Preview>Redefinição de Password - BullValue</Preview>
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
              Redefinir Password 🔐
            </Heading>

            <Text className="text-foreground text-[16px] leading-[24px]">
              Olá {"{{ if .Data.name }}{{ .Data.name }}{{ else }}Investidor{{ end }}"},
            </Text>
            
            <Text className="text-muted text-[16px] leading-[24px]">
              Recebemos um pedido para redefinir a password da tua conta na <strong>BullValue</strong>. Se foste tu que fizeste este pedido, clica no botão abaixo para escolher uma nova password.
            </Text>

            <Section className="text-center mt-[40px] mb-[40px]">
              <Button
                className="bg-brand rounded-full text-[#17130a] text-[15px] font-semibold no-underline text-center px-6 py-3"
                href="{{ .ConfirmationURL }}"
              >
                Redefinir Password
              </Button>
            </Section>

            <Text className="text-muted text-[16px] leading-[24px]">
              Se não fizeste este pedido, podes simplesmente ignorar este email. A tua conta permanece segura.
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

export default SupabaseResetPassword;
