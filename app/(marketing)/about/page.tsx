import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { BRAND } from "@/lib/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Target, Shield, Users, LineChart, Mail, MapPin, MessageCircle } from "lucide-react";
import { TeamMemberModal } from "@/components/marketing/TeamMemberModal";
import Image from "next/image";
import { Cinzel } from "next/font/google";
import { Metadata } from "next";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["600", "700"],
});

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "about" });
  const title = `${t("title")} | ${BRAND}`;
  const description = t("intro");

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

export default function AboutPage() {
  const t = useTranslations("about");

  // Schema.org JSON-LD for E-E-A-T
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "name": t("title"),
    "description": t("intro"),
    "publisher": {
      "@type": "Organization",
      "name": "Bullocracy",
      "url": "https://thebullocracy.com",
    },
    "mainEntity": {
      "@type": "Organization",
      "name": BRAND,
      "founder": [
        {
          "@type": "Person",
          "name": "Rodrigo Martins",
          "jobTitle": "Founder & Developer",
        },
        {
          "@type": "Person",
          "name": "Tiago Costa",
          "jobTitle": "Co-founder",
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
      <div className="container mx-auto max-w-5xl py-24 sm:py-32 flex flex-col gap-24 px-4 sm:px-6">
        {/* 1. Hero Section */}
        <div className="flex flex-col items-center text-center gap-6 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
          <Badge variant="secondary" className="px-4 py-1 text-sm bg-primary/10 text-primary border-primary/20">
            <Target className="w-4 h-4 mr-2" />
            {t("badge")}
          </Badge>
          <h1 className="text-4xl sm:text-6xl font-heading tracking-tight text-balance">
            {t.rich("title", {
              italic: (chunks) => <span className="italic text-muted-foreground">{chunks}</span>
            })}
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed">
            {t("intro")}
          </p>
        </div>

        {/* 2. The Goal (Formerly The Problem) */}
        <div className="glass flex flex-col items-center text-center gap-6 rounded-3xl p-8 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150 fill-mode-both border border-border/50 shadow-sm mt-4">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-2">
            <Target className="w-7 h-7 text-primary" />
          </div>
          <h2 className={`text-3xl sm:text-4xl text-foreground tracking-tight ${cinzel.className}`}>
            {t("problem.title")}
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg sm:text-xl">
            {t("problem.text")}
          </p>
        </div>

        {/* 3. The Organization (Bullocracy) */}
        <div className="relative overflow-hidden bg-[#0A1526] text-slate-50 border border-slate-800/50 rounded-[2rem] p-8 sm:p-12 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 fill-mode-both shadow-2xl mt-4">
          {/* Brilho decorativo no fundo para dar requinte ao azul */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-primary/20 blur-[100px] rounded-full pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-72 h-72 bg-blue-500/10 blur-[80px] rounded-full pointer-events-none"></div>

          <div className="flex flex-col items-center text-center gap-6 relative z-10 max-w-3xl mx-auto">
            {/* Logo */}
            <div className="mb-2">
              <Image 
                src="/brand/bullocracy-logo.png" 
                alt="The Bullocracy Logo" 
                width={110} 
                height={110} 
                className="object-contain drop-shadow-xl"
                priority
              />
            </div>
            
            <h2 className={`text-4xl sm:text-6xl text-primary tracking-wide drop-shadow-sm ${cinzel.className}`}>THE BULLOCRACY</h2>
            <p className="text-slate-300 leading-relaxed text-lg sm:text-xl">
              {t("organization.text")}
            </p>
            <div className="pt-6">
              <a href="https://thebullocracy.com" target="_blank" rel="noopener noreferrer" className="inline-flex">
                <Button size="lg" className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 shadow-[0_4px_24px_-6px_hsl(var(--primary)/0.5)]">
                  {t("organization.cta")}
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </a>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="gold-rule h-[1px] w-full max-w-sm mx-auto opacity-30 animate-in fade-in duration-700 delay-300 fill-mode-both"></div>

        {/* 4. The Team */}
        <div className="flex flex-col gap-12 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 fill-mode-both">
          <div className="text-center max-w-2xl mx-auto flex flex-col gap-4">
            <h2 className="text-3xl sm:text-4xl font-heading">{t("team.title")}</h2>
            <p className="text-lg text-muted-foreground">
              {t("team.description")}
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
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

              return <TeamMemberModal key={index} member={member} />;
            })}
          </div>
        </div>



        {/* 6. Contacts */}
        <div className="flex flex-col gap-12 pt-12 border-t border-border/50 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-700 fill-mode-both">
          <div className="text-center max-w-2xl mx-auto flex flex-col gap-4">
            <h2 className="text-3xl sm:text-4xl font-heading">{t("contact.title")}</h2>
            <p className="text-lg text-muted-foreground">
              {t("contact.text")}
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 max-w-5xl mx-auto w-full">
            {/* Email */}
            <div className="glass flex flex-col items-center text-center p-8 rounded-2xl hover:scale-105 hover:shadow-xl hover:bg-secondary/30 transition-all duration-300 ease-out">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-1">{t("contact.email_label")}</h3>
              <a href={`mailto:${t("contact.email_value")}`} className="text-muted-foreground hover:text-primary transition-colors">
                {t("contact.email_value")}
              </a>
            </div>

            {/* Location */}
            <div className="glass flex flex-col items-center text-center p-8 rounded-2xl hover:scale-105 hover:shadow-xl hover:bg-secondary/30 transition-all duration-300 ease-out">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <MapPin className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-1">{t("contact.location_label")}</h3>
              <p className="text-muted-foreground">
                {t("contact.location_value")}
              </p>
            </div>

            {/* Social / Community */}
            <div className="glass flex flex-col items-center text-center p-8 rounded-2xl hover:scale-105 hover:shadow-xl hover:bg-secondary/30 transition-all duration-300 ease-out">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <MessageCircle className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-1">{t("contact.social_label")}</h3>
              <p className="text-muted-foreground">
                {t("contact.social_value")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
