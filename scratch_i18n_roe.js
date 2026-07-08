const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'messages');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

for (const file of files) {
  const filePath = path.join(dir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  if (data && data.financials && data.financials.ratios) {
    if (!data.financials.ratios.roe) {
      data.financials.ratios.roe = "ROE";
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
      console.log(`Added roe to ${file}`);
    }
  }
}
