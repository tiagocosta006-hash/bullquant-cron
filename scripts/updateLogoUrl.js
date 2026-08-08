const fs = require('fs');
const path = require('path');

const emailsDir = path.join(__dirname, '../emails');
const files = fs.readdirSync(emailsDir).filter(f => f.endsWith('.tsx'));

const imgRegex = /<Img src="https:\/\/raw\.githubusercontent\.com\/alequece2\/bullquant\/main\/public\/brand\/logo\.svg"/;

for (const file of files) {
  const filePath = path.join(emailsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace github with thebullvalue.com
  if (content.match(imgRegex)) {
    content = content.replace(imgRegex, '<Img src="https://thebullvalue.com/brand/logo.svg"');
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
}
