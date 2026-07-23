import { createPortal } from 'react-dom';
import {
  useEffect,
  useRef,
  useState,
  type MouseEventHandler,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

/** Durasi exit — harus selaras CSS `.brand-modal-root` transition. */
export const BRAND_MODAL_EXIT_MS = 180;

interface BrandModalRootProps {
  children: ReactNode;
  /**
   * Visibility. Default `true` untuk caller yang sudah gate mount.
   * Saat `false`, fade-out dulu baru unmount (hindari flash).
   */
  open?: boolean;
  /** Dipanggil setelah animasi tutup selesai (aman clear state parent). */
  onExited?: () => void;
  /** Klik area gelap di luar panel. `undefined` = tidak tutup. */
  onBackdropClick?: (() => void) | undefined;
}

/**
 * Semua popup → document.body + z-index tinggi.
 * Enter/exit fade + slight rise — satu kontrak navigasi untuk semua modal.
 */
export function BrandModalRoot({
  children,
  open = true,
  onExited,
  onBackdropClick,
}: BrandModalRootProps) {
  const [rendered, setRendered] = useState(open);
  const [entered, setEntered] = useState(false);
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  useEffect(() => {
    if (open) {
      setRendered(true);
      const reduceMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) {
        setEntered(true);
        return;
      }
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setEntered(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }

    setEntered(false);
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = reduceMotion ? 0 : BRAND_MODAL_EXIT_MS;
    const timer = window.setTimeout(() => {
      setRendered(false);
      onExitedRef.current?.();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!rendered) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [rendered]);

  const handleBackdrop: MouseEventHandler<HTMLDivElement> | undefined =
    entered && onBackdropClick
      ? (event) => {
          if (event.target === event.currentTarget) onBackdropClick();
        }
      : undefined;

  if (!rendered) return null;

  return createPortal(
    <div
      className={cn('brand-modal-root', entered && 'brand-modal-root--open')}
      role="presentation"
      onClick={handleBackdrop}
    >
      {children}
    </div>,
    document.body,
  );
}
