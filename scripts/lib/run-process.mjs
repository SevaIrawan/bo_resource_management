import { spawnSync } from 'child_process';
import path from 'path';

function resolveWindowsCmdTool(name) {
  const base = String(name).replace(/\.cmd$/i, '');
  if (base === 'npm' || base === 'npx') {
    return path.join(path.dirname(process.execPath), `${base}.cmd`);
  }
  return name;
}

/** Quote arg untuk cmd.exe /c (path dengan spasi aman). */
function quoteCmdArg(arg) {
  const s = String(arg);
  if (!/[\s"]/u.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

/** npm/npx di Windows: .cmd tidak bisa spawnSync(shell:false) di Node 22+ (EINVAL). */
export function npmBin() {
  return process.platform === 'win32' ? resolveWindowsCmdTool('npm') : 'npm';
}

export function npxBin() {
  return process.platform === 'win32' ? resolveWindowsCmdTool('npx') : 'npx';
}

function spawnCommand(command, args, options) {
  const env = options.env ? { ...process.env, ...options.env } : process.env;
  const opts = { cwd: options.cwd, stdio: 'inherit', shell: false, env };

  if (process.platform === 'win32' && /\.cmd$/i.test(command)) {
    const cmdPath = path.isAbsolute(command) ? command : resolveWindowsCmdTool(command);
    const commandLine = [cmdPath, ...args].map(quoteCmdArg).join(' ');
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandLine], opts);
  }

  return spawnSync(command, args, opts);
}

/**
 * @param {string} label
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options]
 */
export function runProcess(label, command, args, options = {}) {
  console.log(`\n==> ${label}`);
  const result = spawnCommand(command, args, options);
  if (result.error) {
    console.error(result.error);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
