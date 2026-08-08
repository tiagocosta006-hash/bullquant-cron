const fs = require('fs');
const path = require('path');

const emailsDir = path.join(__dirname, '../emails');
const files = fs.readdirSync(emailsDir).filter(f => f.endsWith('.tsx'));

const textRegex = /<Text className="text-foreground text-\[28px\] font-extrabold tracking-tight m-0 p-0">\s*Bull<span className="text-\[#d6a64a\]">Value<\/span>\s*<\/Text>/m;

const imgLogo = `<Img src="https://thebullvalue.com/brand/logo.svg" height="40" alt="BullValue" className="my-0 mx-auto" />`;

for (const file of files) {
  const filePath = path.join(emailsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace text logo with image
  if (content.match(textRegex)) {
    content = content.replace(textRegex, imgLogo);
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  } else {
    console.log(`Did not find text logo in ${file}`);
  }
}
