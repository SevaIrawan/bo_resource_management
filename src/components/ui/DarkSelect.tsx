import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface DarkSelectOption {
  value: string;
  label: string;
}

export interface DarkSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: DarkSelectOption[];
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  menuAlign?: 'left' | 'right';
}

export function DarkSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  triggerClassName,
  menuAlign = 'left',
}: DarkSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className={cn('dark-select-wrap', className)} ref={wrapRef}>
      <button
        type="button"
        className={cn('dark-select-trigger', triggerClassName)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="dark-select-trigger-label">{selected?.label ?? value}</span>
        <ChevronDown
          className={cn('dark-select-trigger-icon', open && 'dark-select-trigger-icon--open')}
          aria-hidden
        />
      </button>
      {open ? (
        <ul
          className={cn('dark-select-menu', menuAlign === 'right' && 'dark-select-menu--align-right')}
          role="listbox"
          aria-label={ariaLabel}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {options.map((opt) => (
            <li key={opt.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={value === opt.value}
                className={cn(
                  'dark-select-menu-item',
                  value === opt.value && 'dark-select-menu-item--active',
                )}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
