import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';

interface PermissionLockedButtonProps {
  className?: string;
  title?: string;
  /** Tombol ikon kecil (sync / hapus slot). */
  variant?: 'icon' | 'text';
  children?: ReactNode;
}

/** Tombol non-aktif dengan ikon gembok — hak hanya untuk username admin. */
export function PermissionLockedButton({
  className,
  title,
  variant = 'icon',
  children,
}: PermissionLockedButtonProps) {
  const { t } = useLanguage();
  const label = title ?? t('permissions.adminOnlyAction');

  if (variant === 'text') {
    return (
      <button
        type="button"
        className={cn('permission-locked-btn permission-locked-btn--text', className)}
        disabled
        title={label}
        aria-label={label}
      >
        <Lock className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={cn('permission-locked-btn', className)}
      disabled
      title={label}
      aria-label={label}
    >
      <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
    </button>
  );
}
