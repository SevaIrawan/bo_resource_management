/**
 * Rebuild handbook HTML only (skip PDF/DOCX when Chrome unavailable).
 * Usage: node scripts/build-handbook-html-only.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'docs', 'guides', '_source');
const outRoot = path.join(root, 'docs', 'guides', 'documents');
const cssPath = path.join(root, 'docs', 'guides', 'confluence.css');
const css = fs.readFileSync(cssPath, 'utf8');

const GUIDES = [
  {
    src: 'HANDBOOK-en.md',
    lang: 'en',
    folder: 'EN',
    coverTitle: 'Resource Management',
    coverSubtitle: 'Official User Guide',
    htmlName: 'Resource-Management-User-Guide-EN.html',
  },
  {
    src: 'HANDBOOK-zh.md',
    lang: 'zh-CN',
    folder: 'ZH',
    coverTitle: '资源管理',
    coverSubtitle: '官方用户手册',
    htmlName: 'Resource-Management-User-Guide-ZH.html',
  },
];

function extractMeta(md) {
  const meta = {};
  const tableMatch = md.match(/^\|[\s\S]*?\n\n/m);
  if (!tableMatch) return meta;
  const rows = tableMatch[0].split('\n').filter((l) => l.includes('|') && !l.match(/^\|[-\s|]+\|/));
  for (const row of rows) {
    const cells = row
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length >= 2 && cells[0] !== '---') {
      meta[cells[0].replace(/\*\*/g, '')] = cells[1].replace(/\*\*/g, '');
    }
  }
  return meta;
}

function mdToHtmlDocument(md, guide) {
  const meta = extractMeta(md);
  const version = meta['App version'] || meta['应用版本'] || '1.0.37';
  const body = marked.parse(md);
  return `<!DOCTYPE html>
<html lang="${guide.lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${guide.coverTitle} — ${guide.coverSubtitle}</title>
  <style>${css}</style>
</head>
<body>
  <header class="doc-cover">
    <h1>${guide.coverTitle}</h1>
    <p class="subtitle">${guide.coverSubtitle}</p>
    <p class="meta">Version ${version}</p>
  </header>
  ${body}
</body>
</html>
`;
}

for (const guide of GUIDES) {
  const mdPath = path.join(sourceDir, guide.src);
  const md = fs.readFileSync(mdPath, 'utf8');
  const html = mdToHtmlDocument(md, guide);
  const outDir = path.join(outRoot, guide.folder);
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, guide.htmlName);
  fs.writeFileSync(out, html, 'utf8');
  console.log(`OK HTML ${guide.folder}/${guide.htmlName}`);
}
