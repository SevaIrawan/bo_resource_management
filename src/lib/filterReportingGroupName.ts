export function filterReportingRowsByGroupName<T extends { groupName: string }>(
  rows: T[],
  search: string,
): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => row.groupName.toLowerCase().includes(q));
}
