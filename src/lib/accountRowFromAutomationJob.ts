import type { AutomationJobRecord } from '@/types/automationJob';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';

/** Stub baris akun dari job queue — untuk buildAutomationJobRunContext. */
export function accountRowFromAutomationJob(job: AutomationJobRecord): AccountBrandRow {
  return {
    id: job.accountId,
    accountName: job.accountName,
    platform: job.platform,
    phoneNumber: job.expectedPhone ?? '',
    brandName: job.brandName,
    status: 'active',
    groupsCurrent: 0,
    groupsTotal: 0,
    joinedInMaster: 0,
    adminCurrent: 0,
    adminTotal: 0,
    sessionStatus: 'valid',
    actionProcess: null,
    syncState: 'synced',
    isMisaligned: false,
    lastSyncAt: null,
  };
}
