/**
 * Kontrak Join Missing CSV/XLSX — group id | name | invite-only | hybrid (WA + TG).
 * Asal ada cell detectable → baris diproses (urutan kolom bebas).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const match = read('src/lib/masterDailyMatch.ts');
const parse = read('src/lib/parseCsvJoinImport.ts');
const validate = read('src/lib/validateCsvJoinAgainstMaster.ts');
const setupTable = read('src/config/jobQueueSetupTable.ts');
const setupModal = read('src/components/group-monitoring/OperationsJobQueueSetupModal.tsx');
const groupLinks = read('src/config/groupLinksTable.ts');

const checks = [
  {
    name: 'Invite normalize: TG t.me/+ dan joinchat + WA hash',
    ok:
      match.includes('tg:+') &&
      match.includes('chat.whatsapp.com') &&
      match.includes('joinchat') &&
      match.includes('looksLikeInviteLink') &&
      match.includes('normalizeInviteLinkForMatch'),
  },
  {
    name: 'Parse: classify + absorb semua cell (hybrid / urutan bebas)',
    ok:
      parse.includes('classifyJoinImportFields') &&
      parse.includes('absorbDetectableJoinCells') &&
      parse.includes('looksLikeGroupId') &&
      parse.includes('looksLikeInviteLink') &&
      parse.includes('mergePrefer') &&
      parse.includes('detectDelimiter'),
  },
  {
    name: 'Parse: WA hyphen @g.us + nama berisi Group bukan header palsu',
    ok:
      parse.includes('^\\d+(-\\d+)?@g\\.us$') &&
      parse.includes('JANGAN includes') &&
      parse.includes('wa_group_name'),
  },
  {
    name: 'Parse: CSV delimiter , ; tab + Excel sniff tanpa ekstensi',
    ok:
      parse.includes('detectDelimiter') &&
      parse.includes("return ';'") &&
      parse.includes('isZipXlsx') &&
      parse.includes('isOleXls'),
  },
  {
    name: 'Validate: match via id ternormalisasi + invite + nama',
    ok:
      validate.includes('normalizeInviteLinkForMatch') &&
      validate.includes('normalizeGroupIdForMatch') &&
      validate.includes('resolveCsvInviteCandidate') &&
      validate.includes('masterByInvite'),
  },
  {
    name: 'Setup table: 100/page + viewport 10 + scroll (bukan overflow hidden pada paged)',
    ok: (() => {
      const css = read('src/index.css');
      const pagedBlock = css.slice(
        css.indexOf('.operations-job-queue-table-wrap--paged'),
        css.indexOf('.operations-job-queue-table-wrap--paged') + 280,
      );
      return (
        setupTable.includes('JOB_QUEUE_SETUP_PAGE_SIZE = 100') &&
        setupTable.includes('JOB_QUEUE_SETUP_VISIBLE_ROWS = 10') &&
        setupModal.includes('sliceJobQueueSetupPage') &&
        setupModal.includes('JOB_QUEUE_SETUP_VISIBLE_ROWS') &&
        setupModal.includes('setupListPagination') &&
        !setupModal.includes('EXIT_GROUP_SETUP_PAGE_SIZE = 10') &&
        css.includes('operations-job-queue-table-wrap--scroll-body') &&
        css.includes('overflow-y: auto') &&
        !pagedBlock.includes('overflow: hidden')
      );
    })(),
  },
  {
    name: 'CTA group links: viewport 10 + page 100',
    ok:
      groupLinks.includes('GROUP_LINKS_VISIBLE_ROWS = 10') &&
      groupLinks.includes('GROUP_LINKS_PAGE_SIZE = 100'),
  },
];

let failed = 0;
for (const c of checks) {
  if (c.ok) console.log(`OK  ${c.name}`);
  else {
    console.error(`FAIL  ${c.name}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\nvalidate-join-csv-import: ${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nvalidate-join-csv-import: all checks passed');
