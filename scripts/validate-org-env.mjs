#!/usr/bin/env node
/**
 * Pastikan .env tim IT lengkap sebelum build installer (user akhir tidak isi manual).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');

if (!fs.existsSync(envPath)) {
  console.error('ERROR: .env tidak ada. Isi Supabase + service role + Telegram sebelum build:installer.');
  process.exit(1);
}

const parsed = dotenv.parse(fs.readFileSync(envPath));
const required = [
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELEGRAM_API_ID',
  'TELEGRAM_API_HASH',
];
const missing = required.filter((k) => !parsed[k]?.trim());

if (missing.length > 0) {
  console.error('ERROR: .env belum lengkap untuk installer:', missing.join(', '));
  console.error('User lain tidak perlu isi AppData — tim IT lengkapi .env lalu build ulang.');
  process.exit(1);
}

console.log('OK: .env organisasi lengkap (service role + Telegram akan dibundel).');
