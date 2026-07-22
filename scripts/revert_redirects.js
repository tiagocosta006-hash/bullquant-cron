const fs = require('fs');
const path = require('path');

function revertRedirect(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  if (content.includes("redirect({ href:")) {
    content = content.replace(/redirect\(\{ href: (['"`][^'"`]+['"`]) \}\)/g, "redirect($1)");
    content = content.replace(/redirect\(\{ href: ([a-zA-Z0-9_]+) \}\)/g, "redirect($1)");
    changed = true;
  }
  
  if (content.includes("redirect") && content.includes("@/i18n/routing")) {
    content = content.replace(/import\s+\{([^}]*)redirect([^}]*)\}\s+from\s+['"]@\/i18n\/routing['"];?/g, (match, p1, p2) => {
      const remaining = [p1.trim(), p2.trim()].filter(Boolean).join(', ');
      if (remaining.replace(/,/g, '').trim() === '') {
        return '';
      }
      return `import { ${remaining} } from '@/i18n/routing';`;
    });
    
    // Add import { redirect } from 'next/navigation' if it was removed
    if (!content.includes("import { redirect } from 'next/navigation'")) {
      content = `import { redirect } from 'next/navigation';\n` + content;
    }
    changed = true;
  }
  
  if (changed) {
    fs.writeFileSync(filePath, content);
  }
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!['node_modules', '.git', '.next'].includes(file)) walkDir(fullPath);
    } else if (/\.tsx?$/.test(file)) {
      revertRedirect(fullPath);
    }
  }
}

walkDir(path.join(__dirname, '../app'));
console.log('Reverted all redirects in app/');
