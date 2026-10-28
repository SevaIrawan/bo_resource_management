#!/usr/bin/env node
/**
 * UserPromptSubmit: jika user mengetik "hi" (hanya kata itu), sisipkan instruksi wajib
 * agar Claude membaca semua aturan + potret repo sebelum menjawab.
 */

const INSTRUCTION = [
  'PERINTAH "hi" (wajib, dari hook repo): sebelum menjawab, lakukan berurutan dan teliti:',
  '1. Baca penuh semua aturan: CLAUDE.md, .cursorrules, .cursor/rules/*.mdc.',
  '2. Baca penuh potret repo: docs/REPO-SNAPSHOT.md.',
  '3. Ambil commit dari baris "Snapshot dari commit" di docs/REPO-SNAPSHOT.md, lalu jalankan',
  '   `git log --oneline <commit>..HEAD --stat`. Baca file yang berubah sejak snapshot.',
  '4. Laporkan ke user (Bahasa Indonesia, ringkas): aturan yang berlaku, ringkasan kondisi repo,',
  '   dan bagian snapshot yang usang karena perubahan baru (jika ada). Jangan ubah file apa pun.',
].join('\n');

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let prompt = '';
  try {
    prompt = String(JSON.parse(raw || '{}').prompt ?? '');
  } catch {
    process.exit(0);
  }
  if (/^\s*hi[\s!.]*$/i.test(prompt)) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: INSTRUCTION },
      }),
    );
  }
  process.exit(0);
});
