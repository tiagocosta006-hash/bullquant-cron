import requests
import json
import xml.etree.ElementTree as ET

headers = {"User-Agent": "Tiago Costa tiagocosta@example.com"}

url = "https://data.sec.gov/api/xbrl/companyfacts/CIK0001065280.json"
resp = requests.get(url, headers=headers)
if resp.status_code == 200:
    data = resp.json()
    facts = data.get("facts", {})
    print("Netflix namespaces:", facts.keys())
    
url = "https://data.sec.gov/api/xbrl/companyfacts/CIK0001318605.json"
resp = requests.get(url, headers=headers)
if resp.status_code == 200:
    data = resp.json()
    facts = data.get("facts", {})
    print("Tesla namespaces:", facts.keys())
