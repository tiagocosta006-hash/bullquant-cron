import { describe, it, expect } from "vitest";
import {
  extractAnnualSections,
  filingHtmlToLines,
  isSectionedText,
  SECTION_MARKER,
} from "@/lib/ai/filingSections";

/**
 * Casos tirados de filings reais (2026-11-04). O que importa não é o recorte
 * exato, é que o modelo receba o NEGÓCIO e os RISCOS — sem eles, o Analista IA
 * da Apple dizia "moat NONE" com zero KPIs.
 */

const para = (text: string, times = 1) => `<p>${Array(times).fill(text).join(" ")}</p>`;
const filler = (word: string) => para(`${word} lorem ipsum dolor sit amet consectetur.`, 60); // ~3.000 chars

// Índice ao estilo da Apple: cada célula colada à seguinte, sem espaço depois do ponto.
const appleToc = `
<table>
  <tr><td>Part I</td></tr>
  <tr><td>Item 1.</td><td>Business</td><td>1</td></tr>
  <tr><td>Item 1A.</td><td>Risk Factors</td><td>5</td></tr>
  <tr><td>Item 7.</td><td>Management’s Discussion and Analysis</td><td>23</td></tr>
  <tr><td>Item 8.</td><td>Financial Statements</td><td>30</td></tr>
</table>`;

const tenK = (toc: string) => `
<html><body>
  <div style="display:none"><ix:header>aapl-20260926 0000320193 2026 FY FALSE</ix:header></div>
  ${toc}
  <div>PART I</div>
  <div>Item 1. Business</div>
  ${para("Company Background The Company designs smartphones and wearables.")}
  ${filler("BUSINESS")}
  ${para("See Part II, “Item 7. Management’s Discussion and Analysis” for more.")}
  ${filler("ECOSYSTEM")}
  <div>Item 1A. Risk Factors</div>
  ${filler("RISK")}
  <div>Item 1B. Unresolved Staff Comments</div>
  ${para("None.")}
  <div>Item 7. Management’s Discussion and Analysis of Financial Condition</div>
  ${filler("MDA")}
  <div>Item 8. Financial Statements and Supplementary Data</div>
  ${filler("BALANCE")}
</body></html>`;

describe("extractAnnualSections — 10-K", () => {
  const out = extractAnnualSections(filingHtmlToLines(tenK(appleToc)), "10-K");

  it("apanha o Item 1 e o 1A mesmo com o índice colado (caso Apple)", () => {
    expect(out).toContain("=== ITEM 1. BUSINESS ===");
    expect(out).toContain("Company Background");
    expect(out).toContain("=== ITEM 1A. RISK FACTORS ===");
    expect(out).toContain("RISK lorem");
    expect(out).toContain("=== ITEM 7. MANAGEMENT’S DISCUSSION AND ANALYSIS ===");
    expect(out).toContain("MDA lorem");
  });

  it("uma remissão a meio do texto não corta a secção do negócio", () => {
    const business = out.split("=== ITEM 1A.")[0];
    expect(business).toContain("ECOSYSTEM lorem");
  });

  it("deixa de fora o índice, as demonstrações financeiras e o cabeçalho XBRL", () => {
    expect(out).not.toContain("BALANCE lorem");
    expect(out).not.toContain("0000320193");
    expect(out.match(/Item 1\. Business/g)?.length).toBe(1);
  });

  it("começa pelo marcador — é o que invalida a cache antiga", () => {
    expect(out.startsWith(SECTION_MARKER)).toBe(true);
    expect(isSectionedText(out)).toBe(true);
    expect(isSectionedText("Item 7. Management’s Discussion…")).toBe(false);
  });

  it("aceita cabeçalhos em maiúsculas e com travessão (KO, Costco)", () => {
    const html = `
      <div>ITEM 1—BUSINESS</div>${filler("COLA")}
      <div>ITEM 1A—RISK FACTORS</div>${filler("SUGAR")}
      <div>ITEM 7—MANAGEMENT'S DISCUSSION AND ANALYSIS</div>${filler("VOLUME")}`;
    const text = extractAnnualSections(filingHtmlToLines(html), "10-K");
    expect(text).toContain("COLA lorem");
    expect(text).toContain("SUGAR lorem");
    expect(text).toContain("VOLUME lorem");
  });

  it("respeita os tetos por secção e o total", () => {
    const html = `
      <div>Item 1. Business</div>${Array(20).fill(filler("LONG")).join("")}
      <div>Item 1A. Risk Factors</div>${Array(20).fill(filler("RISK")).join("")}
      <div>Item 7. Management’s Discussion and Analysis</div>${Array(40).fill(filler("MDA")).join("")}`;
    const text = extractAnnualSections(filingHtmlToLines(html), "10-K", 100_000);
    const [business] = text.split("=== ITEM 1A.");
    expect(business.length).toBeLessThanOrEqual(40_000 + 100);
    expect(text.length).toBeLessThanOrEqual(100_000 + 300);
    expect(text).toContain("MDA lorem");
  });

  it("Item 7 só com remissão: vai buscar o MD&A pelo título (caso JPMorgan)", () => {
    const html = `
      <div>Item 1. Business</div>${filler("BANK")}
      <div>Item 1A. Risk Factors</div>${filler("CREDIT")}
      <div>Item 7. Management’s Discussion and Analysis of Financial Condition and Results of Operations.</div>
      ${para("Management’s discussion and analysis of financial condition and results of operations, entitled “Management’s discussion and analysis”, appears on pages 50 through 160.")}
      <div>Item 7A. Quantitative and Qualitative Disclosures About Market Risk.</div>
      ${para("See the Market Risk Management section.")}
      <div>Item 8. Financial Statements</div>
      ${para("See pages 170 through 300.")}
      <div>Management’s discussion and analysis</div>
      ${filler("NETINTEREST")}`;
    const text = extractAnnualSections(filingHtmlToLines(html), "10-K");
    expect(text).toContain("CREDIT lorem");
    expect(text).toContain("NETINTEREST lorem");
  });
});

describe("extractAnnualSections — 20-F e sem secções", () => {
  it("20-F: Item 4, Item 3 (riscos) e Item 5", () => {
    const html = `
      <div>ITEM 3 KEY INFORMATION</div>${filler("RISKS")}
      <div>ITEM 4 INFORMATION ON THE COMPANY</div>${filler("INSULIN")}
      <div>ITEM 5 OPERATING AND FINANCIAL REVIEW AND PROSPECTS</div>${filler("SALES")}
      <div>ITEM 6 DIRECTORS</div>${filler("BOARD")}`;
    const text = extractAnnualSections(filingHtmlToLines(html), "20-F");
    expect(text.indexOf("INSULIN")).toBeLessThan(text.indexOf("RISKS"));
    expect(text).toContain("SALES lorem");
    expect(text).not.toContain("BOARD lorem");
  });

  it("sem cabeçalhos 'Item' (ASML): manda o início do documento, não o fim", () => {
    // O índice de remissões do fim tem uma linha com o título do Item 5 —
    // não pode ser confundida com a secção.
    const html = `${filler("STRATEGY")}${Array(80).fill(filler("NOTES")).join("")}
      <div>Operating and financial review and prospects</div>${filler("CROSSREF")}`;
    const text = extractAnnualSections(filingHtmlToLines(html), "20-F", 10_000);
    expect(text).toContain("RELATÓRIO ANUAL — INÍCIO");
    expect(text).toContain("STRATEGY lorem");
    expect(text).not.toContain("CROSSREF lorem");
    expect(isSectionedText(text)).toBe(true);
  });
});
