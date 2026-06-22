/** Satu pintu reload tab Reporting + Operations stock setelah daily/master berubah. */
export function dispatchReportingReload(): void {
  window.dispatchEvent(new Event('rm-reporting-reload'));
}

export function dispatchOperationsReload(): void {
  window.dispatchEvent(new Event('rm-operations-reload'));
}

export function dispatchMonitoringReloadAfterDailyWrite(): void {
  dispatchReportingReload();
  dispatchOperationsReload();
}
