import { ShieldBan } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TicketProcessModal } from '@/components/group-monitoring/TicketProcessModal';
import { BrandImage } from '@/components/brand/BrandImage';
import type { TicketSummaryGroup } from '@/lib/ticketGroups';
import { ticketTypeLabel } from '@/lib/ticketTypeLabel';
import {
  getTicketProcess,
  TICKET_WORKFLOW_CHANGED_EVENT,
  taskStatusI18nKey,
} from '@/lib/ticketWorkflowLocal';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';

const PROCESS_CAPTION_INTERVAL_MS = 3000;

function TicketProcessNewCaption({
  issueId,
  onOpen,
}: {
  issueId: string;
  onOpen: () => void;
}) {
  const { t } = useLanguage();
  const [showProcess, setShowProcess] = useState(true);
  const [taskStatus, setTaskStatus] = useState(() => getTicketProcess(issueId).taskStatus);

  useEffect(() => {
    const sync = () => setTaskStatus(getTicketProcess(issueId).taskStatus);
    window.addEventListener(TICKET_WORKFLOW_CHANGED_EVENT, sync);
    return () => window.removeEventListener(TICKET_WORKFLOW_CHANGED_EVENT, sync);
  }, [issueId]);

  useEffect(() => {
    if (taskStatus !== 'todo') return;
    const timer = window.setInterval(() => {
      setShowProcess((prev) => !prev);
    }, PROCESS_CAPTION_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [taskStatus]);

  const isTodo = taskStatus === 'todo';
  const isNew = isTodo && !showProcess;
  const label = isTodo
    ? showProcess
      ? t('groupMonitoring.ticketPanel.process')
      : t('groupMonitoring.ticketPanel.captionNew')
    : t(taskStatusI18nKey(taskStatus));

  return (
    <button
      type="button"
      className={cn(
        'ticket-process-caption',
        isNew && 'ticket-process-caption--new',
        taskStatus === 'complete' && 'ticket-process-caption--complete',
        taskStatus === 'interrupted' && 'ticket-process-caption--interrupted',
      )}
      aria-live={isTodo ? 'polite' : 'off'}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      {label}
    </button>
  );
}

function TicketTypeBadge({ group }: { group: TicketSummaryGroup }) {
  const { t } = useLanguage();
  const label = ticketTypeLabel(t, group.ticketType, 'badge');

  return (
    <span
      className={cn(
        'ticket-type-badge',
        group.accent === 'danger' ? 'ticket-type-badge--danger' : 'ticket-type-badge--warning',
      )}
    >
      {label}
    </span>
  );
}

function PlatformTag({ platform }: { platform: TicketSummaryGroup['platform'] }) {
  const asset = platform === 'whatsapp' ? 'whatsapp' : 'telegram';
  const short = platform === 'whatsapp' ? 'WA' : 'TG';

  return (
    <span
      className={cn(
        'ticket-platform-tag',
        platform === 'whatsapp' ? 'ticket-platform-tag--wa' : 'ticket-platform-tag--tg',
      )}
    >
      <BrandImage asset={asset} alt={platform} className="h-3 w-3" />
      {short}
    </span>
  );
}

function summaryHeadline(
  t: (key: string, vars?: Record<string, string | number>) => string,
  group: TicketSummaryGroup,
): string {
  const count = group.itemCount;
  switch (group.ticketType) {
    case 'missing_group':
      return t('groupMonitoring.ticketPanel.headlineMissing', { count });
    case 'not_admin':
      return t('groupMonitoring.ticketPanel.headlineNotAdmin', { count });
    case 'daily_junk_group':
      return t('groupMonitoring.ticketPanel.headlineDailyJunk', { count });
    case 'duplicate_group_id':
      return t('groupMonitoring.ticketPanel.headlineDuplicateId', { count });
    case 'duplicate_group_name':
      return t('groupMonitoring.ticketPanel.headlineDuplicateName', { count });
    default:
      return t('groupMonitoring.ticketPanel.headlineDefault', { count });
  }
}

export function TicketSummaryCard({
  group,
  onOpenDetail,
}: {
  group: TicketSummaryGroup;
  onOpenDetail?: (group: TicketSummaryGroup) => void;
}) {
  const { t } = useLanguage();
  const [processModalOpen, setProcessModalOpen] = useState(false);

  return (
    <article
      className={cn(
        'ticket-card',
        'ticket-card--interactive',
        group.accent === 'danger' ? 'ticket-card--danger' : 'ticket-card--warning',
      )}
      onDoubleClick={() => onOpenDetail?.(group)}
      title={t('groupMonitoring.ticketPanel.doubleClickHint')}
    >
      <div className="ticket-card-accent" aria-hidden />

      <div className="ticket-card-icon-wrap">
        <ShieldBan className="h-5 w-5" strokeWidth={1.75} />
      </div>

      <div className="ticket-card-body">
        <div className="ticket-card-title-row">
          <h3 className="ticket-card-title">{group.accountName}</h3>
          <TicketTypeBadge group={group} />
          <PlatformTag platform={group.platform} />
          <span className="ticket-item-count">
            {t('groupMonitoring.ticketPanel.itemCount', { count: group.itemCount })}
          </span>
        </div>
        <p className="ticket-card-meta">
          {group.phoneNumber} · {group.brandName}
        </p>
        <p className="ticket-card-desc">{summaryHeadline(t, group)}</p>
        <p className="ticket-card-hint">{t('groupMonitoring.ticketPanel.doubleClickHint')}</p>
      </div>

      <div className="ticket-card-actions">
        <TicketProcessNewCaption
          issueId={group.issueId}
          onOpen={() => setProcessModalOpen(true)}
        />
      </div>

      <TicketProcessModal
        group={group}
        open={processModalOpen}
        onClose={() => setProcessModalOpen(false)}
      />
    </article>
  );
}

export function TicketCardList({
  groups,
  onOpenDetail,
}: {
  groups: TicketSummaryGroup[];
  onOpenDetail?: (group: TicketSummaryGroup) => void;
}) {
  return (
    <div className="ticket-card-list">
      {groups.map((group) => (
        <TicketSummaryCard key={group.key} group={group} onOpenDetail={onOpenDetail} />
      ))}
    </div>
  );
}
