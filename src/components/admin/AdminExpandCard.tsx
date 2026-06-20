import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminExpandCardGroupContextValue {
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
}

const AdminExpandCardGroupContext = createContext<AdminExpandCardGroupContextValue | null>(
  null,
);

export function AdminExpandCardGroup({ children }: { children: ReactNode }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <AdminExpandCardGroupContext.Provider value={{ expandedId, setExpandedId }}>
      {children}
    </AdminExpandCardGroupContext.Provider>
  );
}

interface AdminExpandCardProps {
  /** Wajib di dalam AdminExpandCardGroup — satu card open, sisanya auto close */
  cardId?: string;
  title: string;
  summary?: string;
  headerAside?: ReactNode;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function AdminExpandCard({
  cardId,
  title,
  summary,
  headerAside,
  defaultExpanded = false,
  children,
}: AdminExpandCardProps) {
  const group = useContext(AdminExpandCardGroupContext);
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);

  const inGroup = group !== null && cardId !== undefined;
  const expanded = inGroup ? group.expandedId === cardId : localExpanded;

  function handleToggle() {
    if (inGroup && cardId) {
      group.setExpandedId(expanded ? null : cardId);
      return;
    }
    setLocalExpanded((value) => !value);
  }

  return (
    <article className="admin-expand-card">
      <div className="admin-expand-card-header">
        <button
          type="button"
          className="admin-expand-card-header-toggle"
          onClick={handleToggle}
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn('admin-expand-card-chevron', !expanded && 'admin-expand-card-chevron--collapsed')}
            aria-hidden
          />
          <span className="admin-expand-card-title">{title}</span>
        </button>
        {headerAside ? <div className="admin-expand-card-header-aside">{headerAside}</div> : null}
        {summary ? <span className="admin-expand-card-summary">{summary}</span> : null}
      </div>
      {expanded ? <div className="admin-expand-card-body">{children}</div> : null}
    </article>
  );
}
