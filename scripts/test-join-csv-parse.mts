/**
 * Runtime smoke test — parse Join Missing CSV hybrid (tanpa DB).
 * Run: npx tsx scripts/test-join-csv-parse.mts
 */
import {
  absorbDetectableJoinCells,
  classifyJoinImportFields,
  looksLikeGroupId,
  parseCsvJoinText,
} from '../src/lib/parseCsvJoinImport.ts';
import {
  looksLikeInviteLink,
  normalizeInviteLinkForMatch,
} from '../src/lib/masterDailyMatch.ts';

type Case = { name: string; ok: boolean; detail?: string };
const cases: Case[] = [];

function check(name: string, ok: boolean, detail?: string) {
  cases.push({ name, ok, detail });
}

const tgA = normalizeInviteLinkForMatch('https://t.me/+oXU4dZXpBVFjZWI1');
const tgB = normalizeInviteLinkForMatch('https://t.me/joinchat/oXU4dZXpBVFjZWI1');
check('TG + dan joinchat same key', tgA === tgB && tgA === 'tg:+oxu4dzxpbvfjzwi1', tgA);
check(
  'WA invite hash',
  normalizeInviteLinkForMatch('https://chat.whatsapp.com/AbCdEf123') === 'abcdef123',
);
check('looksLike invite TG', looksLikeInviteLink('https://t.me/+abc'));
check('looksLike invite WA', looksLikeInviteLink('https://chat.whatsapp.com/xyz'));
check('looksLikeGroupId TG -100', looksLikeGroupId('-1003708712582'));
check('looksLikeGroupId WA @g.us', looksLikeGroupId('120363123@g.us'));
check('URL bukan groupId', !looksLikeGroupId('https://t.me/+abc'));

{
  const r = parseCsvJoinText('https://t.me/+AAA111\nhttps://t.me/+BBB222');
  check('invite-only rows=2', r.rows.length === 2, String(r.rows.length));
  check(
    'invite-only has inviteLink',
    Boolean(r.rows[0]?.inviteLink) && !r.rows[0]?.groupId,
    JSON.stringify(r.rows[0]),
  );
}

{
  const r = parseCsvJoinText('-100111\n-100222');
  check('id-only rows', r.rows.length === 2 && r.rows[0]?.groupId === '-100111', JSON.stringify(r.rows));
}

{
  const csv =
    'group_id,group_name,invite_link\n-1001,STMY Alpha,https://t.me/+xyz\n-1002,STMY Beta,https://t.me/+abc';
  const r = parseCsvJoinText(csv);
  check('hybrid header rows=2', r.rows.length === 2, String(r.rows.length));
  check(
    'hybrid has all fields',
    Boolean(r.rows[0]?.groupId && r.rows[0]?.groupName && r.rows[0]?.inviteLink),
    JSON.stringify(r.rows[0]),
  );
}

{
  const csv =
    'https://t.me/+zzz,Hello Group,-100999\nhttps://chat.whatsapp.com/QQQ,WA Group,120363999@g.us';
  const r = parseCsvJoinText(csv);
  check('scrambled col row0 invite', Boolean(r.rows[0]?.inviteLink?.includes('t.me')), JSON.stringify(r.rows[0]));
  check('scrambled col row0 id', r.rows[0]?.groupId === '-100999', r.rows[0]?.groupId);
  check('scrambled col row0 name', r.rows[0]?.groupName === 'Hello Group', r.rows[0]?.groupName);
  check(
    'scrambled col row1 WA',
    Boolean(r.rows[1]?.inviteLink?.includes('whatsapp') && r.rows[1]?.groupId === '120363999@g.us'),
    JSON.stringify(r.rows[1]),
  );
}

{
  const csv = 'group_id;invite_link\n-10055;https://t.me/+semicol';
  const r = parseCsvJoinText(csv);
  check(
    'semicolon delimiter',
    r.rows.length === 1 && r.rows[0]?.groupId === '-10055' && Boolean(r.rows[0]?.inviteLink),
    JSON.stringify(r.rows),
  );
}

{
  const r = parseCsvJoinText('group_name\nSTMY Rico A\nSTMY Rico B');
  check(
    'name-only',
    r.rows.length === 2 && r.rows[0]?.groupName === 'STMY Rico A' && !r.rows[0]?.inviteLink,
    JSON.stringify(r.rows),
  );
}

{
  const csv = 'Group ID,Group Name,Invite Link\n-10077,Foo,https://t.me/+foo';
  const r = parseCsvJoinText(csv);
  check(
    'fuzzy header',
    r.rows.length === 1 && r.rows[0]?.groupId === '-10077' && r.rows[0]?.groupName === 'Foo',
    JSON.stringify(r.rows),
  );
}

{
  const a = absorbDetectableJoinCells(['', '  https://t.me/+x  ', 'My Name', '-1001']);
  check(
    'absorb all three',
    Boolean(a.inviteLink?.includes('t.me') && a.groupName === 'My Name' && a.groupId === '-1001'),
    JSON.stringify(a),
  );
}

{
  const r = parseCsvJoinText(',,\n   \n');
  check('empty skipped', r.rows.length === 0, String(r.rows.length));
}

{
  const c = classifyJoinImportFields({ groupId: 'https://t.me/+mis', groupName: 'X' });
  check(
    'classify moves invite from id',
    Boolean(c.inviteLink?.includes('t.me') && !c.groupId && c.groupName === 'X'),
    JSON.stringify(c),
  );
}

{
  // Tab-separated Excel-like
  const csv = 'group_id\tinvite_link\n-10088\thttps://t.me/+tabby';
  const r = parseCsvJoinText(csv);
  check(
    'tab delimiter',
    r.rows.length === 1 && r.rows[0]?.groupId === '-10088' && Boolean(r.rows[0]?.inviteLink),
    JSON.stringify(r.rows),
  );
}

{
  // Invite di kolom tengah, tanpa header
  const csv = 'STMY Mid,https://t.me/+midlink,-100333';
  const r = parseCsvJoinText(csv);
  check(
    'no-header mid invite',
    r.rows.length === 1 &&
      r.rows[0]?.groupName === 'STMY Mid' &&
      Boolean(r.rows[0]?.inviteLink) &&
      r.rows[0]?.groupId === '-100333',
    JSON.stringify(r.rows[0]),
  );
}

const failed = cases.filter((c) => !c.ok);
for (const c of cases) {
  console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${!c.ok && c.detail ? ` — ${c.detail}` : ''}`);
}
console.log('');
if (failed.length) {
  console.error(`${failed.length} failed / ${cases.length}`);
  process.exit(1);
}
console.log(`All ${cases.length} runtime parse tests passed`);
