import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { BRAND } from "@/lib/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Target, Shield, Users, LineChart } from "lucide-react";
import { Metadata } from "next";

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
      <div className="container max-w-5xl py-24 sm:py-32 flex flex-col gap-24">
        {/* 1. Hero Section */}
        <div className="flex flex-col items-center text-center gap-6 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
          <Badge variant="secondary" className="px-4 py-1 text-sm bg-primary/10 text-primary border-primary/20">
            <Target className="w-4 h-4 mr-2" />
            {t("badge")}
          </Badge>
          <h1 className="text-4xl sm:text-6xl font-heading tracking-tight text-balance">
            {t("title").replace("financeiros.", "")}
            <span className="italic text-muted-foreground"> financeiros.</span>
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed">
            {t("intro")}
          </p>
        </div>

        {/* 2. The Problem */}
        <div className="grid sm:grid-cols-2 gap-12 items-center bg-secondary/30 border border-border/50 rounded-[2rem] p-8 sm:p-12 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150 fill-mode-both">
          <div className="flex flex-col gap-4">
            <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center border border-border/50 shadow-sm mb-2">
              <LineChart className="w-6 h-6 text-foreground" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-heading">{t("problem.title")}</h2>
            <p className="text-muted-foreground leading-relaxed text-lg">
              {t("problem.text")}
            </p>
          </div>
          {/* 3. The Organization (Bullocracy) */}
          <div className="flex flex-col gap-4">
            <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center border border-border/50 shadow-sm mb-2">
              <Users className="w-6 h-6 text-foreground" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-heading">{t("organization.title")}</h2>
            <p className="text-muted-foreground leading-relaxed text-lg">
              {t("organization.text")}
            </p>
            <div className="pt-4">
              <a href="https://thebullocracy.com" target="_blank" rel="noopener noreferrer" className="inline-flex">
                <Button variant="outline" className="rounded-full">
                  {t("organization.cta")}
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </a>
            </div>
          </div>
        </div>

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

              return (
                <div key={index} className="flex flex-col gap-6 p-8 bg-background border border-border/50 rounded-3xl shadow-sm hover:shadow-md transition-shadow">
                  {/* Placeholder for Photo */}
                  <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center border-4 border-background shadow-sm mx-auto">
                    <span className="text-2xl font-heading text-muted-foreground">{initials}</span>
                  </div>
                  <div className="text-center flex flex-col gap-1">
                    <h3 className="font-semibold text-xl">{name}</h3>
                    <span className="text-sm text-primary font-medium">{t(`team.members.${index}.role`)}</span>
                  </div>
                  <p className="text-muted-foreground text-center text-sm leading-relaxed">
                    {t(`team.members.${index}.bio`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. Data Philosophy */}
        <div className="flex flex-col items-center text-center gap-6 max-w-3xl mx-auto py-12 border-t border-border/50 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500 fill-mode-both">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-2">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-heading">{t("philosophy.title")}</h2>
          <p className="text-xl text-muted-foreground leading-relaxed">
            {t("philosophy.text")}
          </p>
        </div>
      </div>
    </>
  );
}
