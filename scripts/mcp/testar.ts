/**
 * Testa o servidor MCP local como o Claude Desktop o usa (stdio).
 *
 *   npx tsx scripts/mcp/testar.ts '[["valuation",{"ticker":"MSCI"}]]'
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import * as path from "node:path"

;(async () => {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", path.join(__dirname, "bullvalue.ts")],
    env: { ...process.env } as Record<string, string>,
    stderr: "inherit",
  })
  const client = new Client({ name: "teste", version: "1" })
  await client.connect(transport)
  const { tools } = await client.listTools()
  console.log("ferramentas:", tools.map((t) => t.name).join(", "))
  const chamadas: Array<[string, Record<string, unknown>]> = JSON.parse(process.argv[2] ?? "[]")
  for (const [nome, args] of chamadas) {
    const r = await client.callTool({ name: nome, arguments: args })
    const txt = (r.content as Array<{ text: string }>)[0]?.text ?? ""
    console.log(`\n=== ${nome} ${JSON.stringify(args)}${r.isError ? " [ERRO]" : ""}\n${txt.slice(0, 1400)}`)
  }
  await client.close()
})()
