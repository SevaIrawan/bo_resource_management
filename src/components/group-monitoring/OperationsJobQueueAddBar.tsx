import { useEffect, useMemo, useState } from 'react';
import { Settings } from 'lucide-react';
import { DarkSelect } from '@/components/ui/DarkSelect';
import { JobQueueSetupHost } from '@/components/group-monitoring/JobQueueSetupHost';
import {
  readTelegramWorkerSettings,
  readWhatsAppWorkerSettings,
} from '@/config/workerPlatformSettings';
import { useLanguage } from '@/hooks/useLanguage';
import type { JobQueueTaskType, JobQueueTaskTypeSelection } from '@/lib/operationsJobQueueUi';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

interface OperationsJobQueueAddBarProps {
  groups: AccountBrandGroup[];
  platform: Platform;
  brandFilter: string;
  taskType: JobQueueTaskTypeSelection;
  onTaskTypeChange: (taskType: JobQueueTaskTypeSelection) => void;
}

function resolveBrandName(brandFilter: string, selectedBrand: string, brandOptions: string[]): string {
  if (brandFilter !== 'all') return brandFilter;
  if (selectedBrand && brandOptions.includes(selectedBrand)) return selectedBrand;
  return '';
}

/** Thin UI bar — setup/enqueue lewat JobQueueSetupHost (shared). */
export function OperationsJobQueueAddBar({
  groups,
  platform,
  brandFilter,
  taskType,
  onTaskTypeChange,
}: OperationsJobQueueAddBarProps) {
  const { t } = useLanguage();

  const brandOptions = useMemo(() => {
    return [
      ...new Set(
        groups
          .filter((g) => g.accounts.some((a) => a.platform === platform))
          .map((g) => g.brandName.trim())
          .filter(Boolean),
      ),
    ].sort();
  }, [groups, platform]);

  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [superAdminAccountId, setSuperAdminAccountId] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  const activeBrand = resolveBrandName(brandFilter, selectedBrand, brandOptions);

  useEffect(() => {
    setSelectedBrand('');
    setSelectedAccountId('');
    setSuperAdminAccountId('');
  }, [platform]);

  const platformAccounts = useMemo(() => {
    const group = groups.find((g) => g.brandName === activeBrand);
    if (!group) return [];
    return group.accounts.filter((row) => row.platform === platform);
  }, [activeBrand, groups, platform]);

  const validAccounts = useMemo(
    () => platformAccounts.filter((row) => row.sessionStatus === 'valid'),
    [platformAccounts],
  );

  useEffect(() => {
    setSelectedAccountId('');
    setSuperAdminAccountId('');
  }, [activeBrand]);

  const selectedAccounts = useMemo(() => {
    const account = validAccounts.find((row) => row.id === selectedAccountId);
    return account ? [account] : [];
  }, [selectedAccountId, validAccounts]);

  const superAdminAccount = validAccounts.find((row) => row.id === superAdminAccountId);
  const setAdminTargetCandidates = validAccounts.filter((row) => row.id !== superAdminAccountId);

  const workerSettings =
    platform === 'telegram' ? readTelegramWorkerSettings() : readWhatsAppWorkerSettings();

  const setupReady = useMemo(() => {
    if (!taskType) return false;
    if (!activeBrand) return false;
    if (taskType === 'set_admin') {
      return Boolean(superAdminAccountId && superAdminAccount);
    }
    if (taskType === 'exit_delete_group') {
      return (
        Boolean(selectedAccountId && selectedAccounts.length > 0) &&
        workerSettings.leaveDelete.leaveEnabled
      );
    }
    return Boolean(selectedAccountId && selectedAccounts.length > 0);
  }, [
    activeBrand,
    selectedAccountId,
    selectedAccounts.length,
    superAdminAccount,
    superAdminAccountId,
    taskType,
    workerSettings,
  ]);

  const brandSelectOptions = useMemo(
    () => brandOptions.map((brand) => ({ value: brand, label: brand })),
    [brandOptions],
  );

  const accountSelectOptions = useMemo(
    () => platformAccounts.map((row) => ({ value: row.id, label: row.accountName })),
    [platformAccounts],
  );

  const invalidAccountIds = useMemo(
    () => platformAccounts.filter((row) => row.sessionStatus !== 'valid').map((row) => row.id),
    [platformAccounts],
  );

  const superAdminSelectOptions = useMemo(
    () => validAccounts.map((row) => ({ value: row.id, label: row.accountName })),
    [validAccounts],
  );

  const actionTabs = [
    ['join', 'operations.jobQueue.tabJoin'],
    ['create_group', 'operations.jobQueue.tabCreateGroup'],
    ['set_admin', 'operations.jobQueue.tabSetAdmin'],
    ['exit_delete_group', 'operations.jobQueue.tabExitDelete'],
  ] as const;

  const taskTypeSelectOptions = useMemo(
    () => actionTabs.map(([value, labelKey]) => ({ value, label: t(labelKey) })),
    [t],
  );

  if (brandOptions.length === 0) {
    return null;
  }

  return (
    <section className="operations-job-queue-add">
      <div className="operations-job-queue-execute-panel">
        <div className="operations-job-queue-add-filters">
          <div className="operations-job-queue-field operations-job-queue-field--inline">
            <DarkSelect
              value={taskType}
              onChange={(value) => {
                onTaskTypeChange(value as JobQueueTaskType);
                setFeedback(null);
              }}
              options={taskTypeSelectOptions}
              ariaLabel={t('operations.jobQueue.actionTabsLabel')}
              triggerClassName="account-slicer-select operations-job-queue-select"
              placeholder={t('operations.jobQueue.selectTask')}
            />
          </div>

          {brandFilter === 'all' ? (
            <div className="operations-job-queue-field operations-job-queue-field--inline">
              <DarkSelect
                value={selectedBrand}
                onChange={setSelectedBrand}
                options={brandSelectOptions}
                ariaLabel={t('operations.jobQueue.colBrand')}
                triggerClassName="account-slicer-select operations-job-queue-select"
                disabled={brandSelectOptions.length === 0}
                placeholder={t('operations.jobQueue.selectBrand')}
              />
            </div>
          ) : (
            <div className="operations-job-queue-field operations-job-queue-field--inline operations-job-queue-field--readonly">
              <strong>{brandFilter}</strong>
            </div>
          )}

          {taskType === 'set_admin' ? (
            <div className="operations-job-queue-field operations-job-queue-field--inline">
              <DarkSelect
                value={superAdminAccountId}
                onChange={setSuperAdminAccountId}
                options={superAdminSelectOptions}
                ariaLabel={t('operations.jobQueue.setAdminSuperAccount')}
                triggerClassName="account-slicer-select operations-job-queue-select"
                disabled={!activeBrand || superAdminSelectOptions.length === 0}
                placeholder={t('operations.jobQueue.selectAccount')}
              />
            </div>
          ) : (
            <div className="operations-job-queue-field operations-job-queue-field--inline">
              <DarkSelect
                value={selectedAccountId}
                onChange={setSelectedAccountId}
                options={accountSelectOptions}
                disabledValues={invalidAccountIds}
                ariaLabel={t('operations.jobQueue.account')}
                triggerClassName="account-slicer-select operations-job-queue-select"
                disabled={!activeBrand}
                placeholder={t('operations.jobQueue.selectAccount')}
              />
            </div>
          )}

          <div className="operations-job-queue-add-filters__actions">
            <button
              type="button"
              className="operations-job-queue-setup-btn"
              disabled={!setupReady}
              onClick={() => {
                setFeedback(null);
                setSetupOpen(true);
              }}
              aria-label={t('operations.jobQueue.setup')}
              title={t('operations.jobQueue.setup')}
            >
              <Settings className="operations-job-queue-setup-btn__icon" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>

        <div
          className="operations-job-queue-feedback-slot"
          aria-live="polite"
        >
          {feedback ? <p className="operations-schedule-join-feedback">{feedback}</p> : null}
        </div>
      </div>

      {taskType ? (
        <JobQueueSetupHost
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          onSaved={setFeedback}
          onFeedback={setFeedback}
          taskType={taskType}
          platform={platform}
          activeBrand={activeBrand}
          selectedAccounts={taskType === 'set_admin' ? [] : selectedAccounts}
          superAdminAccount={superAdminAccount}
          targetAccountCandidates={setAdminTargetCandidates}
          validAccounts={validAccounts}
        />
      ) : null}
    </section>
  );
}
