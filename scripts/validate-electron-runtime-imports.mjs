/**
 * Cegah regresi: `import type { BrowserWindow }` + pemakaian runtime BrowserWindow.*
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronRoot = path.join(root, 'electron');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(electronRoot)) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const src = fs.readFileSync(file, 'utf8');
  const typeOnly =
    src.includes("import type { BrowserWindow }") ||
    (src.includes('type BrowserWindow') && !/import \{[^}]*BrowserWindow[^}]*\} from 'electron'/.test(src));
  const runtimeUse = /BrowserWindow\.[a-zA-Z]/.test(src);
  const valueImport = /import \{[^}]*\bBrowserWindow\b[^}]*\} from 'electron'/.test(src);

  if (runtimeUse && !valueImport) {
    offenders.push(rel);
  }
}

if (offenders.length) {
  console.error('FAIL  Electron files use BrowserWindow at runtime without value import:');
  for (const f of offenders) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('OK  Semua pemakaian BrowserWindow.* punya import runtime dari electron');
console.log('\nElectron runtime import audit passed.');
