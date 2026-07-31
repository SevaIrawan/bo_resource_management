// Supabase Edge Function: telegram-sheets-sync
//
// Trigger via Database Webhook (INSERT/UPDATE/DELETE) di tabel:
//   - resource_management_group_scrape_daily
//   - resource_management_groups_master
// atau dipanggil manual (mis. cron / invoke) tanpa payload.
//
// Untuk tiap brand (JMMY, STMY) platform telegram:
//   1. Ambil data master + daily dari Supabase
//   2. Hitung Full Group, Full Admin (matrix Yes/No per akun), Junk (+ Recommend)
//   3. Merge ke Google Sheets, kolom Remark (paling kanan) tidak pernah ditimpa
//
// Deploy:
//   supabase functions deploy telegram-sheets-sync
// Secrets yang wajib di-set (lihat README.md di folder ini):
//   GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY,
//   SHEET_ID_JMMY, SHEET_ID_STMY

import { createClient } from 'npm:@supabase/supabase-js@2';
import { SheetsClient, mergePreservingRemark } from '../_shared/googleSheets.ts';
import { buildFullMatrix, buildJunk, DailyRow, MasterRow } from '../_shared/telegramAlignment.ts';

type BrandConfig = {
  brand: string; // harus match kolom `brand` di Supabase
  sheetId: string;
  accounts: string[]; // urutan kolom akun di sheet, HARUS sama persis dengan header
};

function loadBrandConfigs(): BrandConfig[] {
  return [
    {
      brand: 'JMMY',
      sheetId: Deno.env.get('SHEET_ID_JMMY') ?? '',
      accounts: ['Haris', 'Lula', 'Richard', 'Rico', 'Steven'],
    },
    {
      brand: 'STMY',
      sheetId: Deno.env.get('SHEET_ID_STMY') ?? '',
      accounts: ['Lina', 'Raisa', 'Alicia', 'Dara', 'Rico', 'Manager'],
    },
  ];
}

const PLATFORM = 'telegram';

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const sheets = new SheetsClient(
      Deno.env.get('GOOGLE_CLIENT_EMAIL')!,
      (Deno.env.get('GOOGLE_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n'),
    );

    const brands = loadBrandConfigs();
    const entries = await Promise.all(
      brands.map(async (cfg) => {
        if (!cfg.sheetId) {
          return [cfg.brand, { skipped: true, reason: 'SHEET_ID belum di-set' }] as const;
        }
        return [cfg.brand, await syncBrand(supabase, sheets, cfg)] as const;
      }),
    );
    const results = Object.fromEntries(entries);

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

async function syncBrand(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  sheets: SheetsClient,
  cfg: BrandConfig,
) {
  // 1. Master + daily untuk brand+platform ini, dijalankan PARALEL (bukan
  //    berurutan) supaya lebih cepat — penting karena cron job cuma dikasih
  //    timeout 5 detik oleh Supabase.
  const masterQuery = supabase
    .from('resource_management_groups_master')
    .select('group_id, group_name, invite_link')
    .eq('brand', cfg.brand)
    .eq('platform', PLATFORM);

  const dailyQuery = supabase
    .from('resource_management_group_scrape_daily')
    .select('acc_name, group_id, group_name, invite_link, is_admin, is_owner, scraped_at')
    .eq('brand', cfg.brand)
    .eq('platform', PLATFORM)
    .order('scraped_at', { ascending: false });

  const [{ data: masterData, error: masterErr }, { data: dailyRaw, error: dailyErr }] =
    await Promise.all([masterQuery, dailyQuery]);
  if (masterErr) throw masterErr;
  if (dailyErr) throw dailyErr;
  const master: MasterRow[] = masterData ?? [];

  const seen = new Set<string>();
  const daily: DailyRow[] = [];
  for (const r of (dailyRaw ?? []) as Record<string, unknown>[]) {
    const accName = String(r.acc_name ?? '');
    const groupId = String(r.group_id ?? '');
    const dedupeKey = `${accName}||${groupId}`;
    if (seen.has(dedupeKey)) continue; // sudah ada versi lebih baru
    seen.add(dedupeKey);
    daily.push({
      account_label: accName,
      group_id: groupId,
      group_name: (r.group_name as string) ?? null,
      invite_link: (r.invite_link as string) ?? null,
      is_admin: (r.is_admin as string) ?? null,
      is_owner: (r.is_owner as string) ?? null,
    });
  }

  // 3. Hitung Full Group, Full Admin, Junk
  const fullGroup = buildFullMatrix(master, daily, cfg.accounts, 'join');
  const fullAdmin = buildFullMatrix(master, daily, cfg.accounts, 'admin');
  const junk = buildJunk(master, daily, cfg.brand);

  // 4. Susun rows untuk tiap tab & push ke Google Sheets (merge, preserve Remark)
  const groupHeader = ['Group Name', 'Group ID', 'Super Group', 'Group Link', ...cfg.accounts, 'Remark'];
  const groupRows = fullGroup.map((r) => [
    r.group_name,
    r.group_id,
    r.super_group,
    r.group_link,
    ...cfg.accounts.map((a) => r.perAccount[a]),
    '', // Remark diisi dari merge
  ]);

  const adminRows = fullAdmin.map((r) => [
    r.group_name,
    r.group_id,
    r.super_group,
    r.group_link,
    ...cfg.accounts.map((a) => r.perAccount[a]),
    '',
  ]);

  const junkHeader = [
    'Account Source', 'Group Name', 'Group ID', 'Super Group',
    'Invite Link', 'Admin', 'Owner', 'Recommend', 'Remark',
  ];
  const junkRows = junk.map((r) => [
    r.account_source, r.group_name, r.group_id, r.super_group,
    r.invite_link, r.admin, r.owner, r.recommend, '',
  ]);

  await Promise.all([
    syncTab(sheets, cfg.sheetId, 'Full Group', groupHeader, groupRows, [1]), // key = Group ID
    syncTab(sheets, cfg.sheetId, 'Full Admin', groupHeader, adminRows, [1]),
    syncTab(sheets, cfg.sheetId, 'Junk', junkHeader, junkRows, [0, 2]), // key = Account Source + Group ID
  ]);

  return {
    master_count: master.length,
    full_group_rows: groupRows.length,
    full_admin_rows: adminRows.length,
    junk_rows: junkRows.length,
  };
}

async function syncTab(
  sheets: SheetsClient,
  spreadsheetId: string,
  sheetName: string,
  header: string[],
  rows: string[][],
  keyColIndexes: number[],
) {
  const oldValues = await sheets.getValues(spreadsheetId, sheetName);
  const merged = mergePreservingRemark(header, rows, oldValues, keyColIndexes);
  await sheets.writeValues(spreadsheetId, sheetName, merged, oldValues.length);
}
