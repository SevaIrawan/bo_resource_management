import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ReportingTableShellProps {
  header: ReactNode;
  children: ReactNode;
  tableClassName?: string;
}

/** Satu tabel utuh — header & body share lebar kolom (auto dari konten). */
export function ReportingTableShell({
  header,
  children,
  tableClassName,
}: ReportingTableShellProps) {
  return (
    <div className="reporting-table-shell">
      <div className="reporting-table-scroll">
        <table className={cn('join-report-table', tableClassName)}>
          <thead className="reporting-table-head">{header}</thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}
