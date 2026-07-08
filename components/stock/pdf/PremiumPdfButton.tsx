"use client";

import dynamic from 'next/dynamic';
import React from 'react';
import { Crown } from 'lucide-react';
import type { PremiumPdfButtonInnerProps } from './PremiumPdfButtonInner';

// Load the PDF button dynamically and strictly on the client side
// This prevents Next.js SSR from crashing when trying to compile node-dependent modules in react-pdf
const PremiumPdfButtonInner = dynamic(
  () => import('./PremiumPdfButtonInner'),
  { 
    ssr: false, 
    loading: () => (
      <button 
        disabled
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-md border border-border/40 bg-muted/30 text-muted-foreground opacity-70"
      >
        <Crown className="w-4 h-4" />
        <span>A carregar...</span>
      </button>
    )
  }
);

export function PremiumPdfButton(props: PremiumPdfButtonInnerProps) {
  return <PremiumPdfButtonInner {...props} />;
}
