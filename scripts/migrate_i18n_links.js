const fs = require('fs');
const path = require('path');

const targetImports = ['useRouter', 'usePathname', 'redirect'];

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1. Replace default Link import
  const linkRegex = /import\s+Link\s+from\s+['"]next\/link['"];?/g;
  if (linkRegex.test(content)) {
    content = content.replace(linkRegex, `import { Link } from '@/i18n/routing';`);
    changed = true;
  }

  // 1b. Replace named Link import (if any, like import { default as Link } ...) - rare but let's check
  // Usually it's just import Link from 'next/link'

  // 2. Process next/navigation imports
  const navRegex = /import\s+\{([^}]+)\}\s+from\s+['"]next\/navigation['"];?/g;
  let match;
  let hasNavChanges = false;
  let navReplacements = [];

  content = content.replace(navRegex, (fullMatch, importsString) => {
    const imports = importsString.split(',').map(s => s.trim()).filter(Boolean);
    const toMove = imports.filter(i => targetImports.includes(i));
    const toKeep = imports.filter(i => !targetImports.includes(i));

    if (toMove.length === 0) return fullMatch; // nothing to do

    changed = true;
    hasNavChanges = true;

    navReplacements.push(`import { ${toMove.join(', ')} } from '@/i18n/routing';`);

    if (toKeep.length === 0) {
      return ''; // remove the import entirely
    } else {
      return `import { ${toKeep.join(', ')} } from 'next/navigation';`;
    }
  });

  if (hasNavChanges) {
    // Add the new imports near the top
    // Find the last import statement to append after, or just prepend
    const lastImportIndex = content.lastIndexOf('import ');
    if (lastImportIndex !== -1) {
      const endOfLine = content.indexOf('\n', lastImportIndex);
      content = content.slice(0, endOfLine + 1) + navReplacements.join('\n') + '\n' + content.slice(endOfLine + 1);
    } else {
      content = navReplacements.join('\n') + '\n' + content;
    }
  }

  if (changed) {
    // Basic cleanup for consecutive newlines created by replacements
    content = content.replace(/\n{3,}/g, '\n\n');
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!['node_modules', '.git', '.next'].includes(file)) {
        walkDir(fullPath);
      }
    } else if (/\.tsx?$/.test(file)) {
      processFile(fullPath);
    }
  }
}

console.log('Starting migration...');
walkDir(path.join(__dirname, '../app'));
walkDir(path.join(__dirname, '../components'));
console.log('Done.');
