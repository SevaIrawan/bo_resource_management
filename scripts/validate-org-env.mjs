#!/usr/bin/env node
/**
 * Pastikan .env tim IT punya 4 kunci organisasi sebelum build installer.
 * User akhir tidak isi manual — nilai disalin ke resources/org-default.env.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { missingOrgEnvKeys, ORG_ENV_REQUIRED_KEYS } from './lib/org-env-required.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');

if (!fs.existsSync(envPath)) {
  console.error('ERROR: file .env tidak ada di root project.');
  console.error('Wajib isi (4 kunci):', ORG_ENV_REQUIRED_KEYS.join(', '));
  console.error('Lihat: resources/env-template.env');
  process.exit(1);
}

const parsed = dotenv.parse(fs.readFileSync(envPath));
const missing = missingOrgEnvKeys(parsed);

if (missing.length > 0) {
  console.error('ERROR: .env kurang kunci wajib:', missing.join(', '));
  console.error('Semua kunci wajib:', ORG_ENV_REQUIRED_KEYS.join(', '));
  process.exit(1);
}

console.log('OK: .env organisasi — 4 kunci wajib ada (akan disalin ke org-default.env di installer).');
