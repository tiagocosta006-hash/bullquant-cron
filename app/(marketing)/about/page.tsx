import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { BRAND } from "@/lib/brand";
import { buttonVariants } from "@/components/ui/button";
import { ExternalLink, Target, Mail, MapPin, MessageCircle } from "lucide-react";
import { TeamMemberModal } from "@/components/marketing/TeamMemberModal";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { Reveal } from "@/components/fx/Reveal";
import Image from "next/image";
import { Metadata } from "next";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "about" });
  // "title" tem tags <italic> destinadas ao t.rich do h1 — chamar t("title")
  // em modo plano faz o next-intl lançar FORMATTING_ERROR (não há handler
  // para a tag). Por isso usa-se "titlePlain", sem markup, para metadata.
  const title = `${t("titlePlain")} | ${BRAND.name}`;
  const description = t("intro");

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
    alternates: {
      canonical: `${BRAND.siteUrl}/about`,
    },
  };
}

export default function AboutPage() {
  const t = useTranslations("about");

  // Schema.org JSON-LD for E-E-A-T (nome em texto plano, ver nota acima)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "name": t("titlePlain"),
    "description": t("intro"),
    "publisher": {
      "@type": "Organization",
      "name": "Bullocracy",
      "url": "https://thebullocracy.com",
    },
    "mainEntity": {
      "@type": "Organization",
      "name": BRAND.name,
      "founder": [
        {
          "@type": "Person",
          "name": "Rodrigo Martins",
          "jobTitle": "Founder & Developer",
          "sameAs": "https://www.linkedin.com/in/rodrigo-teixeira-martins/"
        },
        {
          "@type": "Person",
          "name": "Tiago Costa",
          "jobTitle": "Co-founder",
          "sameAs": "https://www.linkedin.com/in/tcosta06/"
        },
        {
          "@type": "Person",
          "name": "Alexandre",
          "jobTitle": "Co-founder",
        },
      ],
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="container mx-auto flex max-w-5xl flex-col gap-24 px-4 py-24 sm:px-6 sm:py-32">
        {/* 1. Hero */}
        <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <h1 className="text-balance text-4xl font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-6xl">
            {t.rich("title", {
              italic: (chunks) => <span className="not-italic text-foreground">{chunks}</span>,
            })}
          </h1>
          <p className="text-xl leading-relaxed text-muted-foreground">{t("intro")}</p>
        </Reveal>

        {/* 2. The Goal */}
        <Reveal>
          <LiquidGlass className="card-lift mx-auto flex max-w-3xl flex-col items-center gap-6 rounded-3xl p-8 text-center">
            <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Target className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-3xl font-extrabold tracking-[-0.03em] text-foreground sm:text-4xl">
              {t("problem.title")}
            </h2>
            <p className="text-lg leading-relaxed text-muted-foreground sm:text-xl">
              {t("problem.text")}
            </p>
          </LiquidGlass>
        </Reveal>

        {/* 3. The Organization (Bullocracy) */}
        <Reveal>
          <LiquidGlass className="card-lift relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] p-8 sm:p-12">
            <div className="pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full bg-primary/15 blur-[100px]" />
            <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
              <Image
                src="/brand/bullocracy-logo.png"
                alt="The Bullocracy Logo"
                width={100}
                height={100}
                className="object-contain"
                // o preflight do Tailwind aplica `height: auto` a todo <img>,
                // o que desencontra com a largura fixa (100px do atributo) e
                // dispara o aviso do next/image. Fixar as duas dimensões
                // aqui sobrepõe o preflight sem mudar o tamanho renderizado.
                style={{ width: 100, height: 100 }}
                priority
              />

              <h2 className="text-4xl font-extrabold tracking-wide text-primary sm:text-5xl">
                THE BULLOCRACY
              </h2>
              <p className="text-lg leading-relaxed text-muted-foreground sm:text-xl">
                {t("organization.text")}
              </p>
              <a
                href="https://thebullocracy.com"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ size: "lg" }), "pressable mt-2 rounded-full px-8 font-semibold")}
              >
                {t("organization.cta")}
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </div>
          </LiquidGlass>
        </Reveal>

        {/* Divider */}
        <div className="gold-rule mx-auto h-px w-full max-w-sm opacity-30" />

        {/* 4. The Team */}
        <div className="flex flex-col gap-12">
          <Reveal className="mx-auto flex max-w-2xl flex-col gap-4 text-center">
            <h2 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{t("team.title")}</h2>
            <p className="text-lg text-muted-foreground">{t("team.description")}</p>
          </Reveal>

          <div className="grid gap-6 sm:grid-cols-3">
            {[0, 1, 2].map((index) => {
              const name = t(`team.members.${index}.name`);
              const initials = name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .substring(0, 2);

              const member = {
                name,
                role: t(`team.members.${index}.role`),
                bio: t(`team.members.${index}.bio`),
                initials,
                image: index === 0 ? "/team/rodrigo.jpg" : index === 1 ? "/team/tiago.jpg" : undefined,
                socials: {
                  linkedin: t.has(`team.members.${index}.socials.linkedin`) ? t(`team.members.${index}.socials.linkedin`) : "#",
                  instagram: t.has(`team.members.${index}.socials.instagram`) ? t(`team.members.${index}.socials.instagram`) : "#",
                  email: t.has(`team.members.${index}.socials.email`) ? t(`team.members.${index}.socials.email`) : "#",
                }
              };

              return (
                <Reveal key={index} style={{ transitionDelay: `${index * 70}ms` }}>
                  <TeamMemberModal member={member} />
                </Reveal>
              );
            })}
          </div>
        </div>

        {/* 5. Contacts */}
        <div className="flex flex-col gap-12 border-t border-border/50 pt-12">
          <Reveal className="mx-auto flex max-w-2xl flex-col gap-4 text-center">
            <h2 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{t("contact.title")}</h2>
            <p className="text-lg text-muted-foreground">{t("contact.text")}</p>
          </Reveal>

          <div className="mx-auto grid w-full max-w-5xl gap-6 sm:grid-cols-3">
            {/* Email */}
            <Reveal>
              <LiquidGlass className="card-lift flex h-full flex-col items-center gap-1 rounded-2xl p-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">{t("contact.email_label")}</h3>
                <a href={`mailto:${t("contact.email_value")}`} className="text-muted-foreground transition-colors hover:text-primary">
                  {t("contact.email_value")}
                </a>
              </LiquidGlass>
            </Reveal>

            {/* Location */}
            <Reveal style={{ transitionDelay: "70ms" }}>
              <LiquidGlass className="card-lift flex h-full flex-col items-center gap-1 rounded-2xl p-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <MapPin className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">{t("contact.location_label")}</h3>
                <p className="text-muted-foreground">{t("contact.location_value")}</p>
              </LiquidGlass>
            </Reveal>

            {/* Social / Community */}
            <Reveal style={{ transitionDelay: "140ms" }}>
              <LiquidGlass className="card-lift flex h-full flex-col items-center gap-1 rounded-2xl p-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <MessageCircle className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">{t("contact.social_label")}</h3>
                <p className="text-muted-foreground">{t("contact.social_value")}</p>
              </LiquidGlass>
            </Reveal>
          </div>
        </div>
      </div>
    </>
  );
}
