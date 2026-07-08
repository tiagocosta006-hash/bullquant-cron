/**
 * Parser CSV minimalista — sem dependências externas.
 * Cobre o caso comum de exports de brokers: vírgula ou ponto-e-vírgula como
 * separador, campos entre aspas opcionais. Não cobre vírgulas escapadas dentro
 * de campos sem aspas.
 */
export type ParsedCsv = {
  headers: string[]
  rows: string[][]
}

function detectDelimiter(firstLine: string): string {
  const commaCount = (firstLine.match(/,/g) || []).length
  const semicolonCount = (firstLine.match(/;/g) || []).length
  return semicolonCount > commaCount ? ";" : ","
}

function parseLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

export function parseCsv(text: string): ParsedCsv {
  const lines = text.split(/\r\n|\n|\r/).filter(line => line.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  const delimiter = detectDelimiter(lines[0])
  const headers = parseLine(lines[0], delimiter)
  const rows = lines.slice(1).map(line => parseLine(line, delimiter))

  return { headers, rows }
}
