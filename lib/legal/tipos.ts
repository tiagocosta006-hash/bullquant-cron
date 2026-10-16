export type Bloco = {
  h?: string
  p?: string[]
  ul?: string[]
  ol?: string[]
  tabela?: { cabecalho: string[]; linhas: string[][] }
  /** Destaque (caixa) para avisos que não podem passar despercebidos. */
  destaque?: string
}
export type Documento = { titulo: string; descricao: string; intro?: string[]; blocos: Bloco[] }
export type Conteudo = Record<"pt" | "en", Documento>
