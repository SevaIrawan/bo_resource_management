import { useState } from 'react';
import { AccountSlicerBar } from '@/components/group-monitoring/ContentAreaCard';
import { OperationsGlobalJobQueuePanel } from '@/components/group-monitoring/OperationsGlobalJobQueuePanel';
import { OperationsSlicerHeader } from '@/components/group-monitoring/OperationsSlicerHeader';
import { useGroupMonitoring } from '@/hooks/useGroupMonitoring';
import { useLanguage } from '@/hooks/useLanguage';
import type { Platform } from '@/types/database';

/** Tab Operations — Job Queue saja; stock overview sudah hidup di header card Account. */
export function OperationsMonitoringPanel() {
  const { t } = useLanguage();
  const { groups, loading } = useGroupMonitoring();
  const [platform, setPlatform] = useState<Platform>('whatsapp');

  return (
    <div className="page-stack flex h-full min-h-0 flex-col gap-(--layout-gap)">
      <section className="content-area-shell flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
        <header className="content-area-header shrink-0">
          <AccountSlicerBar>
            <OperationsSlicerHeader
              platform={platform}
              onPlatformChange={setPlatform}
            />
          </AccountSlicerBar>
        </header>

        <div className="content-area-body flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="operations-job-queue-view flex min-h-0 flex-1 flex-col overflow-hidden">
            {loading ? (
              <p className="account-sync-loading">{t('groupMonitoring.loadingAccounts')}</p>
            ) : (
              <OperationsGlobalJobQueuePanel
                groups={groups}
                platform={platform}
                brandFilter="all"
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
