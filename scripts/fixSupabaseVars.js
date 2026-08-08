const fs = require('fs');
const path = require('path');

const emailsDir = path.join(__dirname, '../emails');
const files = fs.readdirSync(emailsDir).filter(f => f.startsWith('Supabase') && f.endsWith('.tsx'));

for (const file of files) {
  const filePath = path.join(emailsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Revert back to Supabase Go template syntax
  content = content.replace(/Olá \{"\{\{ nome \}\}"\},/g, 'Olá {"{{ if .Data.name }}{{ .Data.name }}{{ else }}Investidor{{ end }}"},');
  
  fs.writeFileSync(filePath, content);
  console.log(`Reverted Supabase syntax in ${file}`);
}
