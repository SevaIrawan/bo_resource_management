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
import { cleanSidecarBuildDirs } from './lib/clean-installer-pack-artifacts.mjs';
import { runProcess } from './lib/run-process.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sidecarDir = path.join(root, 'python-sidecar');
const outDir = path.join(root, 'resources', 'sidecar');
const distPath = path.join(root, 'resources', 'sidecar-dist');
const workPath = path.join(root, 'resources', 'sidecar-build');
const venvDir = path.join(workPath, 'pyinstaller-venv');
const binaryName = sidecarBinaryName();
const builtPath = path.join(distPath, binaryName);
const destPath = sidecarResourcePath(root);

function pythonCommand() {
  const fromEnv = process.env.PYTHON?.trim();
  if (fromEnv) return { bin: fromEnv, args: [] };

  const candidates =
    process.platform === 'win32'
      ? [
          ['python', []],
          ['py', ['-3']],
        ]
      : [
          ['python3', []],
          ['python', []],
        ];

  for (const [bin, args] of candidates) {
    const probe = spawnSync(bin, [...args, '--version'], { stdio: 'ignore', shell: false });
    if (probe.status === 0) return { bin, args };
  }

  return process.platform === 'win32'
    ? { bin: 'python', args: [] }
    : { bin: 'python3', args: [] };
}

function venvPythonPath() {
  return process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');
}

const hostPy = pythonCommand();

for (const dir of [distPath, workPath, outDir, venvDir]) {
  fs.rmSync(dir, { recursive: true, force: true });
}
fs.mkdirSync(workPath, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

runProcess('Buat virtualenv Python', hostPy.bin, [...hostPy.args, '-m', 'venv', venvDir]);

const venvPy = venvPythonPath();
if (!fs.existsSync(venvPy)) {
  console.error(`ERROR: venv Python tidak ada: ${venvPy}`);
  process.exit(1);
}

const reqFile = path.join(sidecarDir, 'requirements.txt');

runProcess('pip install (sidecar + PyInstaller)', venvPy, [
  '-m',
  'pip',
  'install',
  '-q',
  '--upgrade',
  'pip',
  'pyinstaller',
  '-r',
  reqFile,
]);

runProcess('PyInstaller (onefile)', venvPy, [
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
], { cwd: sidecarDir });

if (!fs.existsSync(builtPath)) {
  console.error(`ERROR: PyInstaller gagal — ${builtPath} tidak ada`);
  process.exit(1);
}

fs.copyFileSync(builtPath, destPath);
if (process.platform !== 'win32') {
  fs.chmodSync(destPath, 0o755);
}

console.log(`OK: ${destPath}`);

cleanSidecarBuildDirs(root);
