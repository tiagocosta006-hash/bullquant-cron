import json
import sys
import os

def append_kpis():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/append_kpis.py TICKER1 TICKER2...")
        return
        
    tickers = sys.argv[1:]
    
    try:
        with open("scripts/kpi_definitions.json", "r") as f:
            data = json.load(f)
    except FileNotFoundError:
        data = {}
        
    for ticker in tickers:
        try:
            with open(f"scratch/{ticker}_kpi.json", "r") as f:
                kpi_result = json.load(f)
                
            if "kpis" in kpi_result:
                data[ticker] = kpi_result["kpis"]
                print(f"Added KPIs for {ticker} to definitions.")
                
                # Append to markdown log
                markdown_path = "/Users/tiagocosta18/.gemini/antigravity/brain/b296142d-5e1b-43a7-afeb-ddec21b5f615/mda_insights.md"
                try:
                    with open(markdown_path, "a") as md:
                        md.write(f"\n## {ticker}\n")
                        md.write("### KPIs Extraídos\n")
                        for kpi in kpi_result["kpis"]:
                            name = kpi.get('name', 'N/A') if isinstance(kpi, dict) else kpi
                            unit = kpi.get('unit', 'N/A') if isinstance(kpi, dict) else 'N/A'
                            md.write(f"- **{name}** ({unit})\n")
                        
                        if "additional_insights" in kpi_result and kpi_result["additional_insights"]:
                            md.write("\n### Notas & Insights\n")
                            insights = kpi_result["additional_insights"]
                            if isinstance(insights, str):
                                md.write(f"- {insights}\n")
                            else:
                                for insight in insights:
                                    md.write(f"- {insight}\n")
                        md.write("\n---\n")
                except Exception as ex:
                    print(f"Warning: could not write to markdown for {ticker}: {ex}")
            else:
                print(f"No KPIs found for {ticker} in JSON.")
        except Exception as e:
            print(f"Error reading JSON for {ticker}: {e}")
            
    with open("scripts/kpi_definitions.json", "w") as f:
        json.dump(data, f, indent=2)
        
    print("kpi_definitions.json updated successfully.")
    
    with open("scripts/kpi_definitions.json", "w") as f:
        json.dump(data, f, indent=4)
        print("Successfully saved updated kpi_definitions.json")
        
if __name__ == "__main__":
    append_kpis()
