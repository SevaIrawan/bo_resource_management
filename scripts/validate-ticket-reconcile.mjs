/**
 * Kontrak ticket issue: master vs daily per akun, missing_group + invite_link.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const reconcile = read('src/lib/reconcileTickets.ts');
const masterDaily = read('src/lib/masterDailyMatch.ts');
const compare = read('src/lib/accountMasterDailyCompare.ts');
const syncData = read('src/lib/accountSyncData.ts');
const provider = read('src/providers/GroupMonitoringProvider.tsx');
const groups = read('src/lib/ticketGroups.ts');
const engine = read('src/lib/accountMonitoringEngine.ts');
const realtime = read('src/hooks/useRealtimeMonitoring.ts');

const checks = [
  {
    name: 'missing_group: master \\ daily by group_id saja',
    ok:
      reconcile.includes("'missing_group'") &&
      compare.includes('isMasterGroupIdInDaily') &&
      !compare.includes('findDailyRowForMaster'),
  },
  {
    name: 'Tidak ada group_count_mismatch di reconcile',
    ok: !reconcile.includes("ticketType: 'group_count_mismatch'"),
  },
  {
    name: 'Batch insert missing_group (skala ribuan grup)',
    ok:
      reconcile.includes('batchUpsertOpenTicketsByGroupId') &&
      reconcile.includes('TICKET_INSERT_CHUNK'),
  },
  {
    name: 'Lima tipe ticket (tanpa group_count_mismatch)',
    ok:
      reconcile.includes("'daily_junk_group'") &&
      reconcile.includes("'missing_group'") &&
      reconcile.includes("'not_admin'") &&
      reconcile.includes("'duplicate_group_id'") &&
      reconcile.includes('resolveLegacyCountMismatchTickets'),
  },
  {
    name: 'reconcileOpenTicketsForUser semua akun aktif',
    ok: reconcile.includes('export async function reconcileOpenTicketsForUser'),
  },
  {
    name: 'Provider: UI ticket dari engine + reconcile di refresh tab',
    ok:
      provider.includes('buildTicketSummariesForUser') &&
      provider.includes('runTicketReconcile') &&
      provider.includes('reconcileOpenTicketsForUser'),
  },
  {
    name: 'UI: satu kartu issue per akun+jenis (banyak baris link)',
    ok: groups.includes('ticketGroupKey') && groups.includes('group.lines'),
  },
  {
    name: 'Sync: merge group_id device ke daily (issue ikut update)',
    ok:
      engine.includes('mergeDeviceGroupIdsIntoDaily') &&
      engine.includes('device.groupIds'),
  },
  {
    name: 'Provider: scrape/realtime refresh summary engine',
    ok:
      provider.includes('reconcileTicketsForAccountFromDb') &&
      provider.includes('patchAccountGridAfterDailyWrite') &&
      provider.includes('setTicketSummariesFromEngine'),
  },
  {
    name: 'Sync flow: await onTicketsReload(dbAccountId)',
    ok:
      /await onTicketsReload\?\.\(dbAccountId/.test(read('src/hooks/useAccountSyncFlow.ts')) &&
      /refreshIssues\(dbAccountId/.test(
        read('src/components/group-monitoring/AccountMonitoringBody.tsx'),
      ),
  },
  {
    name: 'Scrape: refresh Issue setelah applyResult sukses',
    ok:
      read('src/hooks/useAccountSyncFlow.ts').includes('lastSyncAt: outcome.scrapedAt') &&
      read('src/hooks/useAccountSyncFlow.ts').includes('await onTicketsReload?.(dbAccountId'),
  },
  {
    name: 'Realtime tickets: reload kartu segera',
    ok:
      realtime.includes('table: TABLES.tickets') &&
      realtime.includes('onTicketsChangeRef.current()'),
  },
  {
    name: 'batchUpsert: keepIds hanya dari rows masih missing (bukan semua open lama)',
    ok:
      reconcile.includes('Hanya group_id yang masih issue') &&
      !reconcile.includes('keepIds.add(gid);\n    }\n  }\n\n  const toInsert'),
  },
  {
    name: 'daily_junk_group: daily \\ master by group_id raw (selaras grid Y/X)',
    ok:
      compare.includes('isDailyGroupIdInMaster') &&
      compare.includes('buildMasterGroupIdSet') &&
      compare.includes('dedupeDailyRowsByGroupId') &&
      masterDaily.includes('buildRawGroupIdSet'),
  },
  {
    name: 'Brand reconcile: brands.name dulu (sama dengan grid monitoring)',
    ok:
      reconcile.includes('pickBrandNameForReconcile') &&
      reconcile.includes('resolveBrandNameForReconcileAccount') &&
      fs.existsSync(path.join(root, 'src/lib/reconcileBrandName.ts')),
  },
  {
    name: 'Realtime daily: reconcile akun lalu patch groups',
    ok:
      realtime.includes('onAccountDailyChangedRef.current?.(accountId)') &&
      !realtime.includes('onTicketsChangeRef.current();\n            notifyChange();'),
  },
  {
    name: 'Realtime scrape selesai → reconcile akun + reload ticket',
    ok:
      realtime.includes('table: TABLES.scrapeRuns') &&
      realtime.includes("status === 'completed'") &&
      realtime.includes('onAccountDailyChangedRef.current?.(accountId)'),
  },
  {
    name: 'Detail ticket: double-click modal + export Excel',
    ok:
      fs.existsSync(path.join(root, 'src/components/group-monitoring/TicketIssueDetailModal.tsx')) &&
      read('src/components/group-monitoring/TicketCard.tsx').includes('onDoubleClick') &&
      !read('src/components/group-monitoring/TicketCard.tsx').includes('exportTicketGroupExcel') &&
      read('src/lib/ticketExportRows.ts').includes('ticketGroupToExportRows'),
  },
  {
    name: 'Scrape selesai → await refreshIssues (reconcile + reload)',
    ok:
      read('src/hooks/useAccountSyncFlow.ts').includes("outcome.kind === 'success'") &&
      read('src/hooks/useAccountSyncFlow.ts').includes('await onTicketsReload?.(dbAccountId'),
  },
  {
    name: 'Issue hilang → resolveTickets tutup open ticket',
    ok:
      reconcile.includes('async function resolveTickets') &&
      reconcile.includes("status: 'resolved'") &&
      reconcile.includes('await resolveTickets({'),
  },
  {
    name: 'resolveTickets: keep group_id raw (selaras gap)',
    ok:
      reconcile.includes('input.keepGroupIds.has(gidTrim)') &&
      !reconcile.includes('keepNormalized'),
  },
  {
    name: 'not_admin: lookup daily by raw group_id saja',
    ok: compare.includes('dailyByGid.get(gid)'),
  },
  {
    name: 'Satu logic inti: accountMasterDailyCompare (grid = ticket)',
    ok:
      reconcile.includes('computeAccountTicketBreakdown') &&
      reconcile.includes('loadMasterDailyForAccount') &&
      syncData.includes('fetchAccountBookmarkMetrics') &&
      compare.includes('fetchAccountBookmarkMetrics') &&
      compare.includes('assertTicketGridInvariant'),
  },
  {
    name: 'Stats akun: tidak pakai findDailyRowForMaster / RPC norm',
    ok:
      !syncData.includes('findDailyRowForMaster') &&
      !syncData.includes('fetchMasterGroupStatsViaRpc'),
  },
  {
    name: 'Card bookmark Groups/Admin = fetchAccountBookmarkMetrics (= ticket)',
    ok:
      syncData.includes('fetchAccountBookmarkMetrics') &&
      syncData.includes('groupsCurrent: master.dailyTotal') &&
      syncData.includes('adminCurrent: master.adminInMaster') &&
      !syncData.includes('deviceGroupCount != null'),
  },
  {
    name: 'Realtime snapshot: trigger reconcile issue',
    ok:
      realtime.includes('patchAccountSnapshotInGroups') &&
      realtime.includes('onIssueReconcileRef'),
  },
  {
    name: 'Modal Admin vs master: hanya baris master (X), dedupe group_id',
    ok: (() => {
      const links = read('src/lib/accountGroupLinks.ts');
      const start = links.indexOf('export async function fetchAccountGroupLinks');
      const fn = links.slice(start, start + 1200);
      return (
        links.includes('dedupeMasterRowsByGroupId') &&
        fn.includes('inMaster: true') &&
        !fn.includes('inMaster: false')
      );
    })(),
  },
  {
    name: 'GroupLinksModal adminMaster: tanpa caption junk di bawah tabel',
    ok: (() => {
      const modal = read('src/components/group-monitoring/GroupLinksModal.tsx');
      return (
        modal.includes("viewMode === 'account' && tableNeedsScroll") &&
        !modal.includes('extraDailyHint')
      );
    })(),
  },
  {
    name: 'Reconcile + kartu Issue: forceFresh baca DB terbaru',
    ok:
      reconcile.includes('forceFresh: true') &&
      read('src/lib/buildTicketSummariesFromEngine.ts').includes('forceFresh: true') &&
      read('src/lib/hydrateAccountMetricsFromDaily.ts').includes('forceFresh: true'),
  },
  {
    name: 'Scrape: invalidate cache master/daily setelah tulis DB',
    ok: read('src/lib/accountScraper.ts').includes('invalidateMasterDailyCacheForScrape'),
  },
  {
    name: 'Provider: refreshIssues + realtime daily → scheduleReportingReload',
    ok:
      provider.includes('scheduleReportingReload') &&
      /refreshAccountAfterDailyWrite[\s\S]*setTicketSummariesFromEngine/.test(provider),
  },
  {
    name: 'Post-scrape: ticket reload tidak skip saat ticketSyncLocked',
    ok:
      provider.includes('setTicketSummariesFromEngine') &&
      !/ticketSyncLockedRef\.current = true[\s\S]{0,200}await reloadTicketSummaries/.test(
        provider,
      ),
  },
  {
    name: 'Post-scrape: grid patch atomik (daily + brand master satu pass)',
    ok:
      fs.existsSync(path.join(root, 'src/lib/patchAccountGridAfterDailyWrite.ts')) &&
      provider.includes('patchAccountGridFromDb') &&
      read('src/lib/patchAccountGridAfterDailyWrite.ts').includes('patchGroupsFromDailyInState') &&
      read('src/lib/patchAccountGridAfterDailyWrite.ts').includes('patchBrandPlatformMasterInGroups'),
  },
  {
    name: 'Post-scrape: refresh busy coalesce (pending rerun)',
    ok:
      provider.includes('pendingAccountRefreshRef') &&
      /pendingAccountRefreshRef\.current\.has\(dbAccountId\)[\s\S]*void refreshAccountAfterDailyWrite/.test(
        provider,
      ),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nTicket reconcile checks passed.');
