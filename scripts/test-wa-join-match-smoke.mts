/**
 * Smoke test — WhatsApp tidak regresi dari perubahan join/match shared.
 * Run: npx tsx scripts/test-wa-join-match-smoke.mts
 */
import {
  absorbDetectableJoinCells,
  looksLikeGroupId,
  parseCsvJoinText,
} from '../src/lib/parseCsvJoinImport.ts';
import {
  looksLikeInviteLink,
  normalizeGroupIdForMatch,
  normalizeInviteLinkForMatch,
  buildDailyMatchIndexes,
  findDailyRowForMaster,
} from '../src/lib/masterDailyMatch.ts';

type Case = { name: string; ok: boolean; detail?: string };
const cases: Case[] = [];
function check(name: string, ok: boolean, detail?: string) {
  cases.push({ name, ok, detail });
}

// WA invite normalize — full URL → hash (sama kontrak lama)
check(
  'WA invite full URL → hash',
  normalizeInviteLinkForMatch('https://chat.whatsapp.com/AbCdEf123_Xy') === 'abcdef123_xy',
  normalizeInviteLinkForMatch('https://chat.whatsapp.com/AbCdEf123_Xy'),
);
check(
  'WA invite /invite/ path',
  normalizeInviteLinkForMatch('https://chat.whatsapp.com/invite/ZzYyXxWw') === 'zzyyxxww',
);
check(
  'WA invite bare hash tetap hash',
  normalizeInviteLinkForMatch('AbCdEf123') === 'abcdef123' ||
    normalizeInviteLinkForMatch('AbCdEf123') === 'AbCdEf123'.toLowerCase(),
  normalizeInviteLinkForMatch('AbCdEf123'),
);

// WA group id normalize
check(
  'WA id numeric → @g.us',
  normalizeGroupIdForMatch('120363999') === '120363999@g.us',
);
check(
  'WA id @g.us tetap',
  normalizeGroupIdForMatch('120363999@g.us') === '120363999@g.us',
);
check('looksLikeGroupId WA', looksLikeGroupId('120363999@g.us'));
check('looksLikeInvite WA', looksLikeInviteLink('https://chat.whatsapp.com/HelloWorld'));

// Parse WA invite-only
{
  const r = parseCsvJoinText(
    'https://chat.whatsapp.com/AAA111\nhttps://chat.whatsapp.com/BBB222',
  );
  check('WA invite-only rows', r.rows.length === 2);
  check(
    'WA invite-only field',
    Boolean(r.rows[0]?.inviteLink?.includes('whatsapp') && !r.rows[0]?.groupId),
    JSON.stringify(r.rows[0]),
  );
}

// Parse WA hybrid
{
  const csv =
    'group_id,group_name,invite_link\n120363111@g.us,M24SG Alpha,https://chat.whatsapp.com/AlphaLink\n120363222@g.us,M24SG Beta,https://chat.whatsapp.com/BetaLink';
  const r = parseCsvJoinText(csv);
  check('WA hybrid rows', r.rows.length === 2);
  check(
    'WA hybrid fields',
    r.rows[0]?.groupId === '120363111@g.us' &&
      r.rows[0]?.groupName === 'M24SG Alpha' &&
      Boolean(r.rows[0]?.inviteLink?.includes('AlphaLink')),
    JSON.stringify(r.rows[0]),
  );
}

// Scrambled: invite, name, id (format WA produksi dengan hyphen)
{
  const csv =
    'https://chat.whatsapp.com/Scramble,WA Group Name,60146236838-1631140950@g.us';
  const r = parseCsvJoinText(csv);
  check(
    'WA scrambled cols',
    r.rows[0]?.groupId === '60146236838-1631140950@g.us' &&
      r.rows[0]?.groupName === 'WA Group Name' &&
      Boolean(r.rows[0]?.inviteLink?.includes('whatsapp')),
    JSON.stringify(r.rows[0]),
  );
}

// masterDailyMatch indexes — WA invite match still works
{
  const indexes = buildDailyMatchIndexes([
    {
      group_id: '120363AAA@g.us',
      group_name: 'Daily One',
      invite_link: 'https://chat.whatsapp.com/MatchMeNow',
      is_admin: 'yes',
    },
  ]);
  const found = findDailyRowForMaster(
    {
      group_id: 'other@g.us',
      group_name: 'Master Name Diff',
      invite_link: 'https://chat.whatsapp.com/MatchMeNow',
    },
    indexes,
  );
  check('WA findDaily by invite', found?.group_id === '120363AAA@g.us', found?.group_id);
  const byId = findDailyRowForMaster(
    {
      group_id: '120363AAA@g.us',
      group_name: null,
      invite_link: null,
    },
    indexes,
  );
  check('WA findDaily by id', byId?.group_id === '120363AAA@g.us');
}

{
  const a = absorbDetectableJoinCells([
    'https://chat.whatsapp.com/Abs',
    'Name Abs',
    '601128124524-1612832157@g.us',
  ]);
  check(
    'WA absorb three',
    a.inviteLink?.includes('whatsapp') &&
      a.groupName === 'Name Abs' &&
      a.groupId === '601128124524-1612832157@g.us',
    JSON.stringify(a),
  );
}

check(
  'WA hyphen @g.us is groupId',
  looksLikeGroupId('60146236838-1631140950@g.us'),
);
check(
  'WA Group Name bukan header palsu',
  parseCsvJoinText(
    'https://chat.whatsapp.com/X,WA Group Name,120363999@g.us',
  ).rows.length === 1,
);

// TG normalize jangan rusak WA hash collision
{
  const wa = normalizeInviteLinkForMatch('https://chat.whatsapp.com/SameHash99');
  const tg = normalizeInviteLinkForMatch('https://t.me/+SameHash99');
  check('WA vs TG invite keys beda', wa !== tg && wa === 'samehash99' && tg === 'tg:+samehash99');
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
console.log(`All ${cases.length} WA smoke tests passed`);
