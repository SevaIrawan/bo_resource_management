import { useCallback, useEffect, useRef, useState } from 'react';

const MENU_ANIM_MS = 160;

type MenuPhase = 'closed' | 'opening' | 'open' | 'closing';

export function useDarkSelectMenu() {
  const [phase, setPhase] = useState<MenuPhase>('closed');
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const close = useCallback(() => {
    if (phase === 'closed' || phase === 'closing') return;
    clearTimer();
    setPhase('closing');
    timerRef.current = window.setTimeout(() => {
      setPhase('closed');
      timerRef.current = null;
    }, MENU_ANIM_MS);
  }, [clearTimer, phase]);

  const open = useCallback(() => {
    clearTimer();
    setPhase('opening');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase('open'));
    });
  }, [clearTimer]);

  const toggle = useCallback(() => {
    if (phase === 'open' || phase === 'opening') {
      close();
      return;
    }
    open();
  }, [close, open, phase]);

  const isOpen = phase === 'open' || phase === 'opening';
  const isVisible = phase !== 'closed';

  return {
    phase,
    isOpen,
    isVisible,
    open,
    close,
    toggle,
  };
}
