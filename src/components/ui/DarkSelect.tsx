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
  disabledValues?: string[];
  placeholder?: string;
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
  disabledValues = [],
  placeholder,
  id,
  ariaLabel,
  className,
  triggerClassName,
  menuAlign = 'left',
  disabled = false,
}: DarkSelectProps) {
  const { phase, isOpen, isVisible, close, toggle } = useDarkSelectMenu();
  const wrapRef = useRef<HTMLDivElement>(null);
  const disabledSet = new Set(disabledValues);
  const selected = options.find((opt) => opt.value === value);
  const showPlaceholder = !selected && !value;
  const triggerLabel = selected?.label ?? placeholder ?? value;

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
        <span
          className={cn(
            'dark-select-trigger-label',
            showPlaceholder && 'dark-select-trigger-label--placeholder',
          )}
        >
          {triggerLabel}
        </span>
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
          {options.map((opt) => {
            const optionDisabled = disabledSet.has(opt.value);
            return (
            <li key={opt.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={value === opt.value}
                aria-disabled={optionDisabled || undefined}
                disabled={optionDisabled}
                className={cn(
                  'dark-select-menu-item',
                  value === opt.value && 'dark-select-menu-item--active',
                  optionDisabled && 'dark-select-menu-item--disabled',
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (optionDisabled) return;
                  selectOption(opt.value);
                }}
              >
                {opt.label}
              </button>
            </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
