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
  const definition = term.definition[locale] || term.definition.en;

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

  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span 
            className={cn(
              "cursor-help decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground",
              className
            )}
            // Underline added directly or conditionally via styling, 
            // usually dotted underline implies "more info on hover"
            style={{ textDecorationStyle: 'dotted', textDecorationLine: 'underline' }}
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          align="center" 
          sideOffset={8}
          className="z-50 max-w-[320px] p-4 shadow-xl !bg-card !border !border-border/50 rounded-xl"
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <BookOpenText className="h-3.5 w-3.5 text-primary" />
              </div>
              <strong className="text-[13px] font-bold !text-foreground leading-none">{title}</strong>
            </div>
            <p className="text-[13px] leading-relaxed !text-muted-foreground">
              {renderDefinition(definition)}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
