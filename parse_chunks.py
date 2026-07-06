import json

with open('/Users/tiagocosta18/.gemini/antigravity/brain/b296142d-5e1b-43a7-afeb-ddec21b5f615/scratch/kpi_text_chunks.json', 'r') as f:
    data = json.load(f)

for ticker, chunks in data.items():
    print(f"\n--- {ticker} ---")
    for chunk in chunks:
        period = f"{chunk['fiscalYear']} Q{chunk['fiscalQuarter']}"
        text = chunk['text']
        sentences = [s.strip() for s in text.split('. ') if '%' in s and ('comparable' in s.lower() or 'comp' in s.lower())]
        if sentences:
            print(f"[{period}]")
            for s in list(set(sentences))[:5]:
                print(s)
