/**
 * Bundel sidecar Telegram (PyInstaller onefile) — per OS.
 * Windows → rm-telegram-sidecar.exe | macOS/Linux → rm-telegram-sidecar
 * Dipanggil: npm run build:sidecar
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { sidecarBinaryName, sidecarResourcePath } from './lib/cross-platform-artifacts.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sidecarDir = path.join(root, 'python-sidecar');
const outDir = path.join(root, 'resources', 'sidecar');
const distPath = path.join(root, 'resources', 'sidecar-dist');
const workPath = path.join(root, 'resources', 'sidecar-build');
const binaryName = sidecarBinaryName();
const builtPath = path.join(distPath, binaryName);
const destPath = sidecarResourcePath(root);

function pythonCommand() {
  if (process.platform === 'win32') {
    return { bin: 'py', args: ['-3'] };
  }
  return { bin: 'python3', args: [] };
}

function run(label, bin, args, cwd = root) {
  console.log(`==> ${label}`);
  const r = spawnSync(bin, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

const py = pythonCommand();
const reqFile = path.join(sidecarDir, 'requirements.txt');

run('pip install (sidecar + PyInstaller)', py.bin, [
  ...py.args,
  '-m',
  'pip',
  'install',
  '-q',
  '-r',
  reqFile,
  'pyinstaller',
]);

for (const dir of [distPath, workPath, outDir]) {
  fs.rmSync(dir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

run('PyInstaller (onefile)', py.bin, [
  ...py.args,
  '-m',
  'PyInstaller',
  '--noconfirm',
  '--clean',
  '--onefile',
  '--name',
  'rm-telegram-sidecar',
  '--distpath',
  distPath,
  '--workpath',
  workPath,
  '--specpath',
  workPath,
  '--collect-all',
  'uvicorn',
  '--collect-all',
  'fastapi',
  '--hidden-import=telethon',
  '--hidden-import=qrcode',
  'main.py',
], sidecarDir);

if (!fs.existsSync(builtPath)) {
  console.error(`ERROR: PyInstaller gagal — ${builtPath} tidak ada`);
  process.exit(1);
}

fs.copyFileSync(builtPath, destPath);
if (process.platform !== 'win32') {
  fs.chmodSync(destPath, 0o755);
}

console.log(`OK: ${destPath}`);
