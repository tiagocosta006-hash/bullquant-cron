# correcoes.json — correções revistas aos fundamentais

Lista de valores que a extração SEC dá errados e que corrigimos à mão. Cada correção aparece no
site com um mini aviso ("valor corrigido") e o motivo. Lido por `scripts/notas_valores.py`.

**Só entra o que tem `"revisto": true`**, e só se marca `true` com citação do relatório oficial
(10-K/20-F: nota ou linha da demonstração + link). Propostas do Gemini entram com `false` até
serem confirmadas.

```json
[
  {
    "ticker": "XYZ",
    "periodType": "ANNUAL",
    "fiscalYear": 2024,
    "fiscalQuarter": null,
    "field": "netIncome",
    "valor": 1234000000,
    "motivoPt": "O 10-K de 2024 (demonstração de resultados) indica 1 234 M; a tag XBRL usada incluía minoritários.",
    "motivoEn": "The 2024 10-K (income statement) reports 1,234M; the XBRL tag used included minority interests.",
    "fonteUrl": "https://www.sec.gov/Archives/edgar/data/.../",
    "accession": "0000000000-25-000000",
    "revisto": true
  }
]
```

`field` é o nome da coluna em `fundamentals`. Valores em USD (já convertidos) e na base atual de
ações (depois de splits e do rácio do ADS).
