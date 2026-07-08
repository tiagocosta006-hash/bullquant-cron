import json
import re

with open("scripts/kpi_definitions.json") as f:
    kpi_defs = json.load(f)

with open("/Users/tiagocosta18/.gemini/antigravity/brain/b296142d-5e1b-43a7-afeb-ddec21b5f615/scratch/kpi_text_chunks.json") as f:
    data = json.load(f)

for ticker, items in data.items():
    defs = kpi_defs.get(ticker, [])
    for item in items:
        text = item['text'].lower()
        for d in defs:
            for kw in d['keywords']:
                if kw.lower() in text:
                    idx = text.find(kw.lower())
                    start = max(0, idx - 60)
                    end = min(len(text), idx + 100)
                    print(f"[{ticker} {item['fiscalYear']} Q{item['fiscalQuarter']}] {d['name']} ({kw}):")
                    print("..." + item['text'][start:end].replace('\n', ' ') + "...")
                    print()
                    break
