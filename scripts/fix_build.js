const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, search, replace) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.split(search).join(replace);
    
    // Also fix redirect('...') -> redirect({ href: '...' }) for next-intl
    // Only if the file imports redirect from @/i18n/routing
    if (content.includes("@/i18n/routing")) {
      content = content.replace(/redirect\((['"`][^'"`]+['"`])\)/g, "redirect({ href: $1 })");
      // Handle variables: redirect(someVar) -> redirect({ href: someVar })
      // A bit tricky, let's just do a simple regex for word chars if not wrapped in quotes
      content = content.replace(/redirect\(([a-zA-Z0-9_]+)\)/g, "redirect({ href: $1 })");
    }
    
    fs.writeFileSync(filePath, content);
  }
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!['node_modules', '.git', '.next'].includes(file)) {
        walkDir(fullPath);
      }
    } else if (/\.tsx?$/.test(file)) {
      replaceInFile(fullPath, "@/app/(auth)/actions", "@/app/[locale]/(auth)/actions");
      replaceInFile(fullPath, "@/app/(app)/settings/actions", "@/app/[locale]/(app)/settings/actions");
    }
  }
}

walkDir(path.join(__dirname, '../app'));
walkDir(path.join(__dirname, '../components'));
console.log("Fixes applied.");
