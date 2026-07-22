import * as cheerio from "cheerio";
import { prisma } from "@/lib/prisma";

// User-Agent obrigatório da SEC (≤10 req/s). Mantido igual ao já usado na app.
const SEC_HEADERS = { "User-Agent": "BullValue Analyst (tiago@bullquant.com)" };

const ANNUAL_FORMS = ["10-K", "20-F", "40-F"];

export type LatestFiling = {
  url: string;
  accession: string;
  form: string;
};

/** Encontra o URL do último relatório anual (10-K / 20-F / 40-F) de um CIK. */
export async function getLatestAnnualFiling(cik: string): Promise<LatestFiling | null> {
  const cikPadded = cik.padStart(10, "0");
  const res = await fetch(`https://data.sec.gov/submissions/CIK${cikPadded}.json`, {
    headers: SEC_HEADERS,
  });
  if (!res.ok) return null;

  const data = await res.json();
  const recent = data?.filings?.recent || {};
  const forms: string[] = recent.form || [];
  const accessions: string[] = recent.accessionNumber || [];
  const primaryDocs: string[] = recent.primaryDocument || [];

  for (let i = 0; i < forms.length; i++) {
    if (ANNUAL_FORMS.includes(forms[i])) {
      const accNoDash = accessions[i].replace(/-/g, "");
      // O path usa o CIK sem zeros à esquerda.
      const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoDash}/${primaryDocs[i]}`;
      return { url, accession: accessions[i], form: forms[i] };
    }
  }
  return null;
}

/** Descarrega o HTML do filing e devolve o texto limpo. */
export async function fetchFilingText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: SEC_HEADERS });
  if (!res.ok) return null;
  const html = await res.text();
  const $ = cheerio.load(html);
  return $.text().replace(/\s+/g, " ").trim();
}

/**
 * Recorta a janela mais relevante do filing (MD&A / discussão operacional),
 * onde vivem os KPIs e o comentário da gestão — evita cortar a meio e cabe
 * confortavelmente no contexto do Gemini Flash.
 */
export function sliceRelevant(rawText: string, maxChars = 160_000): string {
  let start = rawText.indexOf("Item 7. Management");
  if (start === -1) start = rawText.indexOf("Item 7.");
  if (start === -1) start = rawText.indexOf("Item 5. Operating and Financial Review");
  if (start === -1) start = rawText.indexOf("Item 5.");
  // Sem cabeçalhos reconhecíveis → cai para a zona final, onde ficam os financeiros.
  if (start === -1 || start > rawText.length - 100_000) {
    start = Math.max(0, rawText.length - (maxChars + 100_000));
  }
  return rawText.substring(start, start + maxChars);
}

export type FilingResult = {
  url: string;
  text: string;
  form: string;
  accession: string;
  label: string; // ex: "10-K"
};

/**
 * Devolve o texto do último filing anual de uma empresa, servindo da cache
 * (FilingCache) quando disponível para evitar re-download de ~800KB.
 */
export async function getFilingForCompany(company: {
  id: string;
  cik: string | null;
}): Promise<FilingResult | null> {
  if (!company.cik) return null;

  const latest = await getLatestAnnualFiling(company.cik);
  if (!latest) return null;

  // Cache hit por (empresa, accession)?
  const cached = await prisma.filingCache.findUnique({
    where: { companyId_accession: { companyId: company.id, accession: latest.accession } },
  });
  if (cached) {
    return {
      url: cached.url,
      text: cached.text,
      form: cached.form,
      accession: cached.accession,
      label: cached.form,
    };
  }

  const rawText = await fetchFilingText(latest.url);
  if (!rawText) return null;
  const text = sliceRelevant(rawText);

  // Persistir para o chat / próximas gerações. Best-effort — falha de escrita
  // não deve rebentar a geração do relatório.
  try {
    await prisma.filingCache.upsert({
      where: { companyId_accession: { companyId: company.id, accession: latest.accession } },
      update: { text, url: latest.url, form: latest.form },
      create: {
        companyId: company.id,
        accession: latest.accession,
        form: latest.form,
        url: latest.url,
        text,
      },
    });
  } catch (e) {
    console.error("[sec] FilingCache upsert falhou:", e);
  }

  return {
    url: latest.url,
    text,
    form: latest.form,
    accession: latest.accession,
    label: latest.form,
  };
}
