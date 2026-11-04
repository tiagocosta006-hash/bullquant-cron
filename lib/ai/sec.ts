import { prisma } from "@/lib/prisma";
import { extractAnnualSections, filingHtmlToLines, isSectionedText } from "@/lib/ai/filingSections";

// User-Agent obrigatório da SEC (≤10 req/s). Mantido igual ao já usado na app.
const SEC_HEADERS = { "User-Agent": "BullValue Analyst (suporte@thebullvalue.com)" };

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

/** Descarrega o HTML do filing (o recorte por secções precisa da estrutura, não só do texto). */
export async function fetchFilingHtml(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: SEC_HEADERS });
  if (!res.ok) return null;
  return res.text();
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
  // A cache antiga é a janela fixa de 160k, que em muitos 10-K deixava de fora
  // o Item 1 e o 1A (ver lib/ai/filingSections.ts). Sem o marcador das secções,
  // volta a descarregar-se e a linha é reescrita.
  if (cached && isSectionedText(cached.text)) {
    return {
      url: cached.url,
      text: cached.text,
      form: cached.form,
      accession: cached.accession,
      label: cached.form,
    };
  }

  const html = await fetchFilingHtml(latest.url);
  if (!html) return null;
  const text = extractAnnualSections(filingHtmlToLines(html), latest.form);

  // Persistir para o chat / próximas gerações. Best-effort — falha de escrita
  // não deve rebentar a geração do relatório.
  try {
    await prisma.filingCache.upsert({
      where: { companyId_accession: { companyId: company.id, accession: latest.accession } },
      // fetchedAt explícito: o chat lê o filing mais recente por fetchedAt.
      update: { text, url: latest.url, form: latest.form, fetchedAt: new Date() },
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
