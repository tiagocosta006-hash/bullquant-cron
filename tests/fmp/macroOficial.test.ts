import { describe, expect, it } from "vitest"
import { lerFed, lerBea, lerCensus } from "@/lib/fontes/macroOficial"

describe("calendários oficiais", () => {
  it("Fed: decisão no último dia da reunião, às 14:00 ET; atas à parte; o resto não entra", () => {
    const json = "﻿" + JSON.stringify({
      events: [
        { month: "2026-12", days: "8-9", time: "2:00 p.m.", title: "FOMC Meeting", type: "FOMC" },
        { month: "2026-11", days: "18", time: "2:00 p.m.", title: "FOMC Minutes", type: "FOMC" },
        { month: "2026-12", days: "9", time: "2:30 p.m.", title: "FOMC Press Conference", type: "FOMC" },
        { month: "2026-11", days: "20", time: "9:00 a.m.", title: "Speech", type: "Speeches" },
      ],
    })
    expect(lerFed(json)).toEqual([
      { type: "FOMC", date: "2026-12-09", time: "14:00 ET", title: "Fed Interest Rate Decision", importance: "HIGH", fonte: "Fed" },
      { type: "FOMC", date: "2026-11-18", time: "14:00 ET", title: "FOMC Minutes", importance: "MEDIUM", fonte: "Fed" },
    ])
  })

  it("BEA: PIB e PCE com hora de Nova Iorque; linhas longas do ICS dobradas", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "SUMMARY:GDP (Second Estimate) and Corporate Profits\\, 3rd Quarter 2026",
      "DTSTART:20261125T133000Z",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:Personal Income and Outlays\\, October",
      "  2026",
      "DTSTART:20261125T133000Z",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:GDP by County and Personal Income by County\\, 2025",
      "DTSTART:20261202T133000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n")
    const ev = lerBea(ics)
    expect(ev.map((e) => [e.type, e.date, e.time, e.title])).toEqual([
      ["GDP", "2026-11-25", "08:30 ET", "GDP (Second Estimate)"],
      ["PCE", "2026-11-25", "08:30 ET", "PCE Price Index (Personal Income and Outlays)"],
    ])
  })

  it("Census: só a tabela das vendas a retalho mensais", () => {
    const html = `<h2>Advance Monthly Retail Trade Report</h2><table>
      <tr><td>September 2026</td><td>October 15, 2026</td></tr>
      <tr><td>October 2026</td><td>November 17, 2026</td></tr></table>
      <h2>Quarterly E-Commerce</h2><table><tr><td>3rd Quarter 2026</td><td>November 19, 2026</td></tr></table>`
    expect(lerCensus(html).map((e) => e.date)).toEqual(["2026-10-15", "2026-11-17"])
  })
})
