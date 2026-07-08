import requests
import json

# Focus groups based on audit results
groups = {
    'EPS_MISSING': ['V', 'WMT', 'KO', 'CRM', 'CVS'],
    'DEBT_MISSING': ['PLTR', 'DDOG', 'NOW', 'GM', 'EA'],
    'OPEX_MISSING': ['CDNS', 'MCD', 'SBUX', 'DIS', 'TJX'],
    'GROSS_PROFIT_MISSING': ['MCD', 'LUV', 'GM', 'KR', 'CMG']
}

# Fetch CIKs mapping from prisma (using node script)
