import { ExternalLink, ShieldBan } from 'lucide-react';
import { BrandImage } from '@/components/brand/BrandImage';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import type { TicketItem } from '@/types/ticketMonitoringUi';

function TicketTypeBadge({ ticket }: { ticket: TicketItem }) {
  const { t } = useLanguage();

  const label =
    ticket.ticketType === 'missing_group'
      ? t('groupMonitoring.ticketPanel.badgeMissing')
      : t('groupMonitoring.ticketPanel.badgeNotAdmin');

  return (
    <span
      className={cn(
        'ticket-type-badge',
        ticket.accent === 'danger' ? 'ticket-type-badge--danger' : 'ticket-type-badge--warning',
      )}
    >
      {label}
    </span>
  );
}

function PlatformTag({ platform }: { platform: TicketItem['platform'] }) {
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

export function TicketCard({ ticket }: { ticket: TicketItem }) {
  const { t } = useLanguage();

  return (
    <article
      className={cn(
        'ticket-card',
        ticket.accent === 'danger' ? 'ticket-card--danger' : 'ticket-card--warning',
      )}
    >
      <div className="ticket-card-accent" aria-hidden />

      <div className="ticket-card-icon-wrap">
        <ShieldBan className="h-5 w-5" strokeWidth={1.75} />
      </div>

      <div className="ticket-card-body">
        <div className="ticket-card-title-row">
          <h3 className="ticket-card-title">{ticket.accountName}</h3>
          <TicketTypeBadge ticket={ticket} />
          <PlatformTag platform={ticket.platform} />
        </div>
        <p className="ticket-card-meta">
          {ticket.phoneOrUsername} · {ticket.brandName}
        </p>
        <p className="ticket-card-desc">{ticket.description}</p>
      </div>

      <div className="ticket-card-actions">
        <button type="button" className="ticket-link-btn">
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
          {t('groupMonitoring.ticketPanel.openGroupLink')}
        </button>
        <button type="button" className="ticket-process-btn">
          {t('groupMonitoring.ticketPanel.process')}
        </button>
      </div>
    </article>
  );
}

export function TicketCardList({ tickets }: { tickets: TicketItem[] }) {
  return (
    <div className="ticket-card-list">
      {tickets.map((ticket) => (
        <TicketCard key={ticket.id} ticket={ticket} />
      ))}
    </div>
  );
}
