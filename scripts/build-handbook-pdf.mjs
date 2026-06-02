#!/usr/bin/env node
/**
 * Build PDF user guides from Markdown (English + Mandarin).
 * Output: docs/guides/pdf/
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const guidesDir = path.join(root, 'docs', 'guides');
const outDir = path.join(guidesDir, 'pdf');
const cssPath = path.join(guidesDir, 'pdf.css');

const jobs = [
  { src: 'HANDBOOK-en.md', dest: 'Resource-Management-User-Guide-EN.pdf' },
  { src: 'HANDBOOK-zh.md', dest: 'Resource-Management-User-Guide-ZH.pdf' },
];

async function main() {
  let mdToPdf;
  try {
    mdToPdf = (await import('md-to-pdf')).mdToPdf;
  } catch {
    console.error('ERROR: Install md-to-pdf first: npm install --save-dev md-to-pdf');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  for (const job of jobs) {
    const mdPath = path.join(guidesDir, job.src);
    if (!fs.existsSync(mdPath)) {
      console.error(`ERROR: Missing ${mdPath}`);
      process.exit(1);
    }
    const pdfPath = path.join(outDir, job.dest);
    console.log(`==> ${job.src} -> ${job.dest}`);
    await mdToPdf(
      { path: mdPath },
      {
        dest: pdfPath,
        css: fs.existsSync(cssPath) ? cssPath : undefined,
        pdf_options: {
          format: 'A4',
          margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' },
          printBackground: true,
        },
      },
    );
    const stat = fs.statSync(pdfPath);
    console.log(`OK: ${pdfPath} (${Math.round(stat.size / 1024)} KB)`);
  }

  console.log('\nDone. PDF files in docs/guides/pdf/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
