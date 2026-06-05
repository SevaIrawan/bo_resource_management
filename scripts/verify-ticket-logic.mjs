/**
 * Verifikasi logika ticket (5 tipe + invariant gap) — tanpa DB.
 * Jalankan: node scripts/verify-ticket-logic.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function buildRawSet(rows) {
  const s = new Set();
  for (const r of rows) {
    const gid = String(r.group_id ?? '').trim();
    if (gid) s.add(gid);
  }
  return s;
}

function dedupeDaily(rows) {
  const m = new Map();
  for (const r of rows) {
    const gid = String(r.group_id ?? '').trim();
    if (gid) m.set(gid, r);
  }
  return [...m.values()];
}

function normGid(gid) {
  const t = String(gid ?? '').trim().toLowerCase();
  if (!t) return '';
  if (t.endsWith('@g.us')) return t;
  if (/^\d+(-\d+)?@/i.test(t)) return t;
  if (/^\d+$/.test(t)) return `${t}@g.us`;
  return t;
}

function computeGap(masterRows, dailyRows) {
  const daily = dedupeDaily(dailyRows);
  const masterSet = buildRawSet(masterRows);
  const dailySet = buildRawSet(daily);
  let junk = 0;
  for (const d of daily) {
    const gid = String(d.group_id ?? '').trim();
    if (gid && !masterSet.has(gid)) junk += 1;
  }
  let missing = 0;
  for (const m of masterRows) {
    const gid = String(m.group_id ?? '').trim();
    if (gid && !dailySet.has(gid)) missing += 1;
  }
  return {
    dailyY: dailySet.size,
    masterX: masterSet.size,
    junk,
    missing,
    gapYMinusX: dailySet.size - masterSet.size,
    junkMinusMissing: junk - missing,
  };
}

function computeNotAdmin(masterRows, dailyRows) {
  const daily = dedupeDaily(dailyRows);
  const dailyByGid = new Map(daily.map((d) => [String(d.group_id).trim(), d]));
  const dailySet = buildRawSet(daily);
  let count = 0;
  for (const m of masterRows) {
    const gid = String(m.group_id ?? '').trim();
    if (!gid || !dailySet.has(gid)) continue;
    const d = dailyByGid.get(gid);
    if (d && d.is_admin !== 'yes') count += 1;
  }
  return count;
}

function computeDupGid(masterRows, dailyRows) {
  const masterSet = buildRawSet(masterRows);
  const masterByRaw = new Map();
  for (const m of masterRows) {
    const gid = String(m.group_id ?? '').trim();
    if (gid && !masterByRaw.has(gid)) masterByRaw.set(gid, m);
  }
  let count = 0;
  for (const d of dedupeDaily(dailyRows)) {
    const gid = String(d.group_id ?? '').trim();
    const gname = String(d.group_name ?? '').trim();
    if (!gid || !gname || !masterSet.has(gid)) continue;
    const canon = masterByRaw.get(gid);
    if (!canon) continue;
    const canonName = String(canon.group_name ?? '').trim();
    if (canonName && gname.toLowerCase() !== canonName.toLowerCase()) count += 1;
  }
  return count;
}

function computeDupName(masterRows, dailyRows) {
  let count = 0;
  const daily = dedupeDaily(dailyRows);
  for (const d of daily) {
    const gid = String(d.group_id ?? '').trim();
    const gnameNorm = String(d.group_name ?? '').trim().toLowerCase();
    if (!gid || !gnameNorm) continue;
    const gidNorm = normGid(gid);
    const canon = masterRows.find((m) => normGid(m.group_id) === gidNorm);
    if (canon) {
      const canonNameNorm = String(canon.group_name ?? '').trim().toLowerCase();
      if (canonNameNorm && canonNameNorm !== gnameNorm) continue;
    }
    const clash = masterRows.find((m) => {
      const mGidNorm = normGid(m.group_id);
      const mNameNorm = String(m.group_name ?? '').trim().toLowerCase();
      return mNameNorm === gnameNorm && mGidNorm !== gidNorm;
    });
    if (clash) count += 1;
  }
  return count;
}

function masterRange(prefix, from, to) {
  const rows = [];
  for (let i = from; i <= to; i++) {
    rows.push({ group_id: `${prefix}${i}@g.us`, group_name: `G${i}` });
  }
  return rows;
}

function dailyRange(prefix, from, to, extra = {}) {
  const rows = [];
  for (let i = from; i <= to; i++) {
    rows.push({
      group_id: `${prefix}${i}@g.us`,
      group_name: `G${i}`,
      is_admin: 'yes',
      ...extra,
    });
  }
  return rows;
}

const tests = [
  {
    name: 'Invariant: junk − missing = Y − X',
    run() {
      const master = masterRange('m', 1, 100);
      const daily = [
        ...dailyRange('m', 1, 95),
        ...dailyRange('x', 1, 10).map((r) => ({ ...r, group_id: `extra${r.group_id}` })),
      ];
      const g = computeGap(master, daily);
      return g.junkMinusMissing === g.gapYMinusX;
    },
  },
  {
    name: 'Bella-like: Y=1935 X=1926 → junk=9 missing=0',
    run() {
      const master = masterRange('m', 1, 1926);
      const daily = [
        ...dailyRange('m', 1, 1926),
        ...dailyRange('junk', 1, 9),
      ];
      const g = computeGap(master, daily);
      return g.dailyY === 1935 && g.masterX === 1926 && g.junk === 9 && g.missing === 0;
    },
  },
  {
    name: 'ELA-like: Y=1921 X=1926 → missing=5 junk=0',
    run() {
      const master = masterRange('m', 1, 1926);
      const daily = dailyRange('m', 1, 1921);
      const g = computeGap(master, daily);
      return g.dailyY === 1921 && g.masterX === 1926 && g.junk === 0 && g.missing === 5;
    },
  },
  {
    name: 'daily_junk: semua daily tidak di master',
    run() {
      const g = computeGap([{ group_id: 'a@g.us' }], [{ group_id: 'b@g.us' }, { group_id: 'c@g.us' }]);
      return g.junk === 2 && g.missing === 1;
    },
  },
  {
    name: 'missing_group: master tidak di daily (raw ID)',
    run() {
      const g = computeGap(
        [{ group_id: '111@g.us' }, { group_id: '222@g.us' }],
        [{ group_id: '111@g.us' }],
      );
      return g.missing === 1 && g.junk === 0;
    },
  },
  {
    name: 'Tidak match invite/nama — ID beda = junk + missing',
    run() {
      const master = [{ group_id: '111@g.us', group_name: 'Alpha', invite_link: 'https://x/aaa' }];
      const daily = [{ group_id: '222@g.us', group_name: 'Alpha', invite_link: 'https://x/aaa' }];
      const g = computeGap(master, daily);
      return g.junk === 1 && g.missing === 1;
    },
  },
  {
    name: 'not_admin: join by raw ID, is_admin=no',
    run() {
      const master = [{ group_id: '111@g.us', group_name: 'A' }];
      const daily = [{ group_id: '111@g.us', group_name: 'A', is_admin: 'no' }];
      return computeNotAdmin(master, daily) === 1;
    },
  },
  {
    name: 'not_admin: missing skip (tidak di daily)',
    run() {
      const master = [{ group_id: '111@g.us' }, { group_id: '222@g.us' }];
      const daily = [{ group_id: '111@g.us', is_admin: 'no' }];
      return computeNotAdmin(master, daily) === 1;
    },
  },
  {
    name: 'duplicate_group_id: ID raw sama persis, nama beda',
    run() {
      const master = [{ group_id: '123@g.us', group_name: 'MasterName' }];
      const daily = [{ group_id: '123@g.us', group_name: 'DeviceName' }];
      return computeDupGid(master, daily) === 1;
    },
  },
  {
    name: 'duplicate_group_id: TIDAK trigger jika ID beda format (→ junk)',
    run() {
      const master = [{ group_id: '123@g.us', group_name: 'MasterName' }];
      const daily = [{ group_id: '123', group_name: 'DeviceName' }];
      const dup = computeDupGid(master, daily);
      const g = computeGap(master, daily);
      return dup === 0 && g.junk === 1;
    },
  },
  {
    name: 'duplicate_group_name: nama sama ID beda',
    run() {
      const master = [{ group_id: '111@g.us', group_name: 'Same' }];
      const daily = [{ group_id: '222@g.us', group_name: 'Same' }];
      return computeDupName(master, daily) === 1;
    },
  },
  {
    name: 'duplicate_group_name: tidak trigger jika ID sama (→ dup id)',
    run() {
      const master = [{ group_id: '111@g.us', group_name: 'A' }];
      const daily = [{ group_id: '111@g.us', group_name: 'B' }];
      return computeDupName(master, daily) === 0 && computeDupGid(master, daily) === 1;
    },
  },
  {
    name: 'group_id kosong diabaikan',
    run() {
      const g = computeGap([{ group_id: '  ' }, { group_id: 'a@g.us' }], [{ group_id: '' }, { group_id: 'a@g.us' }]);
      return g.junk === 0 && g.missing === 0 && g.dailyY === 1 && g.masterX === 1;
    },
  },
  {
    name: 'Dedupe daily: satu ticket per group_id raw',
    run() {
      const daily = [
        { group_id: 'dup@g.us', group_name: 'A' },
        { group_id: 'dup@g.us', group_name: 'B' },
      ];
      const g = computeGap([], daily);
      return g.dailyY === 1 && g.junk === 1;
    },
  },
];

function verifySourceContracts() {
  const reconcile = fs.readFileSync(path.join(root, 'src/lib/reconcileTickets.ts'), 'utf8');
  const compare = fs.readFileSync(path.join(root, 'src/lib/accountMasterDailyCompare.ts'), 'utf8');
  const syncData = fs.readFileSync(path.join(root, 'src/lib/accountSyncData.ts'), 'utf8');
  const checks = [
    ['5 tipe ticket di reconcile', /daily_junk_group/.test(reconcile) && /missing_group/.test(reconcile) && /not_admin/.test(reconcile) && /duplicate_group_id/.test(reconcile) && /duplicate_group_name/.test(reconcile)],
    ['tidak ada group_count_mismatch insert', !reconcile.includes("ticketType: 'group_count_mismatch'")],
    ['brand brands.name dulu', reconcile.includes('pickBrandNameForReconcile')],
    ['satu logic inti compare module', reconcile.includes('computeAccountTicketBreakdown') && syncData.includes('fetchAccountBookmarkMetrics')],
    ['missing/junk raw ID di compare', compare.includes('isMasterGroupIdInDaily') && compare.includes('isDailyGroupIdInMaster')],
    ['resolveTickets raw keepIds', reconcile.includes('input.keepGroupIds.has(gidTrim)') && !reconcile.includes('keepNormalized')],
    ['not_admin raw lookup di compare', compare.includes('dailyByGid.get(gid)')],
  ];
  let ok = true;
  for (const [label, pass] of checks) {
    console.log(`${pass ? 'OK' : 'FAIL'}  kontrak: ${label}`);
    if (!pass) ok = false;
  }
  return ok;
}

let failed = 0;
console.log('=== Unit logika ticket (5 tipe + gap) ===\n');
for (const t of tests) {
  let pass = false;
  try {
    pass = Boolean(t.run());
  } catch (e) {
    console.log(`FAIL  ${t.name} — ${e.message}`);
    failed += 1;
    continue;
  }
  console.log(`${pass ? 'OK' : 'FAIL'}  ${t.name}`);
  if (!pass) failed += 1;
}

console.log('\n=== Kontrak source reconcileTickets.ts ===\n');
if (!verifySourceContracts()) failed += 1;

if (failed) {
  console.log(`\n${failed} verifikasi GAGAL`);
  process.exit(1);
}
console.log('\nSemua verifikasi logika ticket LULUS.');
