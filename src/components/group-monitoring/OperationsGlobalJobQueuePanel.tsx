import { useCallback, useEffect, useMemo, useState } from 'react';
import { OperationsJobQueueAddBar } from '@/components/group-monitoring/OperationsJobQueueAddBar';
import { OperationsJobQueueTable } from '@/components/group-monitoring/OperationsJobQueueTable';
import {
  cancelAutomationJob,
  fetchJobQueueSnapshot,
  isJobQueueAvailable,
  pauseAutomationJob,
  removeAutomationJobs,
  runAutomationJob,
  subscribeJobQueueChanged,
} from '@/lib/automationJobQueueClient';
import {
  jobQueueQueueTitleKey,
  jobQueueTaskTypeToAction,
  type JobQueueTaskType,
} from '@/lib/operationsJobQueueUi';
import { useLanguage } from '@/hooks/useLanguage';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { AutomationJobListFilter, AutomationJobQueueSnapshot } from '@/types/automationJob';
import type { Platform } from '@/types/database';

interface OperationsGlobalJobQueuePanelProps {
  groups: AccountBrandGroup[];
  platform: Platform;
  brandFilter: string;
}

/** Bookmark Job Queue — table antrian + tambah join dari master missing. */
export function OperationsGlobalJobQueuePanel({
  groups,
  platform,
  brandFilter,
}: OperationsGlobalJobQueuePanelProps) {
  const { t } = useLanguage();
  const desktopReady = isJobQueueAvailable();
  const [snapshot, setSnapshot] = useState<AutomationJobQueueSnapshot | null>(null);
  const [taskType, setTaskType] = useState<JobQueueTaskType>('join');

  const listFilter = useMemo((): AutomationJobListFilter => {
    const filter: AutomationJobListFilter = { platform };
    if (brandFilter !== 'all') filter.brandName = brandFilter;
    return filter;
  }, [brandFilter, platform]);

  const filteredJobs = useMemo(() => {
    const action = jobQueueTaskTypeToAction(taskType);
    return (snapshot?.jobs ?? []).filter((job) => job.action === action);
  }, [snapshot?.jobs, taskType]);

  const reload = useCallback(async () => {
    const next = await fetchJobQueueSnapshot(listFilter);
    setSnapshot(next);
  }, [listFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    return subscribeJobQueueChanged(() => {
      void reload();
    });
  }, [reload]);

  async function handleCancel(jobId: string) {
    await cancelAutomationJob(jobId);
    await reload();
  }

  async function handleRun(jobId: string) {
    await runAutomationJob(jobId);
    await reload();
  }

  async function handlePause(jobId: string) {
    await pauseAutomationJob(jobId);
    await reload();
  }

  async function handleDeleteSelected(jobIds: string[]) {
    await removeAutomationJobs(jobIds);
    await reload();
  }

  if (!desktopReady) {
    return (
      <div className="operations-job-queue-only">
        <p className="operations-job-queue-note">{t('operations.jobQueue.desktopRequired')}</p>
      </div>
    );
  }

  return (
    <div className="operations-job-queue-only">
      <section className="operations-job-queue-zone operations-job-queue-zone--add">
        <OperationsJobQueueAddBar
          groups={groups}
          platform={platform}
          brandFilter={brandFilter}
          taskType={taskType}
          onTaskTypeChange={setTaskType}
        />
      </section>

      <section className="operations-job-queue-zone operations-job-queue-zone--table">
        <div className="operations-job-queue-zone-head">
          <h3 className="operations-job-queue-zone-title">{t(jobQueueQueueTitleKey(taskType))}</h3>
        </div>
        <OperationsJobQueueTable
          taskType={taskType}
          jobs={filteredJobs}
          showBrand={brandFilter === 'all'}
          onRun={(jobId) => void handleRun(jobId)}
          onPause={(jobId) => void handlePause(jobId)}
          onCancel={(jobId) => void handleCancel(jobId)}
          onDeleteSelected={(jobIds) => void handleDeleteSelected(jobIds)}
        />
      </section>
    </div>
  );
}
