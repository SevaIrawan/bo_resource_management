import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SidebarLabelProps {
  collapsed: boolean;
  className?: string;
  children: ReactNode;
}

/** Label sidebar — fade + slide, tidak unmount (hindari flash/lompat). */
export function SidebarLabel({ collapsed, className, children }: SidebarLabelProps) {
  return (
    <span
      aria-hidden={collapsed}
      className={cn(
        'sidebar-label block min-w-0 truncate text-sm font-medium',
        collapsed ? 'sidebar-label--collapsed' : 'sidebar-label--expanded',
        className,
      )}
    >
      {children}
    </span>
  );
}
