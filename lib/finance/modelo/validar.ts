import { z } from "zod"
import type { ConjuntoCenarios } from "./cenarios"

/**
 * Validação do modelo guardado. O cliente manda o ConjuntoCenarios inteiro e o
 * servidor não confia nele: números finitos e dentro de limites sãos, séries com
 * o comprimento do horizonte, texto limitado. Um modelo guardado é lido de volta
 * por outra sessão (e pode vir a ser partilhado), por isso entra limpo ou não entra.
 */

export const MAX_TESE = 3000
export const MAX_TITULO = 80

const num = (min: number, max: number) => z.number().finite().min(min).max(max)

const pressupostos = z
  .object({
    anos: z.number().int().min(3).max(15),
    modoReceita: z.enum(["total", "segmentos"]).optional(),
    receitaSegmentos: z
      .object({
        eixo: z.enum(["product", "geography"]),
        outros: num(-1e15, 1e15),
        segmentos: z
          .array(z.object({ nome: z.string().max(120), base: num(-1e15, 1e15), crescimento: z.array(num(-1, 5)).max(15) }))
          .max(40),
      })
      .nullable()
      .optional(),
    drivers: z.record(z.string().max(40), z.array(num(-5, 1000)).max(15)),
    avaliacao: z.object({
      rf: num(-0.05, 0.3), erp: num(0, 0.3), beta: num(-1, 5), custoDivida: num(0, 0.5), taxaImpostoWacc: num(0, 0.6),
      waccManual: num(0, 0.6).nullable(), g: num(-0.05, 0.1), multiploSaida: num(0, 200),
      metodoTerminal: z.enum(["gordon", "multiplo", "media"]), meioDoAno: z.boolean(),
    }),
  })
  .superRefine((p, ctx) => {
    for (const [k, v] of Object.entries(p.drivers)) {
      if (v.length !== p.anos) ctx.addIssue({ code: "custom", message: `driver ${k}: ${v.length} anos, esperado ${p.anos}` })
    }
  })

export const conjuntoSchema = z.object({
  ativo: z.enum(["bear", "base", "bull"]),
  cenarios: z.object({ bear: pressupostos, base: pressupostos, bull: pressupostos }),
  probabilidades: z.object({ bear: num(0, 1), base: num(0, 1), bull: num(0, 1) }),
  tese: z.string().max(MAX_TESE).optional(),
})

export const guardarSchema = z.object({
  ticker: z.string().min(1).max(12),
  titulo: z.string().trim().max(MAX_TITULO).optional(),
  conjunto: conjuntoSchema,
  valorPorAcao: num(-1e9, 1e9).nullable().optional(),
  valorEsperado: num(-1e9, 1e9).nullable().optional(),
  preco: num(0, 1e9).nullable().optional(),
})

export type PedidoGuardar = z.infer<typeof guardarSchema>

/** O conjunto validado tem a forma do ConjuntoCenarios do modelo. */
export function comoConjunto(c: z.infer<typeof conjuntoSchema>): ConjuntoCenarios {
  return c as unknown as ConjuntoCenarios
}
