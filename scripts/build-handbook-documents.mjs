#!/usr/bin/env node
/**
 * Build user guides as normal documents (Confluence style):
 * HTML + PDF + Word (.docx) — NOT Markdown for end users.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'docs', 'guides', '_source');
const outRoot = path.join(root, 'docs', 'guides', 'documents');
const cssPath = path.join(root, 'docs', 'guides', 'confluence.css');

const GUIDES = [
  {
    src: 'HANDBOOK-en.md',
    lang: 'en',
    folder: 'EN',
    coverTitle: 'Resource Management',
    coverSubtitle: 'Official User Guide',
    pdfName: 'Resource-Management-User-Guide-EN.pdf',
    docxName: 'Resource-Management-User-Guide-EN.docx',
    htmlName: 'Resource-Management-User-Guide-EN.html',
  },
  {
    src: 'HANDBOOK-zh.md',
    lang: 'zh-CN',
    folder: 'ZH',
    coverTitle: '资源管理',
    coverSubtitle: '官方用户手册',
    pdfName: 'Resource-Management-User-Guide-ZH.pdf',
    docxName: 'Resource-Management-User-Guide-ZH.docx',
    htmlName: 'Resource-Management-User-Guide-ZH.html',
  },
];

function extractMeta(md) {
  const meta = {};
  const tableMatch = md.match(/^\|[\s\S]*?\n\n/m);
  if (tableMatch) {
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
  }
  return meta;
}

function stripLeadingMetaAndToc(md) {
  let rest = md.replace(/^#\s+.+\n+/, '');
  rest = rest.replace(/^\|[\s\S]*?\n\n/, '');
  rest = rest.replace(/^## Table of contents[\s\S]*?\n---\n+/i, '');
  rest = rest.replace(/^## 目录[\s\S]*?\n---\n+/, '');
  return rest.trim();
}

function buildTocHtml(headings) {
  if (!headings.length) return '';
  const items = headings
    .map((h) => `<li><a href="#${h.id}">${h.text}</a></li>`)
    .join('\n');
  return `
<section class="doc-toc">
  <p class="doc-toc-title">${headings[0].lang === 'zh-CN' ? '目录' : 'Table of contents'}</p>
  <ol>${items}</ol>
</section>`;
}

function wrapDocument({ lang, coverTitle, coverSubtitle, meta, bodyHtml, tocHtml }) {
  const metaRows = Object.entries(meta)
    .map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${coverTitle} — ${coverSubtitle}</title>
  <link rel="stylesheet" href="../../confluence.css" />
</head>
<body class="confluence-document">
  <header class="doc-cover">
    <p class="doc-cover-logo">Backend Operation</p>
    <h1>${coverTitle}</h1>
    <p class="doc-cover-subtitle">${coverSubtitle}</p>
    <table class="doc-meta-table">${metaRows}</table>
  </header>
  ${tocHtml}
  <main class="doc-body">
    ${bodyHtml}
  </main>
  <footer class="doc-footer">
    <p>Internal use only — ${coverTitle} v${meta['App version'] || meta['应用版本'] || '1.0.10'}</p>
  </footer>
</body>
</html>`;
}

function mdToHtmlDocument(md, guide) {
  const meta = extractMeta(md);
  const bodyMd = stripLeadingMetaAndToc(md);
  const headings = [];

  const renderer = new marked.Renderer();
  renderer.heading = function ({ text, depth, raw }) {
    const id = raw
      .replace(/^#+\s*/, '')
      .trim()
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]+/g, '-')
      .replace(/^-|-$/g, '');
    if (depth === 2) {
      headings.push({ id, text: String(text), lang: guide.lang });
    }
    const tag = `h${depth}`;
    return `<${tag} id="${id}">${text}</${tag}>\n`;
  };

  marked.setOptions({ gfm: true, renderer });

  const bodyHtml = marked.parse(bodyMd);
  const tocHtml = buildTocHtml(headings);

  return wrapDocument({
    lang: guide.lang,
    coverTitle: guide.coverTitle,
    coverSubtitle: guide.coverSubtitle,
    meta,
    bodyHtml,
    tocHtml,
  });
}

async function writePdf(htmlPath, pdfPath, cssFile) {
  const { mdToPdf } = await import('md-to-pdf');
  const html = fs.readFileSync(htmlPath, 'utf8');
  await mdToPdf(
    { content: html },
    {
      dest: pdfPath,
      css: cssFile,
      launch_options: { args: ['--no-sandbox'] },
      pdf_options: {
        format: 'A4',
        margin: { top: '14mm', right: '14mm', bottom: '16mm', left: '14mm' },
        printBackground: true,
      },
    },
  );
}

async function writeDocx(htmlPath, docxPath, lang) {
  const HTMLtoDOCX = (await import('html-to-docx')).default;
  const html = fs.readFileSync(htmlPath, 'utf8');
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const inner = bodyMatch ? bodyMatch[1] : html;
  const docx = await HTMLtoDOCX(inner, null, {
    table: { row: { cantSplit: true } },
    footer: true,
    pageNumber: true,
    font: lang === 'zh-CN' ? 'Microsoft YaHei' : 'Segoe UI',
  });
  fs.writeFileSync(docxPath, docx);
}

async function main() {
  fs.mkdirSync(sourceDir, { recursive: true });

  let mdToPdfInstalled = true;
  try {
    await import('md-to-pdf');
  } catch {
    mdToPdfInstalled = false;
  }
  let docxInstalled = true;
  try {
    await import('html-to-docx');
  } catch {
    docxInstalled = false;
  }

  if (!mdToPdfInstalled || !docxInstalled) {
    console.error('Run: npm install --save-dev md-to-pdf marked html-to-docx');
    process.exit(1);
  }

  for (const guide of GUIDES) {
    const mdPath = path.join(sourceDir, guide.src);
    if (!fs.existsSync(mdPath)) {
      const legacy = path.join(root, 'docs', 'guides', guide.src);
      if (fs.existsSync(legacy)) {
        fs.copyFileSync(legacy, mdPath);
      } else {
        console.error(`ERROR: Missing ${mdPath}`);
        process.exit(1);
      }
    }

    const outDir = path.join(outRoot, guide.folder);
    fs.mkdirSync(outDir, { recursive: true });

    const md = fs.readFileSync(mdPath, 'utf8');
    const html = mdToHtmlDocument(md, guide);
    const htmlPath = path.join(outDir, guide.htmlName);
    const pdfPath = path.join(outDir, guide.pdfName);
    const docxPath = path.join(outDir, guide.docxName);

    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`==> HTML ${guide.folder}/${guide.htmlName}`);

    console.log(`==> PDF  ${guide.folder}/${guide.pdfName}`);
    await writePdf(htmlPath, pdfPath, cssPath);

    console.log(`==> DOCX ${guide.folder}/${guide.docxName}`);
    await writeDocx(htmlPath, docxPath, guide.lang);

    const pdfKb = Math.round(fs.statSync(pdfPath).size / 1024);
    const docxKb = Math.round(fs.statSync(docxPath).size / 1024);
    console.log(`OK: PDF ${pdfKb} KB, Word ${docxKb} KB\n`);
  }

  const readme = `RESOURCE MANAGEMENT — USER GUIDES (for your team)
================================================

Open ONE of these — normal documents, NOT Markdown:

  English:
    documents/EN/Resource-Management-User-Guide-EN.pdf
    documents/EN/Resource-Management-User-Guide-EN.docx  (Microsoft Word)

  Chinese (Simplified):
    documents/ZH/Resource-Management-User-Guide-ZH.pdf
    documents/ZH/Resource-Management-User-Guide-ZH.docx

You can also double-click the .html file — it opens like a web page (Confluence style).

IT only: source text is in _source/ folder. Users should NOT open those files.

Rebuild after edits: npm run build:handbook-docs
`;
  fs.writeFileSync(path.join(outRoot, 'README.txt'), readme, 'utf8');
  console.log('Done. Give users PDF or Word from docs/guides/documents/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
