import { createPortal } from 'react-dom';
import type { MouseEventHandler, ReactNode } from 'react';

interface BrandModalRootProps {
  children: ReactNode;
  /** Klik area gelap di luar panel. `undefined` = tidak tutup. */
  onBackdropClick?: (() => void) | undefined;
}

/**
 * Semua popup di-render ke document.body + z-index tinggi
 * supaya tidak tertutup/ overlap stacking context tabel atau layout.
 */
export function BrandModalRoot({ children, onBackdropClick }: BrandModalRootProps) {
  const handleBackdrop: MouseEventHandler<HTMLDivElement> | undefined = onBackdropClick
    ? (event) => {
        if (event.target === event.currentTarget) onBackdropClick();
      }
    : undefined;

  return createPortal(
    <div className="brand-modal-root" role="presentation" onClick={handleBackdrop}>
      {children}
    </div>,
    document.body,
  );
}
