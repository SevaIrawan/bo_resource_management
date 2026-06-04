import { spawnSync } from 'child_process';

/** npm/npx di Windows butuh .cmd bila shell=false (path dengan spasi aman). */
export function npmBin() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function npxBin() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

/**
 * @param {string} label
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options]
 */
export function runProcess(label, command, args, options = {}) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: 'inherit',
    shell: false,
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
