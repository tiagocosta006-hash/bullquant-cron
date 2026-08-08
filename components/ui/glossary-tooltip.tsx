"use client";

import { useLocale } from "next-intl";
import { BookOpenText } from "lucide-react";
import { ReactNode } from "react";
import { glossaryTerms, Locale } from "@/lib/data/glossary";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/routing";

interface GlossaryTooltipProps {
  slug: string;
  children: ReactNode;
  className?: string;
}

export function GlossaryTooltip({ slug, children, className }: GlossaryTooltipProps) {
  const locale = useLocale() as Locale;
  
  const term = glossaryTerms.find((t) => t.slug === slug);
  
  if (!term) {
    return <span className={className}>{children}</span>;
  }

  const title = term.title[locale] || term.title.en;
  const fullDefinition = term.definition[locale] || term.definition.en;

  // Extrair apenas a primeira frase (até ao primeiro ponto final seguido de espaço ou fim do texto)
  const firstSentenceMatch = fullDefinition.match(/^[^.]+\./);
  const shortDefinition = firstSentenceMatch ? firstSentenceMatch[0] : fullDefinition;

  // Simple parser to strip out the markdown links in the tooltip 
  // (turning them into bold text since clicking inside a tooltip can be tricky)
  const renderDefinition = (text: string) => {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      parts.push(
        <span key={key++} className="font-semibold text-primary">
          {match[1]}
        </span>
      );
      lastIndex = linkRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  const readMoreText = locale === 'pt' ? 'Ler mais no glossário' : 'Read more in glossary';

  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger 
          render={
            <span 
              className={cn(
                "cursor-help decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground",
                className
              )}
              style={{ textDecorationStyle: 'dotted', textDecorationLine: 'underline' }}
            />
          }
        >
          {children}
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          align="center" 
          sideOffset={8}
          className="z-50 max-w-[280px] p-4 shadow-xl !bg-card !border !border-border/50 rounded-xl"
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <BookOpenText className="h-3.5 w-3.5 text-primary" />
              </div>
              <strong className="text-[13px] font-bold !text-foreground leading-none">{title}</strong>
            </div>
            <div className="text-[13px] leading-relaxed !text-muted-foreground">
              {renderDefinition(shortDefinition)}
              <Link 
                href={`/glossary#${slug}` as any} 
                className="mt-2 text-primary hover:underline block font-medium"
              >
                {readMoreText} &rarr;
              </Link>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
