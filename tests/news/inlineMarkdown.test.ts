import { describe, it, expect } from "vitest";

/**
 * Espelha a divisão feita pelo `InlineMarkdown` de components/news/shared.tsx.
 * Testamos a partição do texto (a lógica), não o JSX — o projeto não tem
 * ambiente de testes de componentes configurado.
 */
function partir(text: string): string[] {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).filter(Boolean);
}

function classificar(parte: string): "strong" | "em" | "texto" {
  if (parte.startsWith("**") && parte.endsWith("**") && parte.length > 4) return "strong";
  if (parte.startsWith("*") && parte.endsWith("*") && parte.length > 2) return "em";
  return "texto";
}

const render = (t: string) => partir(t).map((p) => [classificar(p), p] as const);

describe("InlineMarkdown", () => {
  // Regressão: o redator põe termos ingleses em itálico, e sem isto os
  // asteriscos apareciam literais na página ("*private placement*").
  it("marca termos em itálico", () => {
    expect(render("uma transação sob a forma de *private placement* direta")).toEqual([
      ["texto", "uma transação sob a forma de "],
      ["em", "*private placement*"],
      ["texto", " direta"],
    ]);
  });

  it("marca negrito antes de itálico", () => {
    expect(render("**muito** importante")).toEqual([
      ["strong", "**muito**"],
      ["texto", " importante"],
    ]);
  });

  it("lida com vários termos no mesmo parágrafo", () => {
    const r = render("o *guidance* e o *cash pile*");
    expect(r.filter(([tipo]) => tipo === "em").map(([, p]) => p)).toEqual([
      "*guidance*",
      "*cash pile*",
    ]);
  });

  it("deixa em paz um asterisco solto", () => {
    expect(render("lucro de 5 * 3 milhões")).toEqual([["texto", "lucro de 5 * 3 milhões"]]);
  });

  it("não atravessa quebras de linha", () => {
    expect(render("linha um *\nlinha dois*")).toEqual([["texto", "linha um *\nlinha dois*"]]);
  });

  it("devolve o texto intacto quando não há marcação", () => {
    expect(render("texto simples sem marcação")).toEqual([
      ["texto", "texto simples sem marcação"],
    ]);
  });
});
