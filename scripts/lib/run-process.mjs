import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function resolveNpmCli(tool) {
  const nodeDir = path.dirname(process.execPath);
  const prefixes = [
    nodeDir,
    path.join(nodeDir, '..'),
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs') : null,
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'nodejs') : null,
  ].filter(Boolean);

  for (const prefix of prefixes) {
    const candidates = [
      path.join(prefix, 'node_modules', 'npm', 'bin', `${tool}-cli.js`),
      path.join(prefix, 'lib', 'node_modules', 'npm', 'bin', `${tool}-cli.js`),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/** Path ke npm-cli.js / npx-cli.js di instalasi Node (hindari .cmd + EINVAL di Windows). */
export function npmCliPath() {
  return resolveNpmCli('npm');
}

export function npxCliPath() {
  return resolveNpmCli('npx');
}

/** @deprecated Prefer runNpm() / projectBin() */
export function npmBin() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

/** @deprecated Prefer runNpx() / projectBin() */
export function npxBin() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

/** @param {string} root @param {string} relPath */
export function projectBin(root, relPath) {
  const full = path.join(root, 'node_modules', relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Dependency tidak ada: ${full} — jalankan npm ci`);
  }
  return full;
}

function spawnCommand(command, args, options) {
  const env = options.env ? { ...process.env, ...options.env } : process.env;
  const opts = { cwd: options.cwd, stdio: 'inherit', shell: false, env };

  const npmCli = npmCliPath();
  if (npmCli && (command === 'npm' || command === 'npm.cmd' || command.endsWith(`${path.sep}npm.cmd`))) {
    return spawnSync(process.execPath, [npmCli, ...args], opts);
  }

  const npxCli = npxCliPath();
  if (npxCli && (command === 'npx' || command === 'npx.cmd' || command.endsWith(`${path.sep}npx.cmd`))) {
    return spawnSync(process.execPath, [npxCli, ...args], opts);
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

/** @param {string} root @param {string} label @param {string[]} args */
export function runNpm(root, label, args) {
  const cli = npmCliPath();
  if (cli) {
    runProcess(label, process.execPath, [cli, ...args], { cwd: root });
    return;
  }
  runProcess(label, 'npm', args, { cwd: root });
}

/** @param {string} root @param {string} label @param {string[]} args */
export function runNpx(root, label, args) {
  const npxCli = npxCliPath();
  if (npxCli) {
    runProcess(label, process.execPath, [npxCli, ...args], { cwd: root });
    return;
  }
  runProcess(label, 'npx', args, { cwd: root });
}

/** @param {string} root @param {string} label @param {string} relPath @param {string[]} args */
export function runProjectTool(root, label, relPath, args) {
  runProcess(label, process.execPath, [projectBin(root, relPath), ...args], { cwd: root });
}
