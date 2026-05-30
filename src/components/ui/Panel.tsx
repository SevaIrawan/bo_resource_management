import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  accent: 'wa' | 'tg' | 'neutral';
  icon?: ReactNode;
}

export function StatCard({ label, value, hint, accent, icon }: StatCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface p-5',
        'transition-all hover:border-border hover:bg-bg-hover',
        accent === 'wa' && 'hover:border-wa/30',
        accent === 'tg' && 'hover:border-tg/30',
      )}
    >
      <div
        className={cn(
          'absolute -right-4 -top-4 h-24 w-24 rounded-full opacity-20 blur-2xl',
          accent === 'wa' && 'bg-wa',
          accent === 'tg' && 'bg-tg',
          accent === 'neutral' && 'bg-text-muted',
        )}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
          <p className="mt-2 text-3xl font-bold text-text-primary">{value}</p>
          {hint && <p className="mt-1 text-xs text-text-secondary">{hint}</p>}
        </div>
        {icon && (
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl',
              accent === 'wa' && 'bg-wa-glow text-wa',
              accent === 'tg' && 'bg-tg-glow text-tg',
              accent === 'neutral' && 'bg-bg-active text-text-muted',
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

interface PanelProps {
  title: string;
  description?: string;
  accent?: 'wa' | 'tg';
  children: ReactNode;
  action?: ReactNode;
}

export function Panel({ title, description, accent, children, action }: PanelProps) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-elevated">
      <div
        className={cn(
          'flex items-center justify-between border-b border-border-subtle px-5 py-4',
          accent === 'wa' && 'border-b-wa/20',
          accent === 'tg' && 'border-b-tg/20',
        )}
      >
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

interface PlaceholderTableProps {
  columns: string[];
  rows?: number;
}

export function PlaceholderTable({ columns, rows = 5 }: PlaceholderTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border-subtle bg-bg-surface">
            {columns.map((col) => (
              <th
                key={col}
                className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr
              key={i}
              className="border-b border-border-subtle/50 last:border-0 hover:bg-bg-hover/50"
            >
              {columns.map((col) => (
                <td key={col} className="px-4 py-3">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-bg-active" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface BadgeProps {
  children: ReactNode;
  variant: 'wa' | 'tg' | 'neutral' | 'warning';
}

export function Badge({ children, variant }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium',
        variant === 'wa' && 'bg-wa-glow text-wa border border-wa/20',
        variant === 'tg' && 'bg-tg-glow text-tg border border-tg/20',
        variant === 'neutral' && 'bg-bg-active text-text-secondary border border-border-subtle',
        variant === 'warning' && 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
      )}
    >
      {children}
    </span>
  );
}
