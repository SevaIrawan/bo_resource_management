export function filterReportingRowsByGroupSearch<
  T extends { groupName: string; groupId?: string; inviteLink?: string | null },
>(rows: T[], search: string): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    if (row.groupName.toLowerCase().includes(q)) return true;
    if (String(row.groupId ?? '')
      .toLowerCase()
      .includes(q))
      return true;
    if (
      String(row.inviteLink ?? '')
        .toLowerCase()
        .includes(q)
    )
      return true;
    return false;
  });
}

/** @deprecated gunakan filterReportingRowsByGroupSearch */
export function filterReportingRowsByGroupName<T extends { groupName: string }>(
  rows: T[],
  search: string,
): T[] {
  return filterReportingRowsByGroupSearch(rows, search);
}
