// Builds bullvision-foundations.html by inlining the real font files (SF Pro + Scotch)
// as base64 data-URIs into foundations.template.html (replacing the /*__FONTFACES__*/ marker).
//
// Portable: paths are resolved relative to this file, so it works from any session/checkout.
// Fonts are read from <repo>/public/fonts/. Run:  node build-foundations.js
// Then publish design/foundations/bullvision-foundations.html via the Claude Artifact tool.

const fs = require('fs');
const path = require('path');

const here = __dirname;                          // design/foundations
const repo = path.resolve(here, '..', '..');     // repo root
const sf = path.join(repo, 'public', 'fonts', 'sf-ui-text');
const scotch = path.join(repo, 'public', 'fonts', 'scotch-display');

function b64(p) { return fs.readFileSync(p).toString('base64'); }

// SF Pro = SF UI Text (Apple San Francisco). Scotch = one landing-hero display face only.
const faces = [
  { fam: 'SF Pro', w: 300, s: 'normal', file: path.join(sf, 'SFUIText-Light.woff2'), fmt: 'woff2' },
  { fam: 'SF Pro', w: 400, s: 'normal', file: path.join(sf, 'SFUIText-Regular.woff2'), fmt: 'woff2' },
  { fam: 'SF Pro', w: 500, s: 'normal', file: path.join(sf, 'SFUIText-Medium.woff2'), fmt: 'woff2' },
  { fam: 'SF Pro', w: 600, s: 'normal', file: path.join(sf, 'SFUIText-Semibold.woff2'), fmt: 'woff2' },
  { fam: 'SF Pro', w: 700, s: 'normal', file: path.join(sf, 'SFUIText-Bold.woff2'), fmt: 'woff2' },
  { fam: 'SF Pro', w: 800, s: 'normal', file: path.join(sf, 'SFUIText-Heavy.woff2'), fmt: 'woff2' },
  { fam: 'Scotch', w: 700, s: 'italic', file: path.join(scotch, 'ScotchDisplay-BoldItalic.ttf'), fmt: 'truetype' },
];

let css = '';
for (const f of faces) {
  const mime = f.fmt === 'woff2' ? 'font/woff2' : 'font/ttf';
  css += `@font-face{font-family:"${f.fam}";font-style:${f.s};font-weight:${f.w};font-display:swap;src:url(data:${mime};base64,${b64(f.file)}) format("${f.fmt}");}\n`;
}

const tpl = fs.readFileSync(path.join(here, 'foundations.template.html'), 'utf8');
const out = tpl.replace('/*__FONTFACES__*/', css);
const outPath = path.join(here, 'bullvision-foundations.html');
fs.writeFileSync(outPath, out);

const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log(`Wrote ${outPath} (${kb} KB), ${faces.length} faces embedded`);
