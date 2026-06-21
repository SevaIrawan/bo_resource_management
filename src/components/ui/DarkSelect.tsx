import { ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useDarkSelectMenu } from '@/components/ui/useDarkSelectMenu';

export interface DarkSelectOption {
  value: string;
  label: string;
}

export interface DarkSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: DarkSelectOption[];
  id?: string;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  menuAlign?: 'left' | 'right';
  disabled?: boolean;
}

export function DarkSelect({
  value,
  onChange,
  options,
  id,
  ariaLabel,
  className,
  triggerClassName,
  menuAlign = 'left',
  disabled = false,
}: DarkSelectProps) {
  const { phase, isOpen, isVisible, close, toggle } = useDarkSelectMenu();
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (wrapRef.current?.contains(event.target as Node)) return;
      close();
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [close, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, isOpen]);

  function selectOption(next: string) {
    close();
    if (next !== value) onChange(next);
  }

  return (
    <div className={cn('dark-select-wrap', className)} ref={wrapRef}>
      <button
        type="button"
        id={id}
        className={cn('dark-select-trigger', triggerClassName, disabled && 'dark-select-trigger--disabled')}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          toggle();
        }}
      >
        <span className="dark-select-trigger-label">{selected?.label ?? value}</span>
        <ChevronDown
          className={cn('dark-select-trigger-icon', isOpen && 'dark-select-trigger-icon--open')}
          aria-hidden
        />
      </button>
      {isVisible && !disabled ? (
        <ul
          className={cn(
            'dark-select-menu',
            menuAlign === 'right' && 'dark-select-menu--align-right',
            (phase === 'open' || phase === 'opening') && 'dark-select-menu--open',
            phase === 'closing' && 'dark-select-menu--closing',
          )}
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
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectOption(opt.value);
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
