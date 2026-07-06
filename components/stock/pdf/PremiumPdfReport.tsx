import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// Define styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: '#10b981',
    paddingBottom: 15,
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'column',
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#09090b',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#71717a',
  },
  premiumTag: {
    fontSize: 10,
    color: '#10b981',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  date: {
    fontSize: 10,
    color: '#71717a',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#09090b',
    marginTop: 20,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e4e7',
    paddingBottom: 4,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f4f4f5',
    padding: 12,
    borderRadius: 6,
    marginBottom: 15,
  },
  metricBox: {
    flexDirection: 'column',
  },
  metricLabel: {
    fontSize: 10,
    color: '#71717a',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#09090b',
  },
  textBlock: {
    fontSize: 11,
    lineHeight: 1.5,
    color: '#3f3f46',
    marginBottom: 12,
  },
  table: {
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#e4e4e7',
    borderRightWidth: 0,
    borderBottomWidth: 0,
    marginTop: 10,
    marginBottom: 15,
  },
  tableRow: {
    margin: 'auto',
    flexDirection: 'row',
  },
  tableColHeader: {
    width: '16.6%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#e4e4e7',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    backgroundColor: '#f4f4f5',
  },
  tableCol: {
    width: '16.6%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#e4e4e7',
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  tableCellHeader: {
    margin: 5,
    fontSize: 9,
    fontWeight: 'bold',
    color: '#09090b',
  },
  tableCell: {
    margin: 5,
    fontSize: 9,
    color: '#3f3f46',
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  bulletPoint: {
    width: 10,
    fontSize: 11,
    color: '#10b981',
  },
  listItemContent: {
    flex: 1,
    fontSize: 11,
    lineHeight: 1.5,
    color: '#3f3f46',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e4e4e7',
    paddingTop: 10,
  },
  footerText: {
    fontSize: 9,
    color: '#a1a1aa',
  },
});

export type PdfCompanyData = {
  name: string;
  ticker: string;
  exchange: string;
  sector: string | null;
  price: number | null;
  marketCap: number | null;
}

export type PdfFundamental = {
  year: number;
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
  fcf: number | null;
  grossMargin: number | null;
}

export type PdfAiInsight = {
  executiveSummary: string;
  moat: string;
  catalysts: { title: string; desc: string }[];
  risks: { title: string; desc: string }[];
}

export interface PremiumPdfReportProps {
  company: PdfCompanyData;
  fundamentals: PdfFundamental[];
  aiInsight: PdfAiInsight | null;
}

const formatNumber = (num: number | null, isCurrency = false, isPercent = false) => {
  if (num === null) return "N/A";
  if (isPercent) return `${(num * 100).toFixed(1)}%`;
  
  const absNum = Math.abs(num);
  let formatted = num.toFixed(2);
  
  if (absNum >= 1e9) {
    formatted = (num / 1e9).toFixed(2) + "B";
  } else if (absNum >= 1e6) {
    formatted = (num / 1e6).toFixed(2) + "M";
  }
  
  return isCurrency ? `$${formatted}` : formatted;
};

export const PremiumPdfReport = ({ company, fundamentals, aiInsight }: PremiumPdfReportProps) => {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{company.name}</Text>
            <Text style={styles.subtitle}>{company.ticker} • {company.exchange} {company.sector ? `• ${company.sector}` : ''}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.premiumTag}>Premium Intelligence Report</Text>
            <Text style={styles.date}>{currentDate}</Text>
          </View>
        </View>

        {/* Key Metrics */}
        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Current Price</Text>
            <Text style={styles.metricValue}>{company.price !== null ? `$${company.price.toFixed(2)}` : 'N/A'}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Market Cap</Text>
            <Text style={styles.metricValue}>{formatNumber(company.marketCap, true)}</Text>
          </View>
        </View>

        {/* Financials Table */}
        <Text style={styles.sectionTitle}>Historical Financials (Annual)</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>Year</Text></View>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>Revenue</Text></View>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>Gross Margin</Text></View>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>Net Income</Text></View>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>EPS</Text></View>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>Free Cash Flow</Text></View>
          </View>
          {fundamentals.slice(0, 10).map((f) => (
            <View style={styles.tableRow} key={f.year}>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{f.year}</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{formatNumber(f.revenue, true)}</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{formatNumber(f.grossMargin, false, true)}</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{formatNumber(f.netIncome, true)}</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{formatNumber(f.eps, true)}</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{formatNumber(f.fcf, true)}</Text></View>
            </View>
          ))}
        </View>

        {/* AI Insights */}
        {aiInsight && (
          <View>
            <Text style={styles.sectionTitle}>Executive Summary (AI Generated)</Text>
            <Text style={styles.textBlock}>{aiInsight.executiveSummary}</Text>
            
            <Text style={styles.sectionTitle}>Economic Moat</Text>
            <Text style={styles.textBlock}>{aiInsight.moat}</Text>

            <Text style={styles.sectionTitle}>Key Catalysts</Text>
            {aiInsight.catalysts.map((c, i) => (
              <View style={styles.listItem} key={i}>
                <Text style={styles.bulletPoint}>•</Text>
                <Text style={styles.listItemContent}>
                  <Text style={{fontWeight: 'bold', color: '#09090b'}}>{c.title}: </Text>
                  {c.desc}
                </Text>
              </View>
            ))}

            <Text style={styles.sectionTitle}>Risk Factors</Text>
            {aiInsight.risks.map((r, i) => (
              <View style={styles.listItem} key={i}>
                <Text style={styles.bulletPoint}>•</Text>
                <Text style={styles.listItemContent}>
                  <Text style={{fontWeight: 'bold', color: '#09090b'}}>{r.title}: </Text>
                  {r.desc}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>BullQuant Analytics — Confidential & Proprietary</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => (
            `Page ${pageNumber} of ${totalPages}`
          )} />
        </View>
      </Page>
    </Document>
  );
};

export default PremiumPdfReport;
