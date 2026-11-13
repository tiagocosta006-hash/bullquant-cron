import { describe, expect, it } from "vitest"
import { emailValido, lerOrigem } from "@/lib/marketing"

describe("consentimento de marketing — validação", () => {
  it("aceita e-mails normais e recusa o resto", () => {
    expect(emailValido("ana@exemplo.pt")).toBe(true)
    expect(emailValido("ana.silva+bv@mail.co.uk")).toBe(true)
    expect(emailValido("ana@exemplo")).toBe(false)
    expect(emailValido("ana exemplo@x.pt")).toBe(false)
    expect(emailValido("")).toBe(false)
    expect(emailValido(42)).toBe(false)
    expect(emailValido("a".repeat(250) + "@x.pt")).toBe(false)
  })

  it("normaliza a origem para um identificador curto", () => {
    expect(lerOrigem("stock-aapl")).toBe("stock-aapl")
    expect(lerOrigem("Pricing")).toBe("pricing")
    expect(lerOrigem("<script>")).toBe("script")
    expect(lerOrigem("x".repeat(80))).toHaveLength(40)
    expect(lerOrigem(undefined)).toBe("site")
    expect(lerOrigem("../../")).toBe("site")
  })
})
