import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminExpandCardProps {
  title: string;
  summary?: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function AdminExpandCard({
  title,
  summary,
  defaultExpanded = false,
  children,
}: AdminExpandCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <article className="admin-expand-card">
      <button
        type="button"
        className="admin-expand-card-header"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <ChevronDown
          className={cn('admin-expand-card-chevron', !expanded && 'admin-expand-card-chevron--collapsed')}
          aria-hidden
        />
        <span className="admin-expand-card-title">{title}</span>
        {summary ? <span className="admin-expand-card-summary">{summary}</span> : null}
      </button>
      {expanded ? <div className="admin-expand-card-body">{children}</div> : null}
    </article>
  );
}
