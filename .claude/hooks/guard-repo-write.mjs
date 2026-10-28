#!/usr/bin/env node
/**
 * PreToolUse gate: setiap perubahan file di repo wajib izin eksplisit user.
 * Edit/Write/NotebookEdit di dalam repo dan perintah Bash yang mengubah file/git → "ask".
 * Baca-saja (Read/Grep/Glob, Bash read-only) dan tulis di luar repo (scratchpad) → lolos.
 */
import path from 'node:path';

const projectDir = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());

function ask(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: `[Gate repo] ${reason} — butuh izin eksplisit user.`,
      },
    }),
  );
  process.exit(0);
}

function insideProject(p) {
  if (!p) return true;
  const abs = path.resolve(projectDir, p);
  const rel = path.relative(projectDir, abs);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

const WRITE_BASH = [
  /\bsed\b[^|;&]*\s-i/, /\bperl\b[^|;&]*\s-i/,
  /\b(rm|rmdir|mv|cp|mkdir|touch|chmod|chown|truncate|ln|dd|patch|install|unlink)\b/,
  /\btee\b/,
  /\bgit\s+(commit|push|add|rm|mv|reset|restore|checkout|switch|merge|rebase|stash|clean|apply|am|cherry-pick|revert|tag|branch\s+-[dDmM]|pull|config)\b/,
  /\b(npm|pnpm|yarn)\s+(install|i|ci|uninstall|remove|add|update|version|publish|run\s+(build|publish|setup))\b/,
  /\b(pip|pip3)\s+install\b/,
  /\bnode\b[^|;&]*\s-e\b[^|;&]*(writeFile|appendFile|unlink|rmSync|renameSync|mkdirSync)/,
  /\bpython3?\b[^|;&]*\s-c\b[^|;&]*(open\(|unlink|remove|rename|write)/,
];

function bashWrites(cmd) {
  const cleaned = cmd
    .replace(/[0-9&]?>>?\s*\/dev\/null/g, '')
    .replace(/[0-9]>&[0-9]/g, '')
    .replace(/'[^']*'/g, "''"); // abaikan isi string literal
  if (/(^|[^<>&0-9])>>?\s*[^\s&>]/.test(cleaned)) return 'redirect ke file';
  for (const re of WRITE_BASH) if (re.test(cleaned)) return `perintah ubah file/git (${re.source.slice(0, 40)})`;
  return null;
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw || '{}'); } catch { ask('input hook tidak terbaca'); }
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') {
    const p = ti.file_path || ti.notebook_path;
    if (insideProject(p)) ask(`${tool} ${path.relative(projectDir, path.resolve(projectDir, p || ''))}`);
    process.exit(0);
  }
  if (tool === 'Bash') {
    const why = bashWrites(String(ti.command || ''));
    if (why) ask(`Bash: ${why}`);
  }
  process.exit(0);
});
