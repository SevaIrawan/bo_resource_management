/**
 * Pastikan artefak wajib installer ada sebelum electron-builder (Chrome, sidecar, env, deps).
 * Usage: node scripts/validate-installer-package.mjs [win|mac|linux]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  findChromeBinaryUnder,
  sidecarBinaryName,
  sidecarResourcePath,
} from './lib/cross-platform-artifacts.mjs';
import { missingOrgEnvKeys } from './lib/org-env-required.mjs';
import { hostMatchesTarget, parseBuildTargetArg, platformForBuildTarget } from './lib/installer-bundle-manifest.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = parseBuildTargetArg(process.argv[2]);
const platform = platformForBuildTarget(target);
const onBuildHost = hostMatchesTarget(target);
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const pkg = JSON.parse(read('package.json'));
const build = pkg.build ?? {};
const extra = build.extraResources ?? [];
const files = build.files ?? [];
const asarUnpack = build.asarUnpack ?? [];
const sidecarName = sidecarBinaryName(platform);
const sidecarPath = sidecarResourcePath(root, platform);
const orgDefaultPath = path.join(root, 'resources', 'org-default.env');
const envTemplatePath = path.join(root, 'resources', 'env-template.env');

function platformExtraResources(platformKey) {
  return [...extra, ...(build[platformKey]?.extraResources ?? [])];
}

const orgParsed = fs.existsSync(orgDefaultPath)
  ? dotenv.parse(fs.readFileSync(orgDefaultPath))
  : {};
const missingOrg = missingOrgEnvKeys(orgParsed);

const nodeModulesChecks = ['whatsapp-web.js', 'puppeteer', '@supabase/supabase-js'].map(
  (mod) => ({
    name: `node_modules/${mod}`,
    ok: fs.existsSync(path.join(root, 'node_modules', mod)),
  }),
);

const checks = [
  {
    name: `[${target}] Chrome terbundel (resources/puppeteer-cache)`,
    ok: onBuildHost
      ? Boolean(findChromeBinaryUnder(path.join(root, 'resources', 'puppeteer-cache'), 0, platform))
      : true,
    skip: onBuildHost ? undefined : `build di runner ${target} (host: ${process.platform})`,
  },
  {
    name: `[${target}] Sidecar Telegram (${sidecarName})`,
    ok: onBuildHost ? fs.existsSync(sidecarPath) : true,
    skip: onBuildHost ? undefined : `build di runner ${target}`,
  },
  {
    name: 'env-template.env (repo)',
    ok: fs.existsSync(envTemplatePath),
  },
  {
    name: 'org-default.env (dari .env IT saat build)',
    ok: fs.existsSync(orgDefaultPath),
  },
  {
    name: 'org-default.env kunci Supabase + Telegram',
    ok: missingOrg.length === 0,
    detail: missingOrg.length ? `kurang: ${missingOrg.join(', ')}` : undefined,
  },
  {
    name: 'extraResources: puppeteer-chrome',
    ok: extra.some((e) => String(e.to).includes('puppeteer-chrome')),
  },
  {
    name: `extraResources Win: sidecar ${sidecarBinaryName('win32')}`,
    ok: platformExtraResources('win').some((e) =>
      String(e.to).includes(`sidecar/${sidecarBinaryName('win32')}`),
    ),
  },
  {
    name: `extraResources Mac: sidecar ${sidecarBinaryName('darwin')}`,
    ok: platformExtraResources('mac').some((e) =>
      String(e.to).includes(`sidecar/${sidecarBinaryName('darwin')}`),
    ),
  },
  {
    name: `extraResources Linux: sidecar ${sidecarBinaryName('linux')}`,
    ok: platformExtraResources('linux').some((e) =>
      String(e.to).includes(`sidecar/${sidecarBinaryName('linux')}`),
    ),
  },
  {
    name: 'extraResources: org-default.env + env-template.env',
    ok:
      extra.some((e) => String(e.to).includes('org-default.env')) &&
      extra.some((e) => String(e.to).includes('env-template.env')),
  },
  {
    name: 'asarUnpack: whatsapp-web.js + puppeteer',
    ok:
      asarUnpack.some((p) => p.includes('whatsapp-web.js')) &&
      asarUnpack.some((p) => p.includes('puppeteer')),
  },
  {
    name: 'build files: dist + dist-electron',
    ok: files.some((f) => f.includes('dist-electron')),
  },
  {
    name: 'build.files exclude sidecar-build/dist (Mac asar)',
    ok:
      files.some((f) => String(f).includes('!resources/sidecar-build')) &&
      files.some((f) => String(f).includes('!resources/sidecar-dist')),
  },
  {
    name: 'build.directories.output = release',
    ok: build.directories?.output === 'release',
  },
  {
    name: 'Dependencies runtime: whatsapp-web.js, puppeteer, supabase',
    ok:
      Boolean(pkg.dependencies?.['whatsapp-web.js']) &&
      Boolean(pkg.dependencies?.puppeteer) &&
      Boolean(pkg.dependencies?.['@supabase/supabase-js']),
  },
  ...nodeModulesChecks,
  {
    name: 'waPuppeteerChrome: resolveWaChromeExecutable + resourcesPath',
    ok: (() => {
      const src = read('electron/main/platformLogin/waPuppeteerChrome.ts');
      return (
        src.includes('resolveWaChromeExecutable') &&
        src.includes('puppeteer-chrome') &&
        src.includes('process.resourcesPath')
      );
    })(),
  },
  {
    name: 'telegramSidecar: bundled binary di process.resourcesPath',
    ok: (() => {
      const src = read('electron/main/platformLogin/telegramSidecar.ts');
      return (
        src.includes('bundledSidecarPath') &&
        src.includes('process.resourcesPath') &&
        src.includes('rm-telegram-sidecar')
      );
    })(),
  },
];

let failed = 0;
console.log(`Installer package checks — build target: ${target} (platform ${platform})\n`);
for (const c of checks) {
  const ok = c.ok;
  const skip = c.skip ? ` [SKIP: ${c.skip}]` : '';
  console.log(`${ok ? 'OK' : 'FAIL'}  ${c.name}${skip}${c.detail && !ok ? ` (${c.detail})` : ''}`);
  if (!ok) failed += 1;
}
if (failed) {
  console.error('\nJalankan build lengkap: npm run build:installer:' + target);
  console.error('  (Chrome + sidecar + .env organisasi IT)');
  process.exit(1);
}
console.log('\nInstaller package checks passed.');
