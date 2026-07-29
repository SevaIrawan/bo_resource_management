#!/usr/bin/env node
/**
 * Build HTML Confluence paste dari docs/PANDUAN-PENGGUNA-SIMPLE.md
 * Jalankan: node scripts/build-panduan-confluence.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = path.join(root, 'docs', 'PANDUAN-PENGGUNA-SIMPLE.md');

const CONFLUENCE_STYLES = `
    body { font-family: Segoe UI, Arial, sans-serif; font-size: 14px; line-height: 1.55; max-width: 920px; margin: 24px auto; color: #172b4d; }
    h1 { font-size: 24px; border-bottom: 2px solid #0052cc; padding-bottom: 8px; margin-top: 0; }
    h2 { font-size: 18px; margin-top: 28px; color: #0052cc; border-bottom: 1px solid #dfe1e6; padding-bottom: 4px; }
    h3 { font-size: 15px; margin-top: 20px; color: #172b4d; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0 20px; font-size: 13px; }
    th, td { border: 1px solid #c1c7d0; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #f4f5f7; font-weight: 600; }
    .panel { border-radius: 4px; padding: 12px 14px; margin: 16px 0; border-left: 4px solid; }
    .info { background: #deebff; border-color: #0052cc; }
    .warning { background: #fffae6; border-color: #ff991f; }
    .tip { background: #e3fcef; border-color: #00875a; }
    .panel-title { font-weight: 700; margin-bottom: 6px; }
    pre { background: #f4f5f7; border: 1px solid #dfe1e6; padding: 12px; overflow-x: auto; font-size: 12px; line-height: 1.4; white-space: pre-wrap; }
    code { background: #f4f5f7; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
    ul, ol { margin: 8px 0 16px; padding-left: 24px; }
    li { margin: 4px 0; }
    a { color: #0052cc; }
    hr { border: none; border-top: 1px solid #dfe1e6; margin: 24px 0; }
    blockquote { margin: 16px 0; padding: 12px 14px; background: #deebff; border-left: 4px solid #0052cc; border-radius: 0 4px 4px 0; }
    blockquote p { margin: 0; }
    .paste-hint { font-size: 12px; color: #5e6c84; margin-bottom: 20px; }
    .doc-footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #dfe1e6; font-size: 12px; color: #5e6c84; }
`;

function slugify(text) {
  return String(text)
    .replace(/<[^>]+>/g, '')
    .trim()
    .toLowerCase()
    .replace(/&/g, '-')
    .replace(/[^\w\u00c0-\u024f-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Ambil isi mulai bab 1 — tanpa judul, meta, blockquote intro, daftar isi MD. */
function stripMetaAndToc(md) {
  const start = md.search(/^## 1\./m);
  if (start >= 0) return md.slice(start).trim();
  return md.replace(/^#[\s\S]*?^## /m, '## ').trim();
}

function extractVersion(md) {
  const m = md.match(/\*\*Versi app:\*\*\s*([^\n]+)/);
  return m ? m[1].trim() : '1.0.34';
}

function extractIntro(md) {
  const m = md.match(/^>\s+(.+)$/m);
  if (!m) return '';
  return m[1]
    .replace(/&/g, '&amp;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .trim();
}

function mdToBodyHtml(md) {
  const headings = [];
  const renderer = new marked.Renderer();

  renderer.heading = function ({ text, depth }) {
    const plain = String(text).replace(/<[^>]+>/g, '');
    const id = slugify(plain);
    if (depth === 2) headings.push({ id, text: plain });
    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
  };

  renderer.hr = () => '<hr />\n';

  marked.setOptions({ gfm: true, breaks: false, renderer });
  return { html: marked.parse(md), headings };
}

function buildToc(headings) {
  if (!headings.length) return '';
  const items = headings
    .filter((h) => !/^daftar isi$/i.test(h.text))
    .map((h) => `<li><a href="#${h.id}">${h.text}</a></li>`)
    .join('\n');
  return `<h2 id="daftar-isi">Daftar isi</h2>\n<ol>${items}</ol>\n<hr />\n`;
}

function wrapHtml({ version, introHtml, tocHtml, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Panduan Group Monitoring v${version}</title>
  <style>${CONFLUENCE_STYLES}
  </style>
</head>
<body>

<h1>Panduan Group Monitoring</h1>

<div class="panel info">
  <div class="panel-title">Informasi dokumen</div>
  <table>
    <tr><th>Versi app</th><td>${version}</td></tr>
    <tr><th>Audiens</th><td>Tim Depart Resource Management (R&amp;M)</td></tr>
    <tr><th>Bahasa UI</th><td>English / 中文 — Settings → Language</td></tr>
    <tr><th>Modul</th><td>Group Monitoring — WhatsApp &amp; Telegram</td></tr>
  </table>
</div>

${introHtml ? `<blockquote><p>${introHtml}</p></blockquote>\n` : ''}
${tocHtml}
${bodyHtml}

<p class="doc-footer">Panduan operasional Group Monitoring v${version} — tim Depart Resource Management. Internal use only.</p>

</body>
</html>`;
}

const md = fs.readFileSync(srcPath, 'utf8');
const version = extractVersion(md);
const outPath = path.join(root, 'docs', 'guides', `Panduan-Group-Monitoring-v${version}-Confluence.html`);
const introHtml = extractIntro(md);
const bodyMd = stripMetaAndToc(md);
const { html: bodyHtml, headings } = mdToBodyHtml(bodyMd);
const tocHtml = buildToc(headings);
const full = wrapHtml({ version, introHtml, tocHtml, bodyHtml });

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, full, 'utf8');
console.log(`OK: ${path.relative(root, outPath)} (${Math.round(full.length / 1024)} KB)`);
