/** Mirror src/lib/accountMasterDailyCompare.ts — satu sumber logika audit live. */

export function dedupeDailyRowsByGroupId(rows) {
  const map = new Map();
  for (const row of rows) {
    const gid = String(row.group_id ?? '').trim();
    if (gid) map.set(gid, row);
  }
  return [...map.values()];
}

function normalizeGroupNameForMatch(name) {
  return String(name ?? '').trim().toLowerCase();
}

function buildRawSet(rows) {
  const s = new Set();
  for (const r of rows) {
    const gid = String(r.group_id ?? '').trim();
    if (gid) s.add(gid);
  }
  return s;
}

function isInSet(gid, set) {
  return set.has(String(gid ?? '').trim());
}

/** Identik computeAccountTicketBreakdown di app. */
export function computeAccountTicketBreakdown(masterRows, dailyRows) {
  const dailyDeduped = dedupeDailyRowsByGroupId(dailyRows);
  const masterDeduped = dedupeDailyRowsByGroupId(masterRows);

  const masterIdSet = buildRawSet(masterDeduped);
  const dailyIdSet = buildRawSet(dailyDeduped);

  const dailyByGid = new Map();
  for (const d of dailyDeduped) {
    const gid = String(d.group_id ?? '').trim();
    if (gid) dailyByGid.set(gid, d);
  }

  const masterByRawGid = new Map();
  for (const m of masterDeduped) {
    const gid = String(m.group_id ?? '').trim();
    if (gid && !masterByRawGid.has(gid)) masterByRawGid.set(gid, m);
  }

  const junk = [];
  for (const d of dailyDeduped) {
    const gid = String(d.group_id ?? '').trim();
    if (!gid || isInSet(gid, masterIdSet)) continue;
    junk.push({ groupId: gid, groupName: d.group_name, groupLink: d.invite_link });
  }

  const missing = [];
  const notAdmin = [];
  let joinedInMaster = 0;
  let adminInMaster = 0;

  for (const m of masterDeduped) {
    const gid = String(m.group_id ?? '').trim();
    if (!gid) continue;

    if (!isInSet(gid, dailyIdSet)) {
      missing.push({ groupId: gid, groupName: m.group_name, groupLink: m.invite_link });
      continue;
    }

    joinedInMaster += 1;
    const d = dailyByGid.get(gid);
    if (d?.is_admin === 'yes') adminInMaster += 1;
    else if (d) {
      notAdmin.push({
        groupId: gid,
        groupName: m.group_name ?? d.group_name,
        groupLink: m.invite_link ?? d.invite_link,
      });
    }
  }

  const duplicateGroupId = [];
  for (const d of dailyDeduped) {
    const gid = String(d.group_id ?? '').trim();
    const gname = String(d.group_name ?? '').trim();
    if (!gid || !isInSet(gid, masterIdSet)) continue;

    const canon = masterByRawGid.get(gid);
    if (!canon) continue;

    const canonName = String(canon.group_name ?? '').trim();
    if (gname && canonName && gname.toLowerCase() !== canonName.toLowerCase()) {
      duplicateGroupId.push({
        groupId: gid,
        groupName: d.group_name,
        groupLink: d.invite_link,
        deviceName: gname,
        masterName: canonName,
      });
    }
  }

  const duplicateGroupName = [];
  for (const d of dailyDeduped) {
    const gid = String(d.group_id ?? '').trim();
    const gnameNorm = normalizeGroupNameForMatch(d.group_name);
    if (!gid || !gnameNorm) continue;

    if (isInSet(gid, masterIdSet)) {
      const canon = masterByRawGid.get(gid);
      const canonNameNorm = normalizeGroupNameForMatch(canon?.group_name);
      if (canonNameNorm && canonNameNorm !== gnameNorm) continue;
    }

    const masterClash = masterDeduped.find((m) => {
      const mGid = String(m.group_id ?? '').trim();
      const mNameNorm = normalizeGroupNameForMatch(m.group_name);
      return mNameNorm === gnameNorm && mGid !== gid;
    });
    if (!masterClash) continue;

    duplicateGroupName.push({
      groupId: gid,
      groupName: d.group_name,
      groupLink: d.invite_link,
      clashMasterGroupId: String(masterClash.group_id ?? '').trim(),
    });
  }

  return {
    dailyY: dailyIdSet.size,
    masterX: masterIdSet.size,
    joinedInMaster,
    adminInMaster,
    junk,
    missing,
    notAdmin,
    duplicateGroupId,
    duplicateGroupName,
  };
}

export function bookmarkMetricsFromBreakdown(b) {
  return {
    groupsCurrent: b.dailyY,
    groupsTotal: b.masterX,
    adminCurrent: b.adminInMaster,
    adminTotal: b.masterX,
    junk: b.junk.length,
    missing: b.missing.length,
    notAdmin: b.notAdmin.length,
    duplicateGroupId: b.duplicateGroupId.length,
    duplicateGroupName: b.duplicateGroupName.length,
    gapYMinusX: b.dailyY - b.masterX,
    junkMinusMissing: b.junk.length - b.missing.length,
    notAdminFromJoined: b.joinedInMaster - b.adminInMaster,
  };
}
