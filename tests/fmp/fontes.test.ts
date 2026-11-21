import { describe, expect, it } from "vitest"
import { num, dataUs, fimDoMes, simboloNasdaq } from "@/lib/fontes/nasdaq"
import { desachatar } from "@/lib/fontes/stockanalysis"

describe("Nasdaq: texto → números e datas", () => {
  it("lê preços, percentagens e milhares", () => {
    expect(num("$342.56")).toBe(342.56)
    expect(num("-1.90%")).toBe(-1.9)
    expect(num("40,906,860")).toBe(40906860)
    expect(num(12.3)).toBe(12.3)
  })
  it("N/A e vazios são null, nunca 0", () => {
    expect(num("N/A")).toBeNull()
    expect(num("")).toBeNull()
    expect(num("--")).toBeNull()
    expect(num(undefined)).toBeNull()
  })
  it("datas americanas e fim do ano fiscal", () => {
    expect(dataUs("11/19/2026")).toBe("2026-11-19")
    expect(dataUs("2026-11-19")).toBeNull()
    expect(fimDoMes("Sep 2027")).toBe("2027-09-30")
    expect(fimDoMes("Feb 2028")).toBe("2028-02-29")
  })
  it("classes de ações ficam com ponto", () => {
    expect(simboloNasdaq("BRK.B")).toBe("brk.b")
  })
})

describe("stockanalysis: formato devalue do SvelteKit", () => {
  it("resolve referências por índice, arrays e objetos aninhados", () => {
    // { estimates: { dates: ["2027-09-30"], revenue: [528e9, "[PRO]"] }, nada: undefined }
    const plano = [{ estimates: 1, nada: -1 }, { dates: 2, revenue: 4 }, [3], "2027-09-30", [5, 6], 528e9, "[PRO]"]
    expect(desachatar(plano)).toEqual({
      estimates: { dates: ["2027-09-30"], revenue: [528e9, "[PRO]"] },
      nada: undefined,
    })
  })
})
