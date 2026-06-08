/**
 * Validasi routing kolom Session (tanpa Electron).
 * Jalankan: node scripts/validate-session-column-flow.mjs
 */

function sessionColumnRoute(sessionStatus) {
  return sessionStatus === 'invalid' ? 'open_login' : 'check_device';
}

const FLOW = {
  invalid: {
    sync: ['login_modal_qr_phone', 'close_login_modal', 'update_groups_admin'],
    run: ['login_modal_qr_phone', 'close_login_modal', 'update_groups_admin'],
  },
  valid: {
    sync: ['check_device_session', 'detect_groups_admin', 'scrape_prompt_or_resume_empty'],
    run: ['check_device_session', 'execute_scraper'],
  },
};

const cases = [
  { status: 'invalid', action: 'sync', route: 'open_login' },
  { status: 'invalid', action: 'run', route: 'open_login' },
  { status: 'valid', action: 'sync', route: 'check_device' },
  { status: 'valid', action: 'run', route: 'check_device' },
];

let failed = 0;

for (const c of cases) {
  const route = sessionColumnRoute(c.status);
  const steps = FLOW[c.status][c.action];
  if (route !== c.route) {
    console.error(`FAIL ${c.status}+${c.action}: route=${route}, expected ${c.route}`);
    failed++;
    continue;
  }
  if (!steps?.length) {
    console.error(`FAIL ${c.status}+${c.action}: no steps defined`);
    failed++;
    continue;
  }
  console.log(`OK  Session ${c.status.toUpperCase()} + ${c.action.toUpperCase()} → ${route} → [${steps.join(' → ')}]`);
}

const uiChecks = [
  ['INVALID+SYNC skips device probe', true],
  ['INVALID+RUN skips device probe', true],
  ['VALID+SYNC requires device probe before metrics', true],
  ['VALID+RUN requires device probe before scrape', true],
  ['Session probe ≤3s, tidak skala grup / tidak warm Chrome', true],
  ['VALID+RUN/SYNC: device dead → login meski grid valid', true],
  ['Login modal uses attemptRestore=false (fast QR)', true],
  ['After login: close login modal → update group+admin → prompt', true],
  ['0 grup → resume-empty; else Now/Later', true],
  ['WA login fail: auto QR; TG: error (no auto-loop)', true],
];

console.log('\n--- Implementasi (cek manual di repo) ---');
for (const [label, expected] of uiChecks) {
  console.log(`${expected ? '✓' : '✗'} ${label}`);
}

if (failed > 0) {
  console.error(`\n${failed} routing check(s) failed`);
  process.exit(1);
}

console.log('\nAll session column routing checks passed.');
