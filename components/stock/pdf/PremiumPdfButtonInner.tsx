"use client";

import React from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { Crown, Loader2, FileText } from 'lucide-react';
import PremiumPdfReport, { PremiumPdfReportProps } from './PremiumPdfReport';

export interface PremiumPdfButtonInnerProps extends PremiumPdfReportProps {
  isPremiumUser: boolean;
}

export default function PremiumPdfButtonInner({ company, fundamentals, aiInsight, isPremiumUser }: PremiumPdfButtonInnerProps) {
  if (!isPremiumUser) {
    return (
      <button 
        disabled
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-md border border-border/40 bg-muted/30 text-muted-foreground opacity-70 cursor-not-allowed"
        title="Disponível apenas para utilizadores PRO"
      >
        <Crown className="w-4 h-4" />
        <span>Exportar PRO</span>
      </button>
    );
  }

  return (
    <PDFDownloadLink
      document={<PremiumPdfReport company={company} fundamentals={fundamentals} aiInsight={aiInsight} />}
      fileName={`${company.ticker}_Premium_Report.pdf`}
      className="flex items-center gap-2 px-3 py-1.5 text-sm font-bold rounded-md bg-gradient-to-r from-amber-500/10 to-amber-600/10 border border-amber-500/20 text-amber-600 dark:text-amber-500 hover:from-amber-500/20 hover:to-amber-600/20 transition-all shadow-sm"
    >
      {({ loading }) => (
        <>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
          <span>{loading ? 'A gerar...' : 'Relatório PRO'}</span>
        </>
      )}
    </PDFDownloadLink>
  );
}
