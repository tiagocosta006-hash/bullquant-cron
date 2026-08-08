const fs = require('fs');
const path = require('path');

const emailsDir = path.join(__dirname, '../emails');
const files = fs.readdirSync(emailsDir).filter(f => f.endsWith('.tsx'));

const imgRegex = /<Img[\s\S]*?className="my-0 mx-auto"\s*\/>/;

const textLogo = `<Text className="text-foreground text-[28px] font-extrabold tracking-tight m-0 p-0">
                Bull<span className="text-[#d6a64a]">Value</span>
              </Text>`;

for (const file of files) {
  const filePath = path.join(emailsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace image with text logo
  content = content.replace(imgRegex, textLogo);

  // Replace default param in Welcome and Upgrade
  content = content.replace(/userFirstName = "Investidor"/g, 'userFirstName = "{{ nome }}"');
  content = content.replace(/Olá \{userFirstName\},/g, 'Olá {userFirstName},'); // unchanged, just making sure

  // Replace Supabase complex string with simple Resend variable
  content = content.replace(/Olá \{"\{\{ if \.Data\.name \}\}\{\{ \.Data\.name \}\}\{\{ else \}\}Investidor\{\{ end \}\}"\},/g, 'Olá {"{{ nome }}"},');

  fs.writeFileSync(filePath, content);
  console.log(`Updated ${file}`);
}
