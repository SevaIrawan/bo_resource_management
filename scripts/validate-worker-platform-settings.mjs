/**
 * Kontrak Admin worker settings WA/TG — field coverage + safe defaults.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const config = read('src/config/workerPlatformSettings.ts');
const ui = read('src/components/admin/WorkerPlatformSettingsSection.tsx');
const admin = read('src/pages/SettingsPage.tsx');
const en = read('src/i18n/locales/en.ts');

const checks = [
  {
    name: 'Storage keys WA + TG',
    ok:
      config.includes('rm_worker_settings_whatsapp') &&
      config.includes('rm_worker_settings_telegram'),
  },
  {
    name: 'Safe defaults: human safe, delete off, TG minimal admin rights',
    ok:
      config.includes("humanProfile: 'safe'") &&
      config.includes('deleteEnabled: false') &&
      config.includes('postMessages: true') &&
      config.includes('addAdmins: false') &&
      /defaultWhatsAppWorkerSettings[\s\S]*messagesAdminsOnly: false/.test(config),
  },
  {
    name: 'TG admin rights: 11 toggles incl. deleteStories',
    ok: config.includes('deleteStories') && ui.includes("'deleteStories'"),
  },
  {
    name: 'Standard UI: afterCreate + pause scripts + TG flood/photo',
    ok:
      ui.includes('afterCreateSec') &&
      ui.includes('pauseBetweenScriptsMinLow') &&
      ui.includes('maxFloodwaitAutoSleepSec') &&
      ui.includes('setPhotoMaxRetry'),
  },
  {
    name: 'Invite link: batch delay + TG export retries only on TG',
    ok:
      ui.includes('batchDelayMinSec') &&
      ui.includes('inviteExportRetrySec') &&
      /platform === 'telegram'[\s\S]*inviteExportRetries/.test(ui),
  },
  {
    name: 'Set admin: resolveEntityMaxAttempts (TG)',
    ok: ui.includes('resolveEntityMaxAttempts'),
  },
  {
    name: 'Admin expand cards: accordion group (single open)',
    ok:
      read('src/components/admin/AdminExpandCard.tsx').includes('AdminExpandCardGroup') &&
      read('src/components/admin/AdminExpandCard.tsx').includes('expandedId === cardId') &&
      admin.includes('AdminExpandCardGroup'),
  },
  {
    name: 'i18n workerCommon + platform sections',
    ok: en.includes('workerWhatsApp') && en.includes('workerTelegram') && en.includes('workerCommon'),
  },
  {
    name: 'Delay config wired to automation (invite + set admin + human jitter)',
    ok:
      config.includes('invite_delay_min_sec') &&
      config.includes('max_admin_slots') &&
      config.includes('jitterPercentFromHumanProfile') &&
      /action === 'set_admin'[\s\S]*setAdmin\.betweenTargetsSec/.test(config),
  },
  {
    name: 'Export Telegram worker shape includes delay + rights',
    ok:
      config.includes('toTelegramWorkerConfigShape') &&
      config.includes('delete_stories') &&
      config.includes('set_photo_max_retry'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nWorker platform settings checks passed.');
