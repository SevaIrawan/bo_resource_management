/**
 * Audit baris reload Group Monitoring (kenapa UI "Loading accounts..." macet).
 * Jalankan: node scripts/audit-reload-all-flow.mjs
 */

const STEPS = [
  {
    row: 1,
    where: 'GroupMonitoringProvider.reloadAll',
    action: 'setLoading(true)',
    blocksUi: false,
    note: 'OK',
  },
  {
    row: 2,
    where: 'assertRmSchema',
    action: '12× Supabase limit(1) paralel',
    blocksUi: true,
    note: 'Cepat (~1s) kecuali jaringan mati',
  },
  {
    row: 3,
    where: 'loadAccountMonitoringGroups',
    action: 'brands + accounts + snapshots + master batch + 1× session aktif',
    blocksUi: true,
    note: 'FIX: session badge 1 query, bukan N× per akun',
  },
  {
    row: 4,
    where: '~~refreshSessionsFromDeviceProbe~~ (removed)',
    action: 'REMOVED dari load — probe Puppeteer 25–90s × jumlah akun',
    blocksUi: false,
    note: 'INI penyebab nunggu berhari-hari; cek device hanya di SYNC/Scrape',
  },
  {
    row: 5,
    where: 'setGroups',
    action: 'Tampilkan grid akun',
    blocksUi: false,
    note: 'UI harus muncul di sini',
  },
  {
    row: 6,
    where: 'finally setLoading(false)',
    action: 'Hilangkan "Loading accounts..."',
    blocksUi: false,
    note: 'WAJIB selalu jalan',
  },
  {
    row: 7,
    where: 'SYNC / scrape / login',
    action: 'applyResult lalu realtime → patchAccountGridAfterDailyWrite + scheduleMonitoringReload',
    blocksUi: false,
    note: 'Realtime group_scrape_daily → debounce 400ms; groups_master tidak double-patch di daily handler',
  },
];

console.log('AUDIT reloadAll — row per row\n');
console.log(
  ['Row', 'Lokasi', 'Aksi', 'Block UI?', 'Catatan'].join(' | '),
);
console.log('-'.repeat(100));

for (const s of STEPS) {
  console.log(
    [s.row, s.where, s.action, s.blocksUi ? 'YA' : 'tidak', s.note].join(' | '),
  );
}

console.log('\nDevTools Autofill errors di terminal Electron = BUKAN penyebab loading macet.');
console.log('Session device: INVALID→SYNC=login | VALID→SYNC/Scrape=check device (syncFlowService).');
